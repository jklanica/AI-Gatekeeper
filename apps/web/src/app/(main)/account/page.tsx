'use client';

import { useState, useEffect } from 'react';

import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { User } from 'lucide-react';

export default function AccountPage() {

  const { data: user, isLoading, refetch } = trpc.auth.me.useQuery();
  
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (user?.displayName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayName(user.displayName);
    }
  }, [user?.displayName]);

  const updateMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success('Account updated successfully');
      setPassword('');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update account');
    }
  });

  if (isLoading) return <div className="text-zinc-400 p-8">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Account Settings</h1>
        <p className="text-zinc-400 mt-1">Manage your profile and security preferences.</p>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/50 shadow-xl backdrop-blur-xl">
        <form onSubmit={(e) => {
          e.preventDefault();
          updateMutation.mutate({ displayName: displayName || user?.displayName || '', password: password || undefined });
        }}>
        <CardHeader>
          <div className="flex items-center space-x-4">
            <div className="h-16 w-16 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
              <User className="h-8 w-8 text-zinc-400" />
            </div>
            <div>
              <CardTitle className="text-xl text-zinc-100">{user?.displayName}</CardTitle>
              <CardDescription className="text-zinc-400">{user?.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 py-4 border-t border-zinc-800">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-zinc-200">Profile Information</h3>
            <div className="grid gap-2">
              <Label htmlFor="displayName" className="text-zinc-300">Display Name</Label>
              <Input 
                id="displayName" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100 max-w-md"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-zinc-300">Email Address</Label>
              <Input 
                id="email" 
                disabled
                value={user?.email || ''}
                className="bg-zinc-900 border-zinc-800 text-zinc-500 max-w-md cursor-not-allowed"
              />
              <p className="text-xs text-zinc-500">Email address cannot be changed.</p>
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t border-zinc-800">
            <h3 className="text-lg font-medium text-zinc-200">Security</h3>
            <div className="grid gap-2">
              <Label htmlFor="password" className="text-zinc-300">New Password</Label>
              <Input 
                id="password" 
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100 max-w-md"
                minLength={6}
              />
              <p className="text-xs text-zinc-500">Leave blank to keep current password.</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end pt-4 border-t border-zinc-800">
          <Button 
            type="submit"
            className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardFooter>
        </form>
      </Card>
    </div>
  );
}
