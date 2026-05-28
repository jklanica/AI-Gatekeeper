'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

/**
 * Props for ProjectSettingsTab
 */
interface ProjectSettingsTabProps {
  projectId: string;
}

/**
 * ProjectSettingsTab Component
 * 
 * Accessible only to project owners. Manages the upstream provider API keys
 * and dangerous actions like deleting the project.
 * 
 * @param {ProjectSettingsTabProps} props - Component properties.
 * @returns {JSX.Element} The rendered settings tab content.
 */
export function ProjectSettingsTab({ projectId }: ProjectSettingsTabProps) {
  const router = useRouter();

  // Fetch project details to show existing key status
  const { data: project, refetch: refetchProject } = trpc.projects.get.useQuery({ id: projectId });

  // State for provider API key inputs
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [googleKeyInput, setGoogleKeyInput] = useState('');

  // State for danger zone
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Mutations
  const updateProviderKeysMutation = trpc.projects.updateProviderApiKeys.useMutation({
    onSuccess: () => {
      toast.success('Provider API keys updated successfully');
      setOpenaiKeyInput('');
      setAnthropicKeyInput('');
      setGoogleKeyInput('');
      refetchProject();
    },
    onError: (err) => toast.error(err.message || 'Failed to update provider API keys')
  });

  const deleteProjectMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success('Project deleted');
      router.push('/dashboard');
    },
    onError: (err) => toast.error(err.message || 'Failed to delete project')
  });

  const isSavingKeys = updateProviderKeysMutation.isPending;
  const hasKeysToSave = openaiKeyInput || anthropicKeyInput || googleKeyInput;

  return (
    <div className="space-y-6">
      {/* Provider API Keys Configuration */}
      <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-xl text-zinc-100">Provider Settings</CardTitle>
          <CardDescription className="text-zinc-400">Configure the upstream AI provider API keys for this project.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="openaiApiKey" className="text-zinc-300">OpenAI API Key</Label>
              <Input 
                id="openaiApiKey" 
                type="password"
                placeholder={project?.openaiApiKey ? '••••••••••••••' : 'sk-...'} 
                className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100 font-mono"
                value={openaiKeyInput}
                onChange={(e) => setOpenaiKeyInput(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="anthropicApiKey" className="text-zinc-500">Anthropic API Key (Coming soon)</Label>
              <Input 
                id="anthropicApiKey" 
                type="password"
                placeholder="Coming soon" 
                className="bg-black/20 border-zinc-800 text-zinc-600 font-mono cursor-not-allowed"
                value=""
                onChange={() => {}}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="googleApiKey" className="text-zinc-300">Google Gemini API Key</Label>
              <Input 
                id="googleApiKey" 
                type="password"
                placeholder={project?.googleApiKey ? '••••••••••••••' : 'AIza...'} 
                className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100 font-mono"
                value={googleKeyInput}
                onChange={(e) => setGoogleKeyInput(e.target.value)}
              />
            </div>
            <Button 
              onClick={() => updateProviderKeysMutation.mutate({ 
                id: projectId, 
                openaiApiKey: openaiKeyInput || undefined,
                anthropicApiKey: anthropicKeyInput || undefined,
                googleApiKey: googleKeyInput || undefined,
              })}
              className="bg-emerald-500 hover:bg-emerald-600 text-black cursor-pointer"
              disabled={!hasKeysToSave || isSavingKeys}
            >
              {isSavingKeys ? 'Saving...' : 'Save API Keys'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone: Deletion */}
      <Card className="border-red-900/50 bg-red-950/10 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-xl text-red-400">Danger Zone</CardTitle>
          <CardDescription className="text-red-400/80">Irreversible and destructive actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-zinc-100 font-medium">Delete Project</h3>
              <p className="text-sm text-zinc-400 mt-1">Permanently delete this project and all of its data. This cannot be undone.</p>
            </div>
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 border border-red-500/50 cursor-pointer">
                  Delete Project
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-950 border-red-900/50">
                <DialogHeader>
                  <DialogTitle className="text-red-400">Are you absolutely sure?</DialogTitle>
                  <DialogDescription className="text-zinc-400">
                    This action cannot be undone. This will permanently delete the <span className="font-bold text-zinc-200">{project?.name}</span> project, remove all members, revoke all API keys, and delete all usage data.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex gap-3 justify-end mt-4">
                  <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                  <Button 
                    variant="destructive" 
                    className="cursor-pointer"
                    onClick={() => deleteProjectMutation.mutate({ id: projectId })}
                    disabled={deleteProjectMutation.isPending}
                  >
                    {deleteProjectMutation.isPending ? 'Deleting...' : 'Yes, delete project'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
