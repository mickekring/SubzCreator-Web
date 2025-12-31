/**
 * Admin Single User API
 * GET /api/admin/users/:id - Get user
 * PATCH /api/admin/users/:id - Update user
 * DELETE /api/admin/users/:id - Delete user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { getNocoDBClient, sanitizeEmail } from '@/lib/db/nocodb';
import { logAuditEvent, getRequestMetadata } from '@/lib/auth/audit';
import type { APIResponse, User } from '@/lib/types';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/users/:id
 * Get single user (admin only)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const db = getNocoDBClient();

    const user = await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Users',
      id
    ) as User | null;

    if (!user) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json<APIResponse>({
      success: true,
      data: {
        Id: user.Id,
        Email: user.Email,
        Name: user.Name,
        Role: user.Role,
        CreatedAt: user.CreatedAt,
        UpdatedAt: user.UpdatedAt,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json<APIResponse>(
      { success: false, error: 'Failed to get user' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/users/:id
 * Update user (admin only) - email, name, role
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const body = await request.json();
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

    // Prevent self-demotion from admin
    if (String(existingUser.Id) === session!.user.id && body.Role && body.Role !== 'admin') {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Cannot demote yourself from admin' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (body.Email !== undefined) {
      // Sanitize and validate email to prevent NoSQL injection
      let safeEmail: string;
      try {
        safeEmail = sanitizeEmail(body.Email);
      } catch {
        return NextResponse.json<APIResponse>(
          { success: false, error: 'Invalid email format' },
          { status: 400 }
        );
      }

      // Check if email is already taken by another user
      if (safeEmail !== existingUser.Email.toLowerCase()) {
        const emailCheck = await db.dbTableRow.list(
          'noco',
          'SubzCreator',
          'Users',
          { where: `(Email,eq,${safeEmail})`, limit: 1 }
        );
        if (emailCheck.list?.length > 0) {
          return NextResponse.json<APIResponse>(
            { success: false, error: 'Email already in use' },
            { status: 400 }
          );
        }
      }
      updateData.Email = safeEmail;
    }

    if (body.Name !== undefined) {
      updateData.Name = body.Name;
    }

    if (body.Role !== undefined) {
      const validRoles = ['admin', 'editor', 'viewer'];
      if (!validRoles.includes(body.Role)) {
        return NextResponse.json<APIResponse>(
          { success: false, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.Role = body.Role;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const user = await db.dbTableRow.update(
      'noco',
      'SubzCreator',
      'Users',
      id,
      updateData
    ) as User;

    // Audit log user update
    const { ip, userAgent } = getRequestMetadata(request);
    const eventType = updateData.Role ? 'ROLE_CHANGED' : 'USER_UPDATED';
    logAuditEvent({
      type: eventType,
      userId: session!.user.id,
      targetUserId: id,
      ip,
      userAgent,
      details: { updatedFields: Object.keys(updateData), updatedBy: session!.user.email },
      success: true,
    });

    return NextResponse.json<APIResponse>({
      success: true,
      data: {
        Id: user.Id,
        Email: user.Email,
        Name: user.Name,
        Role: user.Role,
      },
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json<APIResponse>(
      { success: false, error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/:id
 * Delete user (admin only)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
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

    // Prevent self-deletion
    if (String(existingUser.Id) === session!.user.id) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Cannot delete yourself' },
        { status: 400 }
      );
    }

    await db.dbTableRow.delete(
      'noco',
      'SubzCreator',
      'Users',
      id
    );

    // Audit log user deletion
    const { ip, userAgent } = getRequestMetadata(request);
    logAuditEvent({
      type: 'USER_DELETED',
      userId: session!.user.id,
      targetUserId: id,
      ip,
      userAgent,
      details: { deletedEmail: existingUser.Email, deletedBy: session!.user.email },
      success: true,
    });

    return NextResponse.json<APIResponse>({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json<APIResponse>(
      { success: false, error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
