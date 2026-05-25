import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, JWT_SECRET } from '../trpc';
import { db, users, passwordResetTokens } from '@ai-gatekeeper/db';
import { eq, and, gt, lt } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { TRPCError } from '@trpc/server';

export const authRouter = router({
  register: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(6), displayName: z.string() }))
    .mutation(async ({ input }) => {
      const existingUser = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (existingUser.length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email already exists' });
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      const [newUser] = await db.insert(users).values({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
      }).returning();

      const token = await new SignJWT({ sub: newUser.id })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(JWT_SECRET);

      const cookieStore = await cookies();
      cookieStore.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });

      return { success: true, user: { id: newUser.id, email: newUser.email, displayName: newUser.displayName } };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ input }) => {
      const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (!user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      }

      const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
      if (!isPasswordValid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      }

      const token = await new SignJWT({ sub: user.id })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(JWT_SECRET);

      const cookieStore = await cookies();
      cookieStore.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });

      return { success: true };
    }),

  logout: publicProcedure.mutation(async () => {
    const cookieStore = await cookies();
    cookieStore.delete('auth_token');
    return { success: true };
  }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (!user) {
        // Return success anyway to prevent email enumeration
        return { success: true };
      }

      // Clean up expired tokens to prevent table bloat
      await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, new Date()));

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      const [resetToken] = await db.insert(passwordResetTokens).values({
        userId: user.id,
        expiresAt,
      }).returning();

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      console.log(`\n========================================\n🔐 PASSWORD RESET LINK (Dev Only):\n${appUrl}/reset-password?token=${resetToken.token}\n========================================\n`);

      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string().uuid(), newPassword: z.string().min(6) }))
    .mutation(async ({ input }) => {
      const [resetRecord] = await db.select()
        .from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.token, input.token),
          gt(passwordResetTokens.expiresAt, new Date())
        )).limit(1);

      if (!resetRecord) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or expired reset token' });
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 10);
      await db.update(users).set({ passwordHash }).where(eq(users.id, resetRecord.userId));
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, input.token));

      return { success: true };
    }),

  me: protectedProcedure.query(({ ctx }) => {
    return { id: ctx.user.id, email: ctx.user.email, displayName: ctx.user.displayName };
  }),

  updateProfile: protectedProcedure
    .input(z.object({ displayName: z.string(), password: z.string().min(6, 'Password must be at least 6 characters').optional() }))
    .mutation(async ({ input, ctx }) => {
      const updates: Partial<{ displayName: string; passwordHash: string }> = { displayName: input.displayName };
      
      if (input.password) {
        updates.passwordHash = await bcrypt.hash(input.password, 10);
      }
      
      await db.update(users).set(updates).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
});
