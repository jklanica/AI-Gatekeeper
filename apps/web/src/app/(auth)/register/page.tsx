'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Account created successfully');
        router.push('/dashboard');
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to register');
    }
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate({ email, password, displayName });
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl shadow-2xl">
      <CardHeader className="space-y-2 text-center">
        <div className="flex justify-center mb-2">
          <div className="p-3 rounded-full bg-zinc-800/50 ring-1 ring-zinc-700/50">
            <Shield className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight text-zinc-100">Create an account</CardTitle>
        <CardDescription className="text-zinc-400">
          Enter your details to get started with AI-Gatekeeper
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-zinc-300">Display Name</Label>
            <Input 
              id="displayName" 
              type="text" 
              placeholder="John Doe" 
              className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
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
          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300">Password</Label>
            <Input 
              id="password" 
              type="password" 
              className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 pt-4">
          <Button 
            type="submit" 
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? 'Creating...' : 'Create Account'}
          </Button>
          <div className="text-sm text-center text-zinc-400">
            Already have an account?{' '}
            <Link href="/login" className="text-emerald-400 hover:underline">
              Sign in
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
