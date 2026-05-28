'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '@/trpc/client';
import { CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * ResetPasswordForm Component
 * 
 * Inner form component for handling the password reset process.
 * Extracts the reset token from the URL and submits the new password to the backend.
 * 
 * @returns {JSX.Element} The rendered reset password form.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      toast.success('Password updated successfully');
      router.push('/login');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to reset password');
    }
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error('Missing reset token');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    resetMutation.mutate({ token, newPassword: password });
  };

  if (!token) {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl text-zinc-200">Invalid or Missing Token</h2>
        <p className="text-zinc-400 mt-2">Please request a new password reset link.</p>
        <Button onClick={() => router.push('/forgot-password')} className="mt-4 bg-zinc-800 text-zinc-100">
          Back to Forgot Password
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-zinc-300">New Password</Label>
          <Input 
            id="password" 
            type="password" 
            placeholder="••••••••" 
            className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-zinc-300">Confirm Password</Label>
          <Input 
            id="confirmPassword" 
            type="password" 
            placeholder="••••••••" 
            className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4 pt-4">
        <Button 
          type="submit" 
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
          disabled={resetMutation.isPending}
        >
          {resetMutation.isPending ? 'Updating...' : 'Update Password'}
        </Button>
      </CardFooter>
    </form>
  );
}
