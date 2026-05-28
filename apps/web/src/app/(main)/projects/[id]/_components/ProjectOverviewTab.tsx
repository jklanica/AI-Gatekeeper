'use client';

import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';

/**
 * ProjectOverviewTab Component
 * 
 * Displays the high-level analytics for a project, including total requests, 
 * total tokens used, total cost, and a 30-day usage timeline chart.
 * 
 * @param {Object} props - Component properties.
 * @param {string} props.projectId - The ID of the current project.
 * @returns {JSX.Element} The rendered overview tab content.
 */
export function ProjectOverviewTab({ projectId }: { projectId: string }) {
  // Fetch high-level summary metrics (requests, tokens, cost)
  const { data: summary } = trpc.analytics.summary.useQuery({ projectId });
  
  // Fetch day-by-day usage data for the chart
  const { data: timeline } = trpc.analytics.timeline.useQuery({ projectId });

  return (
    <div className="space-y-6">
      {/* KPI Cards section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardDescription className="text-zinc-400">Total Requests</CardDescription>
            <CardTitle className="text-3xl text-zinc-100">{(summary?.totalRequests ?? 0).toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardDescription className="text-zinc-400">Total Tokens</CardDescription>
            <CardTitle className="text-3xl text-zinc-100">{((summary?.totalTokens ?? 0) / 1000000).toFixed(2)}M</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardDescription className="text-zinc-400">Total Cost</CardDescription>
            <CardTitle className="text-3xl text-emerald-400">${(summary?.totalCost ?? 0).toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Usage Timeline Chart */}
      <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-xl text-zinc-100">Usage Timeline (30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full mt-4">
            {timeline && timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline}>
                  <defs>
                    <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="date" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Area type="monotone" dataKey="tokens" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorTokens)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              // Empty state when no data is available
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 space-y-3 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
                <Activity className="w-8 h-8 text-zinc-700" />
                <p className="text-sm">No usage data available for this period.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
