/**
 * NextAuth.js TypeScript module augmentation
 * Extends default types to include custom user properties
 */

import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'admin' | 'editor' | 'viewer';
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    role: 'admin' | 'editor' | 'viewer';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: 'admin' | 'editor' | 'viewer';
  }
}
