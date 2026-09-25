import 'next-auth';
import { DefaultSession } from 'next-auth';
import { UserRole } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      globalRole: UserRole;
      orgId?: string | null;
      orgRole?: UserRole | null;
      orgName?: string | null;
      projectId?: string | null;
      projectRole?: UserRole | null;
      projectName?: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    globalRole: UserRole;
    orgId?: string | null;
    orgRole?: UserRole | null;
    orgName?: string | null;
    projectId?: string | null;
    projectRole?: UserRole | null;
    projectName?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    globalRole: UserRole;
    orgId?: string | null;
    orgRole?: UserRole | null;
    orgName?: string | null;
    projectId?: string | null;
    projectRole?: UserRole | null;
    projectName?: string | null;
  }
}