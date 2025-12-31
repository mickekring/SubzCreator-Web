'use client';

/**
 * NextAuth.js SessionProvider wrapper
 * Provides session context to client components
 */

import { SessionProvider } from 'next-auth/react';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
