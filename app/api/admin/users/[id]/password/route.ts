/**
 * Admin User Password API
 * PATCH /api/admin/users/:id/password - Change user password
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { getNocoDBClient } from '@/lib/db/nocodb';
import { hashPassword, validatePassword, getPasswordRequirementsText } from '@/lib/auth/password';
import type { APIResponse, User } from '@/lib/types';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/users/:id/password
 * Change user password (admin only)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Password is required' },
        { status: 400 }
      );
    }

    // Use full password validation for consistent security policy
    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json<APIResponse>(
        { success: false, error: `${passwordError}. Requirements: ${getPasswordRequirementsText()}` },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();

    // Check if user exists
    const existingUser = await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Users',
      id
    ) as User | null;

    if (!existingUser) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Hash and update password
    const passwordHash = await hashPassword(password);
    await db.dbTableRow.update(
      'noco',
      'SubzCreator',
      'Users',
      id,
      { PasswordHash: passwordHash }
    );

    return NextResponse.json<APIResponse>({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json<APIResponse>(
      { success: false, error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
