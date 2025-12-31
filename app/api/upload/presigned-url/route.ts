/**
 * Presigned URL Generation API
 * GET /api/upload/presigned-url
 * Generates a presigned URL for direct S3 upload
 */

import { NextRequest } from 'next/server';
import { createS3Storage, S3Storage } from '@/lib/storage/s3';
import { authenticateRequest, errorResponse, successResponse } from '@/lib/auth/api-middleware';
import { isAllowedMimeType } from '@/lib/constants/media';

export const runtime = 'nodejs';

interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresIn: number;
}

/**
 * GET /api/upload/presigned-url
 * Query params:
 *   - filename: string (required)
 *   - contentType: string (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const searchParams = request.nextUrl.searchParams;
    const filename = searchParams.get('filename');
    const contentType = searchParams.get('contentType') || 'application/octet-stream';

    // Validate required parameters
    if (!filename) {
      return errorResponse('Missing required parameter: filename', 400);
    }

    // Validate file type
    if (!isAllowedMimeType(contentType)) {
      return errorResponse(`Unsupported file type: ${contentType}`, 400);
    }

    // Initialize S3 client
    const s3 = createS3Storage();

    // Generate unique key
    const key = S3Storage.generateKey(userId, filename);

    // Generate presigned URL
    const { url, publicUrl } = await s3.getPresignedUploadUrl(key, {
      contentType,
      expiresIn: 3600, // 1 hour
    });

    const response: PresignedUrlResponse = {
      uploadUrl: url,
      key,
      publicUrl,
      expiresIn: 3600,
    };

    return successResponse(response, 'Presigned URL generated successfully');
  } catch (error) {
    console.error('Presigned URL generation error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to generate presigned URL',
      500
    );
  }
}
