import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { UserRole } from '@prisma/client';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt', maxAge: 15 * 60 },
  pages: { signIn: '/auth/login', error: '/auth/login' },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: { email: { type: 'email' }, password: { type: 'password' } },
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({ where: { email: credentials.email as string } });
        if (!user || !user.password) return null;
        const isValid = await verifyPassword(credentials.password as string, user.password);
        if (!isValid) return null;

        // Get user's active membership
        const membership = await prisma.membership.findFirst({
          where: { userId: user.id, status: 'ACTIVE' },
          include: { organization: true },
        });

        const projectMembership = await prisma.projectMembership.findFirst({
          where: { userId: user.id },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          globalRole: user.globalRole as UserRole,
          orgId: membership?.organizationId,
          orgRole: membership?.role as UserRole,
          orgName: membership?.organization?.name,
          projectId: projectMembership?.projectId,
          projectRole: projectMembership?.role as UserRole,
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.globalRole = user.globalRole as UserRole;
        token.orgId = (user as any).orgId;
        token.orgRole = (user as any).orgRole as UserRole;
        token.orgName = (user as any).orgName;
        token.projectId = (user as any).projectId;
        token.projectRole = (user as any).projectRole as UserRole;
        token.projectName = (user as any).projectName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.globalRole = token.globalRole as UserRole;
        session.user.orgId = token.orgId as string;
        session.user.orgRole = token.orgRole as UserRole;
        session.user.orgName = token.orgName as string;
        session.user.projectId = token.projectId as string;
        session.user.projectRole = token.projectRole as UserRole;
        session.user.projectName = token.projectName as string;
      }
      return session;
    }
  }
});
