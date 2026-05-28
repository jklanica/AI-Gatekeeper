'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MODEL_PRICING } from '@ai-gatekeeper/types';
import { Copy, Key, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const ALL_MODELS = Object.keys(MODEL_PRICING);
const PROVIDERS: Record<string, string[]> = {
  'OpenAI': ALL_MODELS.filter(m => m.startsWith('gpt') || /^o\d+/.test(m)),
  'Anthropic': ALL_MODELS.filter(m => m.startsWith('claude')),
  'Google': ALL_MODELS.filter(m => m.startsWith('gemini')),
};

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
  
  // Fetch configuration snippet for Continue.dev
  const { data: configParams } = trpc.integrations.getConfig.useQuery({ tool: 'continue', projectId });

  // Check if current user has at least one API key
  const hasKeys = apiKeys && apiKeys.filter(k => k.userId === me?.id).length > 0;

  const [selectedModels, setSelectedModels] = useState<string[]>(ALL_MODELS);

  const toggleModel = (model: string) => {
    setSelectedModels(prev => 
      prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]
    );
  };

  const setProviderModels = (provider: string, add: boolean) => {
    const models = PROVIDERS[provider] || [];
    if (add) {
      setSelectedModels(prev => Array.from(new Set([...prev, ...models])));
    } else {
      setSelectedModels(prev => prev.filter(m => !models.includes(m)));
    }
  };

  const configSnippet = useMemo(() => {
    if (!configParams) return 'Loading config...';
    if (selectedModels.length === 0) return '# Please select at least one model above.';
    
    const lines = [
      'name: AI-Gatekeeper',
      'version: 1.0.0',
      'schema: v1',
      'models:'
    ];
    selectedModels.forEach(model => {
      lines.push(`  - name: ${model} (AI-Gatekeeper)`);
      lines.push(`    provider: openai`);
      lines.push(`    model: ${model}`);
      lines.push(`    apiBase: "${configParams.baseUrl}"`);
      lines.push(`    apiKey: "<YOUR_VIRTUAL_API_KEY>"`);
    });
    
    return lines.join('\n');
  }, [selectedModels, configParams]);

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
            <p>You don&apos;t have an API key yet.</p>
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
            <div className="space-y-4 text-zinc-300">
              <h3 className="text-lg font-medium text-white">How to setup Continue.dev</h3>
              <ol className="list-decimal list-inside space-y-2">
                <li>Install the <strong>Continue</strong> extension for VS Code or JetBrains.</li>
                <li>Open the Continue configuration file (<code>~/.continue/config.yaml</code>).</li>
                <li>Select the models you want to use, then <strong>overwrite</strong> the entire file with the generated YAML below.</li>
                <li>Replace <code>&lt;YOUR_VIRTUAL_API_KEY&gt;</code> with your actual API key.</li>
              </ol>
            </div>

            <div className="mt-6 space-y-4 pt-4 border-t border-zinc-800/50">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-zinc-400">Select Models</h4>
                <div className="flex gap-2">
                  {Object.keys(PROVIDERS).map(provider => {
                    const providerModels = PROVIDERS[provider];
                    const allSelected = providerModels.length > 0 && providerModels.every(m => selectedModels.includes(m));
                    return (
                      <Button 
                        key={provider} 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setProviderModels(provider, !allSelected)}
                        className="h-6 text-[10px] bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                      >
                        {allSelected ? `Remove ${provider}` : `Add all ${provider}`}
                      </Button>
                    )
                  })}
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {ALL_MODELS.map((model) => {
                  const isSelected = selectedModels.includes(model);
                  return (
                    <Badge 
                      key={model} 
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => toggleModel(model)}
                      className={`cursor-pointer transition-colors shadow-none font-mono text-[10px] ${
                        isSelected 
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30" 
                          : "bg-zinc-800/30 text-zinc-500 border-zinc-700/50 hover:bg-zinc-800/50 hover:text-zinc-300"
                      }`}
                    >
                      {model}
                    </Badge>
                  )
                })}
              </div>
            </div>

            <div className="relative rounded-xl border border-zinc-800 bg-black/60 overflow-hidden mt-4">
              <div className="absolute right-2 top-2 z-10">
                <Button variant="outline" size="sm" onClick={() => handleCopy(configSnippet || '')} className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer">
                  <Copy className="h-4 w-4 mr-2" /> Copy
                </Button>
              </div>
              <SyntaxHighlighter
                language="yaml"
                style={vscDarkPlus}
                customStyle={{ margin: 0, background: 'transparent', padding: '1.5rem', paddingTop: '3.5rem', fontSize: '0.875rem' }}
              >
                {configSnippet}
              </SyntaxHighlighter>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
