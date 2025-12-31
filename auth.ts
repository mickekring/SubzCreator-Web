/**
 * NextAuth.js v5 Configuration
 * Full configuration with Credentials provider and NocoDB integration
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { getNocoDBClient, sanitizeEmail } from '@/lib/db/nocodb';
import { verifyPassword } from '@/lib/auth/password';
import { logAuditEvent } from '@/lib/auth/audit';
import type { User } from '@/lib/types';

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: 'jwt',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const db = getNocoDBClient();

          // Sanitize email to prevent NoSQL injection
          let safeEmail: string;
          try {
            safeEmail = sanitizeEmail(credentials.email as string);
          } catch {
            logAuditEvent({
              type: 'LOGIN_FAILED',
              details: { reason: 'Invalid email format' },
              success: false,
            });
            return null;
          }

          // Find user by email
          const response = await db.dbTableRow.list(
            'noco',
            'SubzCreator',
            'Users',
            {
              where: `(Email,eq,${safeEmail})`,
              limit: 1,
            }
          );

          const user = response.list?.[0] as User | undefined;

          if (!user || !user.PasswordHash) {
            logAuditEvent({
              type: 'LOGIN_FAILED',
              details: { email: safeEmail, reason: 'User not found' },
              success: false,
            });
            return null;
          }

          // Verify password
          const isValid = await verifyPassword(
            credentials.password as string,
            user.PasswordHash
          );

          if (!isValid) {
            logAuditEvent({
              type: 'LOGIN_FAILED',
              userId: String(user.Id),
              details: { email: safeEmail, reason: 'Invalid password' },
              success: false,
            });
            return null;
          }

          // Log successful login
          logAuditEvent({
            type: 'LOGIN_SUCCESS',
            userId: String(user.Id),
            details: { email: user.Email, role: user.Role },
            success: true,
          });

          // Return user object (without password)
          return {
            id: String(user.Id),
            email: user.Email,
            name: user.Name,
            role: user.Role,
          };
        } catch (error) {
          console.error('Authorization error:', error);
          logAuditEvent({
            type: 'LOGIN_FAILED',
            details: { reason: 'Internal error' },
            success: false,
          });
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Add user data to token on sign-in
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      // Add user data to session
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
});
