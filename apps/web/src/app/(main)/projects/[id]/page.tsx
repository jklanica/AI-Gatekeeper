'use client';

import { useState, use } from 'react';
import { trpc } from '@/trpc/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Key, Users, Activity, Settings, TerminalSquare } from 'lucide-react';

import { ProjectOverviewTab } from './_components/ProjectOverviewTab';
import { ProjectMembersTab } from './_components/ProjectMembersTab';
import { ProjectApiKeysTab } from './_components/ProjectApiKeysTab';
import { ProjectSetupTab } from './_components/ProjectSetupTab';
import { ProjectSettingsTab } from './_components/ProjectSettingsTab';

/**
 * ProjectDetailsPage Component
 * 
 * Main interface for managing a specific project. Includes tabs for:
 * - Overview: Usage analytics and cost charts
 * - Members: Role management, tags, and member removal
 * - API Keys: Virtual key generation and revocation
 * - Setup: Integration snippets for tools like VSCode, Cursor
 * - Settings: Upstream provider credentials; owner-only
 * 
 * @param {Object} props - Component properties.
 * @param {Promise<{ id: string }>} props.params - Dynamic route parameters.
 * @returns {JSX.Element} The rendered project details page.
 */
export default function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  // Unwrap route parameters
  const { id } = use(params);
  
  // Fetch top-level project data for headers
  const { data: project, isLoading: loadingProject } = trpc.projects.get.useQuery({ id });
  
  // Fetch user data and members to determine permissions (e.g., to show settings tab)
  const { data: me } = trpc.auth.me.useQuery();
  const { data: members } = trpc.members.list.useQuery({ projectId: id });

  // Determine the current user's role in this project
  const myRole = members?.find(m => m.userId === me?.id)?.role;
  
  // Active tab state
  const [activeTab, setActiveTab] = useState('overview');

  // Lifted state for API Key Modal to allow navigating and auto-opening it from Setup tab
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  if (loadingProject) return <div className="text-zinc-400">Loading project...</div>;

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">{project?.name}</h1>
          <p className="text-zinc-400 mt-1">{project?.description}</p>
        </div>
      </div>

      {/* Tabs Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-900/50 border border-zinc-800 text-zinc-400 flex w-full justify-start overflow-x-auto h-auto p-1 no-scrollbar">
          <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100">
            <Activity className="w-4 h-4 mr-2"/> Overview
          </TabsTrigger>
          <TabsTrigger value="members" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100">
            <Users className="w-4 h-4 mr-2"/> Members
          </TabsTrigger>
          <TabsTrigger value="apikeys" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100">
            <Key className="w-4 h-4 mr-2"/> API Keys
          </TabsTrigger>
          <TabsTrigger value="setup" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100">
            <TerminalSquare className="w-4 h-4 mr-2"/> Setup
          </TabsTrigger>
          {myRole === 'owner' && (
            <TabsTrigger value="settings" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100">
              <Settings className="w-4 h-4 mr-2"/> Settings
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <ProjectOverviewTab projectId={id} />
        </TabsContent>

        <TabsContent value="members">
          <ProjectMembersTab projectId={id} />
        </TabsContent>

        <TabsContent value="apikeys">
          <ProjectApiKeysTab 
            projectId={id} 
            isApiKeyModalOpen={isApiKeyModalOpen} 
            setIsApiKeyModalOpen={setIsApiKeyModalOpen} 
          />
        </TabsContent>

        <TabsContent value="setup">
          <ProjectSetupTab 
            projectId={id} 
            onNavigateToApiKeys={() => {
              setActiveTab('apikeys');
              setIsApiKeyModalOpen(true);
            }} 
          />
        </TabsContent>

        {myRole === 'owner' && (
          <TabsContent value="settings" className="space-y-6">
            <ProjectSettingsTab projectId={id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
