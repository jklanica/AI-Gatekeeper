'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Copy, Plus, Key, Users, Activity, Settings, TerminalSquare, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  
  const { data: project, isLoading: loadingProject } = trpc.projects.get.useQuery({ id });
  const { data: summary } = trpc.analytics.summary.useQuery({ projectId: id });
  const { data: timeline } = trpc.analytics.timeline.useQuery({ projectId: id });
  const { data: members, refetch: refetchMembers } = trpc.members.list.useQuery({ projectId: id });
  const { data: apiKeys, refetch: refetchKeys } = trpc.apiKeys.list.useQuery({ projectId: id });
  const { data: me } = trpc.auth.me.useQuery();

  const myRole = members?.find(m => m.userId === me?.id)?.role;
  const canAddMember = myRole === 'owner' || myRole === 'admin';
  
  const [selectedTool, setSelectedTool] = useState<'vscode' | 'cursor' | 'shell' | 'python' | 'node'>('cursor');
  const { data: configSnippet } = trpc.integrations.getConfig.useQuery({ tool: selectedTool });

  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const createKeyMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setCreatedKey(data.rawKey);
      refetchKeys();
      toast.success('API Key created!');
    }
  });

  const router = useRouter();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const deleteProjectMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success('Project deleted');
      router.push('/dashboard');
    },
    onError: (err) => toast.error(err.message || 'Failed to delete project')
  });

  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);

  const addMemberMutation = trpc.members.add.useMutation({
    onSuccess: () => {
      setIsAddMemberOpen(false);
      setNewMemberEmail('');
      refetchMembers();
      toast.success('Member added!');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to add member');
    }
  });

  const removeMemberMutation = trpc.members.remove.useMutation({
    onSuccess: () => {
      refetchMembers();
      toast.success('Member removed');
    },
    onError: (err) => toast.error(err.message || 'Failed to remove member')
  });

  const updateRoleMutation = trpc.members.updateRole.useMutation({
    onSuccess: () => {
      refetchMembers();
      toast.success('Role updated');
    },
    onError: (err) => toast.error(err.message || 'Failed to update role')
  });

  const updateTagsMutation = trpc.members.updateTags.useMutation({
    onSuccess: () => {
      setEditingTagsUser(null);
      refetchMembers();
      toast.success('Tags updated');
    },
    onError: (err) => toast.error(err.message || 'Failed to update tags')
  });

  const [editingTagsUser, setEditingTagsUser] = useState<{ id: string, tags: string } | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (loadingProject) return <div className="text-zinc-400">Loading project...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">{project?.name}</h1>
          <p className="text-zinc-400 mt-1">{project?.description}</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-zinc-900/50 border border-zinc-800 text-zinc-400">
          <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"><Activity className="w-4 h-4 mr-2"/> Overview</TabsTrigger>
          <TabsTrigger value="members" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"><Users className="w-4 h-4 mr-2"/> Members</TabsTrigger>
          <TabsTrigger value="apikeys" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"><Key className="w-4 h-4 mr-2"/> API Keys</TabsTrigger>
          <TabsTrigger value="setup" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"><TerminalSquare className="w-4 h-4 mr-2"/> Setup</TabsTrigger>
          {myRole === 'owner' && <TabsTrigger value="settings" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"><Settings className="w-4 h-4 mr-2"/> Settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardDescription className="text-zinc-400">Total Requests</CardDescription>
                <CardTitle className="text-3xl text-zinc-100">{summary?.totalRequests.toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardDescription className="text-zinc-400">Total Tokens</CardDescription>
                <CardTitle className="text-3xl text-zinc-100">{(summary?.totalTokens! / 1000000).toFixed(2)}M</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardDescription className="text-zinc-400">Total Cost</CardDescription>
                <CardTitle className="text-3xl text-emerald-400">${summary?.totalCost.toFixed(2)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-xl text-zinc-100">Usage Timeline (30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full mt-4">
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl text-zinc-100">Project Members</CardTitle>
                <CardDescription className="text-zinc-400">Manage who has access to this project.</CardDescription>
              </div>
              {canAddMember && (
                <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
                  <DialogTrigger render={<Button className="bg-emerald-500 hover:bg-emerald-600 text-black cursor-pointer" />}>
                    <Plus className="w-4 h-4 mr-2"/> Add Member
                  </DialogTrigger>
                  <DialogContent className="bg-zinc-950 border-zinc-800">
                    <DialogHeader>
                      <DialogTitle className="text-zinc-100">Add Project Member</DialogTitle>
                      <DialogDescription className="text-zinc-400">Enter the email address of the user you want to add.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="memberEmail" className="text-zinc-300">User Email</Label>
                        <Input 
                          id="memberEmail" 
                          type="email"
                          placeholder="user@example.com" 
                          className="bg-black/40 border-zinc-700 focus-visible:ring-emerald-500 text-zinc-100"
                          value={newMemberEmail}
                          onChange={(e) => setNewMemberEmail(e.target.value)}
                        />
                      </div>
                      <Button 
                        onClick={() => addMemberMutation.mutate({ projectId: id, email: newMemberEmail })}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-black cursor-pointer"
                        disabled={!newMemberEmail || addMemberMutation.isPending}
                      >
                        {addMemberMutation.isPending ? 'Adding...' : 'Add Member'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Name</TableHead>
                    <TableHead className="text-zinc-400">Role</TableHead>
                    <TableHead className="text-zinc-400">Tags</TableHead>
                    <TableHead className="text-right text-zinc-400">Usage (Tokens)</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members?.map((member) => {
                    const isMe = member.userId === me?.id;
                    const canEditRole = myRole === 'owner' && !isMe;
                    const canManageUser = myRole === 'owner' || (myRole === 'admin' && member.role === 'member');

                    return (
                    <TableRow key={member.userId} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="font-medium text-zinc-200">{member.name}</TableCell>
                      <TableCell>
                        {canEditRole ? (
                          <Select 
                            value={member.role} 
                            onValueChange={(val: 'owner'|'admin'|'member') => updateRoleMutation.mutate({ projectId: id, userId: member.userId, role: val })}
                            disabled={updateRoleMutation.isPending}
                          >
                            <SelectTrigger className="w-[110px] h-8 bg-transparent border-zinc-800 focus:ring-0 text-zinc-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                              <SelectItem value="owner">Owner</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={member.role === 'owner' ? 'default' : 'secondary'} className={member.role === 'owner' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-300'}>
                            {member.role}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {member.tags.map(tag => (
                            <Badge key={tag} variant="outline" className="border-zinc-700 text-zinc-400">{tag}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-zinc-300 font-mono">{(member.usage / 1000).toFixed(1)}k</TableCell>
                      <TableCell className="text-right">
                        {canManageUser && (
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 cursor-pointer" />}>
                              <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-300">
                              <DropdownMenuItem className="cursor-pointer hover:bg-zinc-800" onClick={() => setEditingTagsUser({ id: member.userId, tags: member.tags.join(', ') })}>
                                Edit Tags
                              </DropdownMenuItem>
                              {!isMe && (
                                <DropdownMenuItem className="text-red-400 focus:text-red-300 focus:bg-red-400/10 cursor-pointer hover:bg-zinc-800" onClick={() => removeMemberMutation.mutate({ projectId: id, userId: member.userId })}>
                                  Remove Member
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  )})}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          <Dialog open={!!editingTagsUser} onOpenChange={(open) => !open && setEditingTagsUser(null)}>
            <DialogContent className="bg-zinc-950 border-zinc-800">
              <DialogHeader>
                <DialogTitle className="text-zinc-100">Edit Tags</DialogTitle>
                <DialogDescription className="text-zinc-400">Enter tags separated by commas.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Input 
                  className="bg-black/40 border-zinc-700 text-zinc-100 focus-visible:ring-emerald-500"
                  value={editingTagsUser?.tags || ''}
                  onChange={e => setEditingTagsUser(prev => prev ? { ...prev, tags: e.target.value } : null)}
                  placeholder="backend, api, admin"
                />
                <Button 
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-black cursor-pointer"
                  onClick={() => {
                    if (editingTagsUser) {
                      updateTagsMutation.mutate({ 
                        projectId: id, 
                        userId: editingTagsUser.id, 
                        tags: editingTagsUser.tags.split(',').map(t => t.trim()).filter(Boolean) 
                      });
                    }
                  }}
                  disabled={updateTagsMutation.isPending}
                >
                  {updateTagsMutation.isPending ? 'Saving...' : 'Save Tags'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="apikeys">
          <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl text-zinc-100">Virtual API Keys</CardTitle>
                <CardDescription className="text-zinc-400">Keys used to route requests through the proxy.</CardDescription>
              </div>
              
              <Dialog>
                <DialogTrigger render={<Button className="bg-emerald-500 hover:bg-emerald-600 text-black" />}>
                  <Plus className="w-4 h-4 mr-2"/> Create Key
                </DialogTrigger>
                <DialogContent className="bg-zinc-950 border-zinc-800">
                  <DialogHeader>
                    <DialogTitle className="text-zinc-100">Create New API Key</DialogTitle>
                    <DialogDescription className="text-zinc-400">Give your key a descriptive name. You will only see the secret key once.</DialogDescription>
                  </DialogHeader>
                  
                  {!createdKey ? (
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
                        onClick={() => createKeyMutation.mutate({ projectId: id, name: newKeyName })}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-black"
                        disabled={!newKeyName || createKeyMutation.isPending}
                      >
                        Generate Key
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4 py-4">
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                        <p className="text-sm font-medium text-emerald-400 mb-2">Please copy your secret key now. You won't be able to see it again!</p>
                        <div className="flex items-center space-x-2">
                          <code className="flex-1 bg-black p-2 rounded text-zinc-300 border border-zinc-800 overflow-x-auto text-sm">{createdKey}</code>
                          <Button variant="outline" size="icon" onClick={() => handleCopy(createdKey)} className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:text-zinc-100">
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100" onClick={() => setCreatedKey(null)}>Done</Button>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Name</TableHead>
                    <TableHead className="text-zinc-400">Prefix</TableHead>
                    <TableHead className="text-zinc-400">Created</TableHead>
                    <TableHead className="text-right text-zinc-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys?.map((key) => (
                    <TableRow key={key.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="font-medium text-zinc-200">{key.name}</TableCell>
                      <TableCell className="font-mono text-zinc-400 text-sm">{key.keyPrefix}••••••••</TableCell>
                      <TableCell className="text-zinc-500 text-sm">{new Date(key.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-400/10">Revoke</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup">
          <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-xl text-zinc-100">Tool Setup</CardTitle>
              <CardDescription className="text-zinc-400">Configure your development environment to use the proxy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="max-w-xs space-y-2">
                <Label className="text-zinc-300">Select Tool</Label>
                <Select value={selectedTool} onValueChange={(val: any) => setSelectedTool(val)}>
                  <SelectTrigger className="bg-black/40 border-zinc-700 text-zinc-100">
                    <SelectValue placeholder="Select a tool" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                    <SelectItem value="cursor">Cursor IDE</SelectItem>
                    <SelectItem value="vscode">VS Code (Continue)</SelectItem>
                    <SelectItem value="shell">Terminal Shell</SelectItem>
                    <SelectItem value="python">Python SDK</SelectItem>
                    <SelectItem value="node">Node.js SDK</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="relative">
                <div className="absolute right-4 top-4">
                  <Button variant="outline" size="sm" onClick={() => handleCopy(configSnippet || '')} className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                    <Copy className="h-4 w-4 mr-2" /> Copy
                  </Button>
                </div>
                <pre className="bg-black/60 border border-zinc-800 rounded-xl p-6 text-sm text-zinc-300 overflow-x-auto">
                  <code>{configSnippet || 'Loading config...'}</code>
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {myRole === 'owner' && (
          <TabsContent value="settings">
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
                    <DialogTrigger render={<Button variant="destructive" className="bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 border border-red-500/50 cursor-pointer" />}>
                      Delete Project
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
                          onClick={() => deleteProjectMutation.mutate({ id })}
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
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
