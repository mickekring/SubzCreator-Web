/**
 * NextAuth.js Proxy (Next.js 16+)
 * Protects routes based on auth.config.ts authorized callback
 */

import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
  // Match all routes except static files, images, auth API, and upload API (large files)
  matcher: [
    '/((?!api/auth|api/upload|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
};
