/**
 * NextAuth.js Edge-compatible configuration
 * This file contains configuration that works in Edge runtime (for middleware)
 * It cannot include bcrypt or NocoDB calls
 */

import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
      const isOnTranscription = nextUrl.pathname.startsWith('/transcription');
      const isAuthPage = nextUrl.pathname === '/login' || nextUrl.pathname === '/register';

      // Protect dashboard and transcription pages
      if (isOnDashboard || isOnTranscription) {
        if (isLoggedIn) return true;
        return false; // Redirect to login
      }

      // Redirect logged-in users away from auth pages
      if (isAuthPage && isLoggedIn) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }

      return true;
    },
  },
  providers: [], // Providers added in auth.ts
} satisfies NextAuthConfig;
