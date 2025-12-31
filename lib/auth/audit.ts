/**
 * Security Audit Logging
 * Logs security-relevant events for monitoring and compliance
 */

export type AuditEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'PASSWORD_CHANGED'
  | 'ROLE_CHANGED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNAUTHORIZED_ACCESS'
  | 'FILE_UPLOADED'
  | 'FILE_DELETED'
  | 'TRANSCRIPTION_DELETED';

export interface AuditEvent {
  timestamp: string;
  type: AuditEventType;
  userId?: string;
  targetUserId?: string;
  ip?: string;
  userAgent?: string;
  resource?: string;
  details?: Record<string, unknown>;
  success: boolean;
}

/**
 * Log an audit event
 * In production, this should be connected to a log aggregation service
 * like Datadog, CloudWatch, or a dedicated audit log table
 */
export function logAuditEvent(event: Omit<AuditEvent, 'timestamp'>): void {
  const auditEntry: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  // Format as structured log for easy parsing
  const logPrefix = event.success ? '[AUDIT]' : '[AUDIT:FAILED]';

  console.log(
    logPrefix,
    JSON.stringify({
      ...auditEntry,
      // Redact sensitive data
      details: auditEntry.details
        ? sanitizeDetails(auditEntry.details)
        : undefined,
    })
  );

  // In production, you would also:
  // 1. Send to log aggregation service (Datadog, CloudWatch, etc.)
  // 2. Store in a dedicated audit log table for compliance
  // 3. Send alerts for critical events (multiple failed logins, etc.)
}

/**
 * Sanitize details to remove sensitive information
 */
function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'passwordHash', 'token', 'secret', 'apiKey'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Helper to extract request metadata for audit logging
 */
export function getRequestMetadata(request: Request): {
  ip: string;
  userAgent: string;
} {
  const headers = request.headers;

  // Get IP address
  let ip = 'unknown';
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    ip = forwardedFor.split(',')[0].trim();
  } else {
    const realIP = headers.get('x-real-ip');
    if (realIP) ip = realIP;
  }

  // Get user agent
  const userAgent = headers.get('user-agent') || 'unknown';

  return { ip, userAgent };
}
