'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { Activity, Filter, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export function ProjectOverviewTab({ projectId }: { projectId: string }) {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // Fetch filter options
  const { data: members } = trpc.members.list.useQuery({ projectId });
  const { data: availableTags } = trpc.analytics.tags.useQuery({ projectId });

  // Fetch analytics data
  const { data: summary } = trpc.analytics.summary.useQuery({ projectId, userIds, tags });
  const { data: timeline } = trpc.analytics.timeline.useQuery({ projectId, userIds, tags });
  const { data: byUser } = trpc.analytics.byUser.useQuery({ projectId, userIds, tags });
  const { data: byModel } = trpc.analytics.byModel.useQuery({ projectId, userIds, tags });

  const toggleUser = (id: string) => {
    setUserIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  return (
    <div className="space-y-6">
      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center gap-4 bg-zinc-900/30 p-4 rounded-xl border border-zinc-800 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-zinc-400">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filters:</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger 
            render={
              <Button variant="outline" className="border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300">
                Members ({userIds.length === 0 ? 'All' : userIds.length})
                <ChevronDown className="ml-2 h-4 w-4 text-zinc-500" />
              </Button>
            } 
          />
          <DropdownMenuContent align="start" className="w-56 bg-zinc-900 border-zinc-800">
            {members?.map(member => (
              <DropdownMenuCheckboxItem
                key={member.userId}
                checked={userIds.includes(member.userId)}
                onCheckedChange={() => toggleUser(member.userId)}
                className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer"
              >
                {member.name}
              </DropdownMenuCheckboxItem>
            ))}
            {members?.length === 0 && (
              <div className="p-2 text-sm text-zinc-500 text-center">No members found</div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger 
            render={
              <Button variant="outline" className="border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300">
                Tags ({tags.length === 0 ? 'All' : tags.length})
                <ChevronDown className="ml-2 h-4 w-4 text-zinc-500" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-56 bg-zinc-900 border-zinc-800">
            {availableTags?.map(tag => (
              <DropdownMenuCheckboxItem
                key={tag}
                checked={tags.includes(tag)}
                onCheckedChange={() => toggleTag(tag)}
                className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer"
              >
                {tag}
              </DropdownMenuCheckboxItem>
            ))}
            {availableTags?.length === 0 && (
              <div className="p-2 text-sm text-zinc-500 text-center">No tags found</div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {(userIds.length > 0 || tags.length > 0) && (
          <Button 
            variant="ghost" 
            onClick={() => { setUserIds([]); setTags([]); }}
            className="text-zinc-400 hover:text-zinc-100"
          >
            Clear Filters
          </Button>
        )}
      </div>

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
          <div className="h-[300px] w-full mt-4 min-w-[1px] min-h-[1px]">
            {timeline && timeline.length > 0 ? (
              <ResponsiveContainer width="99%" height="99%">
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
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 space-y-3 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
                <Activity className="w-8 h-8 text-zinc-700" />
                <p className="text-sm">No usage data available for this period.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Breakdowns Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Usage by Member */}
        <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-100">Tokens by Member</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="h-[250px] w-full min-w-[1px] min-h-[1px]">
              {byUser && byUser.length > 0 ? (
                <ResponsiveContainer width="99%" height="99%">
                  <PieChart>
                    <Pie data={byUser} dataKey="tokens" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                      {byUser.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">No data</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cost by Member */}
        <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-100">Cost by Member</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="h-[250px] w-full min-w-[1px] min-h-[1px]">
              {byUser && byUser.length > 0 ? (
                <ResponsiveContainer width="99%" height="99%">
                  <BarChart data={byUser} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <YAxis dataKey="name" type="category" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} width={80} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#fff' }} cursor={{ fill: '#27272a', opacity: 0.4 }} />
                    <Bar dataKey="cost" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">No data</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Usage by Model */}
        <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-100">Tokens by Model</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="h-[250px] w-full min-w-[1px] min-h-[1px]">
              {byModel && byModel.length > 0 ? (
                <ResponsiveContainer width="99%" height="99%">
                  <PieChart>
                    <Pie data={byModel} dataKey="tokens" nameKey="model" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                      {byModel.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">No data</div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
