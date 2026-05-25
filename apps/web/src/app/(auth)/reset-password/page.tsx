'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

/**
 * ResetPasswordForm Component
 * 
 * Inner form component for handling the password reset process.
 * Extracts the reset token from the URL and submits the new password to the backend.
 * 
 * @returns {JSX.Element} The rendered reset password form.
 */
function ResetPasswordForm() {
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

/**
 * ResetPasswordPage Component
 * 
 * Wraps the ResetPasswordForm in a React Suspense boundary since it depends
 * on URL search parameters (`useSearchParams`).
 * 
 * @returns {JSX.Element} The rendered reset password page wrapper.
 */
export default function ResetPasswordPage() {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl shadow-2xl">
      <CardHeader className="space-y-2 text-center">
        <div className="flex justify-center mb-2">
          <div className="p-3 rounded-full bg-zinc-800/50 ring-1 ring-zinc-700/50">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight text-zinc-100">Set New Password</CardTitle>
        <CardDescription className="text-zinc-400">
          Enter your new password below.
        </CardDescription>
      </CardHeader>
      <Suspense fallback={<div className="p-8 text-center text-zinc-400">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </Card>
  );
}
