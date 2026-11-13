'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  Building2,
  Users,
  FolderOpen,
  Plus,
  ArrowRight,
  Loader2,
  Trash2,
  RefreshCw,
  CalendarDays,
} from 'lucide-react';
import { useOrganizations, type Organization } from '@/hooks/useOrganizations';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { PageHeader, StatCard, EmptyState, ErrorState } from '@/components/common';
import { cn } from '@/lib/utils';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function OrgCard({
  org,
  onDelete,
}: {
  org: Organization;
  onDelete: (org: Organization) => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="group h-full transition-all duration-300 hover:border-primary/40 hover:shadow-elevation-3">
        <Link href={`/organizations/${org.id}/projects`} className="block">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-base">{org.name}</CardTitle>
                <p className="truncate text-caption text-muted-foreground">{org.slug}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4 text-body-sm text-muted-foreground tabular-nums">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {org.member_count} member{org.member_count === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" />
                {org.project_count} project{org.project_count === 1 ? '' : 's'}
              </span>
            </div>
            <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              Created {new Date(org.created_at).toLocaleDateString()}
            </p>
          </CardContent>
        </Link>
        <div className="border-t border-border px-6 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Delete ${org.name}`}
            onClick={(e) => {
              e.preventDefault();
              onDelete(org);
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

export default function OrganizationsPage() {
  const {
    organizations,
    loading,
    error,
    refresh,
    createOrganization,
    deleteOrganization,
  } = useOrganizations();

  const [refreshing, setRefreshing] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Organization | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const openCreate = () => {
    setName('');
    setSlug('');
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!name || !slug) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createOrganization({ name, slug });
      setCreateOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteOrganization(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete organization');
    } finally {
      setDeleting(false);
    }
  };

  const totalMembers = organizations.reduce((sum, o) => sum + o.member_count, 0);
  const totalProjects = organizations.reduce((sum, o) => sum + o.project_count, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Organizations"
          description="Isolate streams, zones, and analytics per team or site"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
                Refresh
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                New Organization
              </Button>
            </div>
          }
        />

        {error ? (
          <ErrorState title="Organizations unavailable" description={error} onRetry={handleRefresh} />
        ) : loading ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          </>
        ) : organizations.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Building2}
                title="No organizations yet"
                description="Create your first organization to group streams, zones, and team access."
                action={
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Organization
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Organizations" value={organizations.length} icon={Building2} />
              <StatCard label="Members" value={totalMembers} icon={Users} />
              <StatCard label="Projects" value={totalProjects} icon={FolderOpen} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {organizations.map((org) => (
                <OrgCard key={org.id} org={org} onDelete={setDeleteTarget} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Create organization */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>You become its administrator with full access.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="Downtown Operations"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="downtown-operations"
                className="font-mono text-sm"
              />
              <p className="text-caption text-muted-foreground">Lowercase letters, numbers, and dashes</p>
            </div>
            {createError ? <p className="text-body-sm text-destructive">{createError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name || !slug || creating}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete organization */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete organization</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Permanently delete "${deleteTarget.name}" and remove all ${deleteTarget.member_count} membership${deleteTarget.member_count === 1 ? '' : 's'}? This cannot be undone.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-body-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
