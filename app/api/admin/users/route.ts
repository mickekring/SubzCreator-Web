/**
 * Admin Users API
 * GET /api/admin/users - List all users
 * POST /api/admin/users - Create new user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { getNocoDBClient, sanitizeEmail } from '@/lib/db/nocodb';
import { hashPassword, validatePassword, getPasswordRequirementsText } from '@/lib/auth/password';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { logAuditEvent, getRequestMetadata } from '@/lib/auth/audit';
import type { APIResponse, User } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * GET /api/admin/users
 * List all users (admin only)
 */
export async function GET() {
  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const db = getNocoDBClient();
    const response = await db.dbTableRow.list(
      'noco',
      'SubzCreator',
      'Users',
      {
        sort: '-CreatedAt',
        limit: 1000,
      }
    );

    // Remove password hashes from response
    const users = ((response.list || []) as User[]).map((user) => ({
      Id: user.Id,
      Email: user.Email,
      Name: user.Name,
      Role: user.Role,
      CreatedAt: user.CreatedAt,
      UpdatedAt: user.UpdatedAt,
    }));

    return NextResponse.json<APIResponse>({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json<APIResponse>(
      { success: false, error: 'Failed to list users' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users
 * Create new user (admin only)
 */
export async function POST(request: NextRequest) {
  // Rate limit user creation
  const clientIP = getClientIP(request);
  const rateLimitResult = checkRateLimit(`user-create:${clientIP}`, RATE_LIMITS.userCreate);

  if (!rateLimitResult.success) {
    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: 'Too many requests. Please try again later.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.resetIn),
        },
      }
    );
  }

  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const { email, password, name, role = 'editor' } = await request.json();

    // Validate required fields
    if (!email || !password || !name) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Missing required fields: email, password, name' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json<APIResponse>(
        { success: false, error: `${passwordError}. Requirements: ${getPasswordRequirementsText()}` },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['admin', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json<APIResponse>(
        { success: false, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();

    // Sanitize email to prevent NoSQL injection
    const safeEmail = sanitizeEmail(email);

    // Check if user already exists
    const existing = await db.dbTableRow.list(
      'noco',
      'SubzCreator',
      'Users',
      { where: `(Email,eq,${safeEmail})`, limit: 1 }
    );

    if (existing.list?.length > 0) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const user = await db.dbTableRow.create(
      'noco',
      'SubzCreator',
      'Users',
      {
        Email: safeEmail,
        Name: name,
        PasswordHash: passwordHash,
        Role: role,
      }
    ) as User;

    // Audit log user creation
    const { ip, userAgent } = getRequestMetadata(request);
    logAuditEvent({
      type: 'USER_CREATED',
      userId: session!.user.id,
      targetUserId: String(user.Id),
      ip,
      userAgent,
      details: { email: safeEmail, role, createdBy: session!.user.email },
      success: true,
    });

    return NextResponse.json<APIResponse>(
      {
        success: true,
        data: {
          Id: user.Id,
          Email: user.Email,
          Name: user.Name,
          Role: user.Role,
        },
        message: 'User created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json<APIResponse>(
      { success: false, error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
