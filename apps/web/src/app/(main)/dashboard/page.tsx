'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/trpc/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Users, Zap, DollarSign } from 'lucide-react';

/**
 * DashboardPage Component
 * 
 * The main landing view after authentication. Displays a grid of
 * all projects the user has access to, along with high-level stats
 * (members, tokens, cost) for each.
 * 
 * @returns {JSX.Element} The rendered dashboard.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Dashboard</h1>
          <p className="text-zinc-400 mt-1">Manage your AI projects and track API usage.</p>
        </div>
        <Button onClick={() => router.push('/projects/new')} className="bg-emerald-500 hover:bg-emerald-600 text-black w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl bg-zinc-800/50" />)}
        </div>
      ) : projects?.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
          <div className="p-4 rounded-full bg-zinc-800/50 mb-4">
            <Zap className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-medium text-zinc-200">No projects yet</h3>
          <p className="text-zinc-500 mt-1 text-center max-w-sm mb-6">Create your first project to start generating API keys and tracking AI usage.</p>
          <Button onClick={() => router.push('/projects/new')} className="bg-zinc-100 hover:bg-white text-black">
            Create Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects?.map(project => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="border-zinc-800 bg-zinc-900/30 hover:bg-zinc-800/50 transition-all cursor-pointer h-full group flex flex-col">
                <CardHeader>
                  <CardTitle className="text-xl text-zinc-100 group-hover:text-emerald-400 transition-colors">
                    {project.name}
                  </CardTitle>
                  <CardDescription className="text-zinc-400 line-clamp-2">
                    {project.description || 'No description provided.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="grid grid-cols-3 gap-2 border-t border-zinc-800 pt-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-zinc-500 flex items-center mb-1"><Users className="w-3 h-3 mr-1"/> Members</span>
                      <span className="font-mono text-sm text-zinc-300">{project.memberCount}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-zinc-500 flex items-center mb-1"><Zap className="w-3 h-3 mr-1"/> Tokens</span>
                      <span className="font-mono text-sm text-zinc-300">{(project.totalTokens / 1000).toFixed(1)}k</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-zinc-500 flex items-center mb-1"><DollarSign className="w-3 h-3 mr-1"/> Cost</span>
                      <span className="font-mono text-sm text-zinc-300">${project.estimatedCost.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
