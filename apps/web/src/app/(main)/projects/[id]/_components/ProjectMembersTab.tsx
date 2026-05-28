'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

/**
 * ProjectMembersTab Component
 * 
 * Manages project members, allowing owners and admins to add or remove members,
 * edit roles, and manage member tags.
 * 
 * @param {Object} props - Component properties.
 * @param {string} props.projectId - The ID of the current project.
 * @returns {JSX.Element} The rendered members tab content.
 */
export function ProjectMembersTab({ projectId }: { projectId: string }) {
  // Fetch current user and members to determine permissions
  const { data: me } = trpc.auth.me.useQuery();
  const { data: members, refetch: refetchMembers } = trpc.members.list.useQuery({ projectId });

  // Compute permissions for the current user
  const myRole = members?.find(m => m.userId === me?.id)?.role;
  const canAddMember = myRole === 'owner' || myRole === 'admin';

  // State for member additions and modifications
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [editingTagsUser, setEditingTagsUser] = useState<{ id: string, tags: string } | null>(null);

  // Mutations for member management
  const addMemberMutation = trpc.members.add.useMutation({
    onSuccess: () => {
      setIsAddMemberOpen(false);
      setNewMemberEmail('');
      refetchMembers();
      toast.success('Member added!');
    },
    onError: (err) => toast.error(err.message || 'Failed to add member')
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

  return (
    <div className="space-y-6">
      <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl text-zinc-100">Project Members</CardTitle>
            <CardDescription className="text-zinc-400">Manage who has access to this project.</CardDescription>
          </div>
          
          {/* Add Member Dialog (Only visible to owners/admins) */}
          {canAddMember && (
            <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-500 hover:bg-emerald-600 text-black cursor-pointer">
                  <Plus className="w-4 h-4 mr-2"/> Add Member
                </Button>
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
                    onClick={() => addMemberMutation.mutate({ projectId, email: newMemberEmail })}
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
          {/* Members Table */}
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
                // Only owners can edit roles of other users
                const canEditRole = myRole === 'owner' && !isMe;
                // Owners can manage everyone; admins can manage regular members
                const canManageUser = myRole === 'owner' || (myRole === 'admin' && member.role === 'member');

                return (
                  <TableRow key={member.userId} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                    <TableCell className="font-medium text-zinc-200">{member.name}</TableCell>
                    <TableCell>
                      {/* Role selection dropdown or static badge based on permissions */}
                      {canEditRole ? (
                        <Select 
                          value={member.role} 
                          onValueChange={(val) => {
                            if (val === 'owner' || val === 'admin' || val === 'member') {
                              updateRoleMutation.mutate({ projectId, userId: member.userId, role: val })
                            }
                          }}
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
                      {/* Display assigned tags */}
                      <div className="flex gap-1">
                        {member.tags.map(tag => (
                          <Badge key={tag} variant="outline" className="border-zinc-700 text-zinc-400">{tag}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-zinc-300 font-mono">{(member.usage / 1000).toFixed(1)}k</TableCell>
                    <TableCell className="text-right">
                      {/* Action menu for managing user (tags, remove) */}
                      {canManageUser && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 cursor-pointer">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-300">
                            <DropdownMenuItem className="cursor-pointer hover:bg-zinc-800" onClick={() => setEditingTagsUser({ id: member.userId, tags: member.tags.join(', ') })}>
                              Edit Tags
                            </DropdownMenuItem>
                            {!isMe && (
                              <DropdownMenuItem className="text-red-400 focus:text-red-300 focus:bg-red-400/10 cursor-pointer hover:bg-zinc-800" onClick={() => removeMemberMutation.mutate({ projectId, userId: member.userId })}>
                                Remove Member
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Dialog for editing a member's tags */}
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
                    projectId, 
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
    </div>
  );
}
