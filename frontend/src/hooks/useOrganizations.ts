'use client';

import { useState, useCallback, useEffect } from 'react';
import { fetchJson } from '@/lib/api';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown> | null;
  created_at: string;
  member_count: number;
  project_count: number;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  timezone: string;
  retention_days: number;
  created_at: string;
}

export interface Member {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  joined_at: string | null;
  created_at: string;
}

interface TenantState {
  organizations: Organization[];
  currentOrg: Organization | null;
  currentProject: Project | null;
  projects: Project[];
  members: Member[];
  loading: boolean;
  error: string | null;
}

export function useOrganizations() {
  const [state, setState] = useState<TenantState>({
    organizations: [],
    currentOrg: null,
    currentProject: null,
    projects: [],
    members: [],
    loading: true,
    error: null,
  });

  const fetchOrganizations = useCallback(async () => {
    try {
      const orgs = await fetchJson<Organization[]>('/api/organizations');
      setState((prev) => {
        const savedOrgId =
          typeof window !== 'undefined' ? localStorage.getItem('currentOrgId') : null;
        const currentOrg =
          orgs.find((o: Organization) => o.id === savedOrgId) ?? orgs[0] ?? null;
        return { ...prev, organizations: orgs, currentOrg, loading: false, error: null };
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load organizations',
      }));
    }
  }, []);

  const fetchProjects = useCallback(async (orgId: string) => {
    try {
      const projects = await fetchJson<Project[]>(`/api/organizations/${orgId}/projects`);
      setState((prev) => {
        const savedProjectId =
          typeof window !== 'undefined' ? localStorage.getItem('currentProjectId') : null;
        const currentProject =
          projects.find((p: Project) => p.id === savedProjectId) ?? projects[0] ?? null;
        return { ...prev, projects, currentProject };
      });
    } catch {
      setState((prev) => ({ ...prev, projects: [], currentProject: null }));
    }
  }, []);

  const fetchMembers = useCallback(async (orgId: string) => {
    try {
      const members = await fetchJson<Member[]>(`/api/organizations/${orgId}/members`);
      setState((prev) => ({ ...prev, members }));
    } catch {
      setState((prev) => ({ ...prev, members: [] }));
    }
  }, []);

  const selectOrg = useCallback(
    (org: Organization) => {
      localStorage.setItem('currentOrgId', org.id);
      setState((prev) => ({
        ...prev,
        currentOrg: org,
        currentProject: null,
        projects: [],
        members: [],
      }));
      fetchProjects(org.id);
      fetchMembers(org.id);
    },
    [fetchProjects, fetchMembers]
  );

  const selectProject = useCallback((project: Project) => {
    localStorage.setItem('currentProjectId', project.id);
    setState((prev) => ({ ...prev, currentProject: project }));
  }, []);

  const createOrganization = useCallback(async (data: { name: string; slug: string }) => {
    const org = await fetchJson<Organization>('/api/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setState((prev) => ({ ...prev, organizations: [...prev.organizations, org] }));
    return org;
  }, []);

  const deleteOrganization = useCallback(async (orgId: string) => {
    // Backend resolves the org from this header, not just the path param.
    await fetchJson(`/api/organizations/${orgId}`, {
      method: 'DELETE',
      headers: { 'X-Organization-ID': orgId },
    });
    setState((prev) => ({
      ...prev,
      organizations: prev.organizations.filter((o) => o.id !== orgId),
      currentOrg: prev.currentOrg?.id === orgId ? null : prev.currentOrg,
    }));
  }, []);

  const createProject = useCallback(async (orgId: string, data: { name: string; slug: string }) => {
    const project = await fetchJson<Project>(`/api/organizations/${orgId}/projects`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setState((prev) => ({ ...prev, projects: [...prev.projects, project] }));
    return project;
  }, []);

  const inviteMember = useCallback(
    async (orgId: string, data: { email: string; role: string }) => {
      const member = await fetchJson<Member>(`/api/organizations/${orgId}/members`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setState((prev) => ({ ...prev, members: [...prev.members, member] }));
      return member;
    },
    []
  );

  const removeMember = useCallback(async (orgId: string, memberId: string) => {
    await fetchJson(`/api/organizations/${orgId}/members/${memberId}`, { method: 'DELETE' });
    setState((prev) => ({ ...prev, members: prev.members.filter((m) => m.id !== memberId) }));
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  useEffect(() => {
    if (state.currentOrg) {
      fetchProjects(state.currentOrg.id);
      fetchMembers(state.currentOrg.id);
    }
  }, [state.currentOrg, fetchProjects, fetchMembers]);

  return {
    ...state,
    selectOrg,
    selectProject,
    createOrganization,
    deleteOrganization,
    createProject,
    inviteMember,
    removeMember,
    refresh: fetchOrganizations,
  };
}
