'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Plus } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Props for ProjectApiKeysTab
 */
interface ProjectApiKeysTabProps {
  projectId: string;
  isApiKeyModalOpen: boolean;
  setIsApiKeyModalOpen: (open: boolean) => void;
}

/**
 * ProjectApiKeysTab Component
 * 
 * Manages the virtual API keys for a project, which map to upstream provider keys.
 * Allows users to create new keys and revoke existing ones.
 * 
 * @param {ProjectApiKeysTabProps} props - Component properties.
 * @returns {JSX.Element} The rendered API keys tab content.
 */
export function ProjectApiKeysTab({ projectId, isApiKeyModalOpen, setIsApiKeyModalOpen }: ProjectApiKeysTabProps) {
  // State for API key creation
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Fetch existing API keys
  const { data: apiKeys, refetch: refetchKeys } = trpc.apiKeys.list.useQuery({ projectId });

  // Mutations for creating and revoking API keys
  const createKeyMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setCreatedKey(data.rawKey);
      setNewKeyName('');
      refetchKeys();
      toast.success('API Key created!');
    }
  });

  const revokeKeyMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      refetchKeys();
      toast.success('API Key revoked');
    },
    onError: (err) => toast.error(err.message || 'Failed to revoke API key')
  });

  /**
   * Helper function to copy text to clipboard and show a toast notification.
   */
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl text-zinc-100">Virtual API Keys</CardTitle>
          <CardDescription className="text-zinc-400">Keys used to route requests through the proxy.</CardDescription>
        </div>
        
        {/* API Key Creation Dialog */}
        <Dialog open={isApiKeyModalOpen} onOpenChange={(open) => {
          setIsApiKeyModalOpen(open);
          if (!open) {
            // Clean up when closing modal
            setCreatedKey(null);
            setNewKeyName('');
          }
        }}>
          <DialogTrigger render={<Button className="bg-emerald-500 hover:bg-emerald-600 text-black" />}>
            <Plus className="w-4 h-4 mr-2"/> Create Key
          </DialogTrigger>
          <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Create New API Key</DialogTitle>
              <DialogDescription className="text-zinc-400">Give your key a descriptive name.</DialogDescription>
            </DialogHeader>
            
            {!createdKey ? (
              // Step 1: Input name for the new key
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="keyName" className="text-zinc-300">Key Name</Label>
                  <Input 
                    id="keyName" 
                    placeholder="e.g. Cursor on MBP" 
                    className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={() => createKeyMutation.mutate({ projectId, name: newKeyName })}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-black"
                  disabled={!newKeyName || createKeyMutation.isPending}
                >
                  Generate Key
                </Button>
              </div>
            ) : (
              // Step 2: Show the generated key (only visible once)
              <div className="space-y-4 py-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <code className="block flex-1 min-w-0 bg-black p-2 rounded text-zinc-300 border border-zinc-800 break-all text-sm">{createdKey}</code>
                    <Button variant="outline" size="icon" onClick={() => handleCopy(createdKey)} className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:text-zinc-100 shrink-0">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100" onClick={() => {
                  setCreatedKey(null);
                  setIsApiKeyModalOpen(false);
                }}>Done</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {/* Display list of all API keys */}
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Name</TableHead>
              <TableHead className="text-zinc-400">Owner</TableHead>
              <TableHead className="text-zinc-400">Prefix</TableHead>
              <TableHead className="text-zinc-400">Created</TableHead>
              <TableHead className="text-right text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys?.map((key) => (
              <TableRow key={key.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                <TableCell className="font-medium text-zinc-200">{key.name}</TableCell>
                <TableCell className="text-zinc-400 text-sm">{key.user?.displayName || 'Unknown'}</TableCell>
                <TableCell className="font-mono text-zinc-400 text-sm">
                  <span>{key.keyPrefix}••••••••</span>
                </TableCell>
                <TableCell className="text-zinc-500 text-sm">{new Date(key.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-400 hover:text-red-300 hover:bg-red-400/10 cursor-pointer"
                    onClick={() => revokeKeyMutation.mutate({ id: key.id })}
                    disabled={revokeKeyMutation.isPending}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
