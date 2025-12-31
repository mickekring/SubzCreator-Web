/**
 * Admin authorization utilities
 */

import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { APIResponse } from '@/lib/types';

/**
 * Check if the current user is an admin
 * Returns the session if admin, or null if not
 */
export async function requireAdmin() {
  const session = await auth();

  if (!session?.user) {
    return {
      error: NextResponse.json<APIResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
      session: null
    };
  }

  if (session.user.role !== 'admin') {
    return {
      error: NextResponse.json<APIResponse>(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      ),
      session: null
    };
  }

  return { error: null, session };
}
