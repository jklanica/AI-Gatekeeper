'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';

/**
 * ForgotPasswordPage Component
 * 
 * Allows users to request a password reset link by providing their email address.
 * Simulates email delivery via server console logging in development.
 * 
 * @returns {JSX.Element} The rendered forgot password page.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  
  const resetMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => {
      toast.success('If an account exists, a reset link has been printed to the server console.');
      setEmail('');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to request reset');
    }
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resetMutation.mutate({ email });
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl shadow-2xl">
      <CardHeader className="space-y-2 text-center">
        <div className="flex justify-center mb-2">
          <div className="p-3 rounded-full bg-zinc-800/50 ring-1 ring-zinc-700/50">
            <KeyRound className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight text-zinc-100">Reset Password</CardTitle>
        <CardDescription className="text-zinc-400">
          Enter your email to receive a password reset link.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-300">Email</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="name@example.com" 
              className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 pt-4">
          <Button 
            type="submit" 
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
            disabled={resetMutation.isPending}
          >
            {resetMutation.isPending ? 'Sending...' : 'Send Reset Link'}
          </Button>
          <div className="text-sm text-center text-zinc-400">
            Remember your password?{' '}
            <Link href="/login" className="text-emerald-400 hover:underline">
              Back to Sign In
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
