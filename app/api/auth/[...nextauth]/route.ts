/**
 * NextAuth.js API Route Handler
 * With rate limiting for login protection
 */

import { NextRequest, NextResponse } from 'next/server';
import { handlers } from '@/auth';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/auth/rate-limit';

export const { GET } = handlers;

/**
 * POST handler with rate limiting
 * Protects login endpoint from brute force attacks
 */
export async function POST(request: NextRequest) {
  // Only rate limit credential login (signIn action)
  const url = new URL(request.url);
  const isSignIn = url.pathname.includes('callback/credentials');

  if (isSignIn) {
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(`login:${clientIP}`, RATE_LIMITS.login);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Too many login attempts. Please try again later.',
          retryAfter: rateLimitResult.resetIn,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.resetIn),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Reset': String(rateLimitResult.resetIn),
          },
        }
      );
    }
  }

  // Proceed with the original handler
  return handlers.POST(request);
}
