/**
 * API Authentication Middleware
 * Reusable auth utilities for API routes
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { APIResponse } from '@/lib/types';
import type { Session } from 'next-auth';

/**
 * Authentication result type
 */
export type AuthResult =
  | { success: true; session: Session; userId: string }
  | { success: false; response: NextResponse<APIResponse> };

/**
 * Authenticate a request and return the session or an error response.
 * Use this at the start of protected API routes.
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const authResult = await authenticateRequest();
 *   if (!authResult.success) {
 *     return authResult.response;
 *   }
 *   const { userId, session } = authResult;
 *   // ... rest of handler
 * }
 * ```
 */
export async function authenticateRequest(): Promise<AuthResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      success: false,
      response: NextResponse.json<APIResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  return {
    success: true,
    session,
    userId: session.user.id,
  };
}

/**
 * Authenticate a request and require a specific role.
 * Returns an error response if the user doesn't have the required role.
 *
 * @example
 * ```typescript
 * export async function DELETE(request: NextRequest) {
 *   const authResult = await authenticateWithRole('admin');
 *   if (!authResult.success) {
 *     return authResult.response;
 *   }
 *   // ... rest of handler (user is admin)
 * }
 * ```
 */
export async function authenticateWithRole(
  requiredRole: 'admin' | 'editor' | 'viewer'
): Promise<AuthResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      success: false,
      response: NextResponse.json<APIResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  const userRole = session.user.role;
  const roleHierarchy = { admin: 3, editor: 2, viewer: 1 };
  const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0;
  const requiredLevel = roleHierarchy[requiredRole];

  if (userLevel < requiredLevel) {
    return {
      success: false,
      response: NextResponse.json<APIResponse>(
        { success: false, error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  return {
    success: true,
    session,
    userId: session.user.id,
  };
}

/**
 * Helper to create a standardized error response
 */
export function errorResponse(
  error: string,
  status: number = 500
): NextResponse<APIResponse> {
  return NextResponse.json<APIResponse>(
    { success: false, error },
    { status }
  );
}

/**
 * Helper to create a standardized success response
 */
export function successResponse<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse<APIResponse<T>> {
  return NextResponse.json<APIResponse<T>>(
    { success: true, data, message },
    { status }
  );
}
