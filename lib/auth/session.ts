/**
 * Session helper utilities for server components
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export async function getSession() {
  return await auth();
}

export async function getCurrentUser() {
  const session = await auth();
  return session?.user;
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  return session;
}

export async function requireRole(allowedRoles: ('admin' | 'editor' | 'viewer')[]) {
  const session = await requireAuth();
  if (!allowedRoles.includes(session.user.role)) {
    redirect('/dashboard');
  }
  return session;
}
