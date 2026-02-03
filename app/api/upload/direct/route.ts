/**
 * Direct Server-Side Upload API
 * POST /api/upload/direct
 * Alternative to presigned URLs when CORS is not configured
 */

import { NextRequest } from 'next/server';
import { createS3Storage, S3Storage } from '@/lib/storage/s3';
import { authenticateRequest, errorResponse, successResponse } from '@/lib/auth/api-middleware';
import { isAllowedMimeType, FILE_SIZE_LIMITS } from '@/lib/constants/media';
import { checkRateLimit, getClientIP } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large files

interface UploadResponse {
  key: string;
  publicUrl: string;
  filename: string;
  size: number;
  mimeType: string;
}

/**
 * POST /api/upload/direct
 * Upload file directly through server to S3
 * Use this if CORS is not configured on S3 bucket
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Rate limit check for upload operations
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(`upload:${userId}:${clientIP}`, {
      maxRequests: 20,
      windowSeconds: 60,
    });

    if (!rateLimitResult.success) {
      return errorResponse('Too many requests. Please try again later.', 429);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return errorResponse('No file provided', 400);
    }

    // Validate file type
    if (!isAllowedMimeType(file.type)) {
      return errorResponse(`Unsupported file type: ${file.type}`, 400);
    }

    // Validate file size (5GB max for direct upload)
    if (file.size > FILE_SIZE_LIMITS.MAX_DIRECT_UPLOAD_SIZE) {
      return errorResponse('File too large. Maximum size is 5GB', 400);
    }

    console.log(`Uploading file: ${file.name} (${file.size} bytes)`);

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to S3
    const s3 = createS3Storage();
    const key = S3Storage.generateKey(userId, file.name);

    console.log(`Uploading to S3 with key: ${key}`);

    const { publicUrl } = await s3.upload(key, buffer, {
      contentType: file.type,
    });

    console.log(`Upload successful: ${publicUrl}`);

    const response: UploadResponse = {
      key,
      publicUrl,
      filename: file.name,
      size: file.size,
      mimeType: file.type,
    };

    return successResponse(response, 'File uploaded successfully');
  } catch (error) {
    console.error('Upload error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Upload failed',
      500
    );
  }
}
