'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Copy, Key, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * Props for ProjectSetupTab
 */
interface ProjectSetupTabProps {
  projectId: string;
  onNavigateToApiKeys: () => void;
}

/**
 * ProjectSetupTab Component
 * 
 * Displays integration code snippets (VSCode, Cursor, Shell, etc.) for the project.
 * Prompts the user to create an API key if they don't have one yet.
 * 
 * @param {ProjectSetupTabProps} props - Component properties.
 * @returns {JSX.Element} The rendered setup tab content.
 */
export function ProjectSetupTab({ projectId, onNavigateToApiKeys }: ProjectSetupTabProps) {
  // Fetch current user and API keys to check if they have any
  const { data: me } = trpc.auth.me.useQuery();
  const { data: apiKeys } = trpc.apiKeys.list.useQuery({ projectId });
  
  // State for tool selection and fetching configuration snippet
  const [selectedTool, setSelectedTool] = useState<'vscode' | 'cursor' | 'shell' | 'python' | 'node'>('vscode');
  const { data: configSnippet } = trpc.integrations.getConfig.useQuery({ tool: selectedTool, projectId });

  // Check if current user has at least one API key
  const hasKeys = apiKeys && apiKeys.filter(k => k.userId === me?.id).length > 0;

  /**
   * Helper function to copy snippet text to clipboard
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
      <CardHeader>
        <CardTitle className="text-xl text-zinc-100">Tool Setup</CardTitle>
        <CardDescription className="text-zinc-400">Configure your development environment to use the proxy.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasKeys ? (
          // Empty state: User needs to create an API key first
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400 space-y-4">
            <Key className="w-12 h-12 text-zinc-600" />
            <p>You don't have an API key yet.</p>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600 text-black cursor-pointer"
              onClick={onNavigateToApiKeys}
            >
              <Plus className="w-4 h-4 mr-2"/> Create API Key
            </Button>
          </div>
        ) : (
          // Setup Snippets available
          <>
            <div className="w-full max-w-sm space-y-2">
              <Label className="text-zinc-300">Select Tool</Label>
              <Select value={selectedTool} onValueChange={(val) => {
                if (val === 'vscode' || val === 'cursor' || val === 'shell' || val === 'python' || val === 'node') {
                  setSelectedTool(val);
                }
              }}>
                <SelectTrigger className="w-full bg-black/40 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Select a tool" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                  <SelectItem value="vscode">VS Code (Continue)</SelectItem>
                  <SelectItem value="cursor">Cursor IDE</SelectItem>
                  <SelectItem value="shell">Terminal Shell</SelectItem>
                  <SelectItem value="python">Python SDK</SelectItem>
                  <SelectItem value="node">Node.js SDK</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="relative rounded-xl border border-zinc-800 bg-black/60 overflow-hidden">
              <div className="absolute right-2 top-2 z-10">
                <Button variant="outline" size="sm" onClick={() => handleCopy(configSnippet || '')} className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer">
                  <Copy className="h-4 w-4 mr-2" /> Copy
                </Button>
              </div>
              <SyntaxHighlighter
                language={selectedTool === 'vscode' ? 'json' : selectedTool === 'shell' ? 'bash' : selectedTool === 'python' ? 'python' : selectedTool === 'node' ? 'javascript' : 'markdown'}
                style={vscDarkPlus}
                customStyle={{ margin: 0, background: 'transparent', padding: '1.5rem', paddingTop: '3.5rem', fontSize: '0.875rem' }}
              >
                {configSnippet || 'Loading config...'}
              </SyntaxHighlighter>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
