/**
 * Simple in-memory rate limiter for auth endpoints
 * Protects against brute force attacks
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store (will reset on server restart)
// For production, consider using Redis
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);

  // Don't prevent Node from exiting
  cleanupTimer.unref();
}

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetIn: number; // seconds until reset
}

/**
 * Check rate limit for a given identifier (e.g., IP address, email)
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  startCleanup();

  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const key = identifier;

  let entry = rateLimitStore.get(key);

  // If no entry or entry has expired, create new one
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(key, entry);

    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetIn: config.windowSeconds,
    };
  }

  // Increment count
  entry.count++;

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetIn = Math.ceil((entry.resetTime - now) / 1000);

  // Check if over limit
  if (entry.count > config.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetIn,
    };
  }

  return {
    success: true,
    remaining,
    resetIn,
  };
}

/**
 * Get the IP address from a request
 */
export function getClientIP(request: Request): string {
  // Try various headers that might contain the real IP
  const headers = request.headers;

  // X-Forwarded-For is common when behind a proxy/load balancer
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP in the list (original client)
    return forwardedFor.split(',')[0].trim();
  }

  // X-Real-IP is sometimes used by Nginx
  const realIP = headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // CF-Connecting-IP for Cloudflare
  const cfIP = headers.get('cf-connecting-ip');
  if (cfIP) {
    return cfIP;
  }

  // Fallback - might not be accurate behind proxy
  return 'unknown';
}

/**
 * Default rate limit configurations
 */
export const RATE_LIMITS = {
  // Login attempts: 5 per minute
  login: {
    maxRequests: 5,
    windowSeconds: 60,
  },
  // Password reset: 3 per hour
  passwordReset: {
    maxRequests: 3,
    windowSeconds: 3600,
  },
  // User creation (admin): 10 per minute
  userCreate: {
    maxRequests: 10,
    windowSeconds: 60,
  },
  // General API: 100 per minute
  api: {
    maxRequests: 100,
    windowSeconds: 60,
  },
} as const;
