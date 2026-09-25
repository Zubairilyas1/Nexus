'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  FolderOpen,
  Plus,
  Users,
  Trash2,
  Loader2,
  UserPlus,
  Clock,
  Database,
} from 'lucide-react';
import { useOrganizations, type Organization } from '@/hooks/useOrganizations';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Skeleton } from '@/components/ui/Skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { PageHeader, StatCard, EmptyState } from '@/components/common';

const MEMBER_ROLES = [
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'OPERATOR', label: 'Operator' },
  { value: 'PROJECT_ADMIN', label: 'Project Admin' },
  { value: 'ORG_ADMIN', label: 'Org Admin' },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function OrgDetailPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const {
    organizations,
    projects,
    members,
    currentOrg,
    selectOrg,
    createProject,
    inviteMember,
    removeMember,
  } = useOrganizations();

  const [projectOpen, setProjectOpen] = React.useState(false);
  const [projectName, setProjectName] = React.useState('');
  const [projectSlug, setProjectSlug] = React.useState('');
  const [projectBusy, setProjectBusy] = React.useState(false);
  const [projectError, setProjectError] = React.useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState('VIEWER');
  const [inviteBusy, setInviteBusy] = React.useState(false);
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = React.useState(false);
  const [removeError, setRemoveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const org = organizations.find((o) => o.id === orgId);
    if (org && currentOrg?.id !== orgId) {
      selectOrg(org);
    }
  }, [orgId, organizations, currentOrg, selectOrg]);

  const org: Organization | undefined = organizations.find((o) => o.id === orgId);
  const loading = !org;

  const openProjectDialog = () => {
    setProjectName('');
    setProjectSlug('');
    setProjectError(null);
    setProjectOpen(true);
  };

  const handleCreateProject = async () => {
    if (!projectName || !projectSlug) return;
    setProjectBusy(true);
    setProjectError(null);
    try {
      await createProject(orgId, { name: projectName, slug: projectSlug });
      setProjectOpen(false);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setProjectBusy(false);
    }
  };

  const openInviteDialog = () => {
    setInviteEmail('');
    setInviteRole('VIEWER');
    setInviteError(null);
    setInviteOpen(true);
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setInviteBusy(true);
    setInviteError(null);
    try {
      await inviteMember(orgId, { email: inviteEmail, role: inviteRole });
      setInviteOpen(false);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await removeMember(orgId, removeTarget);
      setRemoveTarget(null);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Link href="/organizations" className="inline-flex">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            All organizations
          </Button>
        </Link>

        <PageHeader
          title={loading ? 'Organization' : (org?.name ?? 'Organization')}
          description={loading ? undefined : org?.slug}
        />

        {loading ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
            <Skeleton className="h-64" />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard label="Members" value={members.length} icon={Users} />
              <StatCard label="Projects" value={projects.length} icon={FolderOpen} />
              <StatCard label="Organization ID" value={<span className="font-mono text-base">{orgId.slice(0, 8)}</span>} icon={Database} />
              <StatCard
                label="Created"
                value={new Date(org?.created_at ?? Date.now()).toLocaleDateString()}
                icon={Clock}
              />
            </div>

            <Tabs defaultValue="projects">
              <TabsList>
                <TabsTrigger value="projects">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Projects
                </TabsTrigger>
                <TabsTrigger value="members">
                  <Users className="h-4 w-4 mr-2" />
                  Members
                </TabsTrigger>
              </TabsList>

              <TabsContent value="projects" className="mt-4 space-y-4">
                <div className="flex justify-end">
                  <Button size="sm" onClick={openProjectDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Project
                  </Button>
                </div>

                {projects.length === 0 ? (
                  <Card>
                    <CardContent>
                      <EmptyState
                        icon={FolderOpen}
                        title="No projects yet"
                        description="Projects group streams and zone configurations for a site or use case."
                        action={
                          <Button size="sm" onClick={openProjectDialog}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Project
                          </Button>
                        }
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {projects.map((project) => (
                      <motion.div key={project.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                        <Card className="h-full transition-shadow duration-300 hover:shadow-elevation-3">
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base truncate">{project.name}</CardTitle>
                              <Badge variant="outline">{project.slug}</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <p className="text-body-sm text-muted-foreground">
                              {project.description || 'No description'}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                              <span>{project.timezone}</span>
                              <span className="tabular-nums">{project.retention_days} day retention</span>
                              <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="members" className="mt-4 space-y-4">
                <div className="flex justify-end">
                  <Button size="sm" onClick={openInviteDialog}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Member
                  </Button>
                </div>

                {members.length === 0 ? (
                  <Card>
                    <CardContent>
                      <EmptyState
                        icon={Users}
                        title="No members listed"
                        description="Members of this organization appear here."
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <Card key={member.id}>
                        <CardContent className="flex items-center justify-between gap-3 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                              {(member.name?.[0] ?? member.email[0] ?? '?').toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {member.name || member.email.split('@')[0]}
                              </p>
                              <p className="truncate text-caption text-muted-foreground">{member.email}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant={member.role === 'ORG_ADMIN' ? 'default' : 'secondary'}>
                              {member.role.replace('_', ' ')}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label={`Remove ${member.email}`}
                              onClick={() => {
                                setRemoveError(null);
                                setRemoveTarget(member.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* New project */}
      <Dialog open={projectOpen} onOpenChange={setProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>A project groups streams and zones under one configuration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value);
                  setProjectSlug(slugify(e.target.value));
                }}
                placeholder="Highway Corridor"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-slug">Slug</Label>
              <Input
                id="project-slug"
                value={projectSlug}
                onChange={(e) => setProjectSlug(slugify(e.target.value))}
                placeholder="highway-corridor"
                className="font-mono text-sm"
              />
            </div>
            {projectError ? <p className="text-body-sm text-destructive">{projectError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={!projectName || !projectSlug || projectBusy}>
              {projectBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add member */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              The user must already have a NexusVision account — share their registered email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMBER_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inviteError ? <p className="text-body-sm text-destructive">{inviteError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={!inviteEmail || inviteBusy}>
              {inviteBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove member */}
      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              They immediately lose access to this organization&apos;s streams and analytics.
            </DialogDescription>
          </DialogHeader>
          {removeError ? <p className="text-body-sm text-destructive">{removeError}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveMember} disabled={removeBusy}>
              {removeBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
