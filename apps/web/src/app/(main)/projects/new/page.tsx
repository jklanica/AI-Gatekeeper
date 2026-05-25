'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: (data) => {
      toast.success('Project created successfully');
      router.push(`/projects/${data.id}`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create project');
    }
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ name, description });
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Card className="border-zinc-800 bg-zinc-900/50 shadow-xl backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-zinc-100">Create New Project</CardTitle>
          <CardDescription className="text-zinc-400">
            A project groups together your API keys, team members, and usage analytics.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-zinc-300">Project Name <span className="text-red-400">*</span></Label>
              <Input 
                id="name" 
                placeholder="e.g. Acme Internal Search" 
                className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-zinc-300">Description</Label>
              <Textarea 
                id="description" 
                placeholder="Brief description of what this project does..." 
                className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100 resize-none h-24"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end space-x-3 pt-4 border-t border-zinc-800">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => router.back()}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
              disabled={createMutation.isPending || !name}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
