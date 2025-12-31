/**
 * Files API
 * Handles file record CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNocoDBClient } from '@/lib/db/nocodb';
import { authenticateRequest, errorResponse, successResponse } from '@/lib/auth/api-middleware';
import type { APIResponse, File } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * GET /api/files
 * List all files for the authenticated user
 * Query params:
 *   - limit: number (optional, default 50)
 *   - offset: number (optional, default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const searchParams = request.nextUrl.searchParams;
    const limitParam = searchParams.get('limit') || '50';
    const offsetParam = searchParams.get('offset') || '0';

    // Validate numeric parameters
    const limit = Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100);
    const offset = Math.max(0, parseInt(offsetParam, 10) || 0);

    const db = getNocoDBClient();

    // Get files for this user - ensure userId is a number for the query
    const userIdNum = parseInt(userId, 10);

    const files = await db.dbTableRow.list(
      'noco',
      'SubzCreator',
      'Files',
      {
        where: `(UserId,eq,${userIdNum})`,
        limit,
        offset,
        sort: '-CreatedAt',
      }
    );

    return NextResponse.json<APIResponse<typeof files>>(
      {
        success: true,
        data: files,
        message: 'Files retrieved successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get files error:', error);

    return errorResponse('Failed to retrieve files', 500);
  }
}

/**
 * POST /api/files
 * Create a new file record after upload
 * Body:
 *   - filename: string
 *   - fileType: 'audio' | 'video'
 *   - mimeType: string
 *   - size: number
 *   - storageUrl: string
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;
    const body = await request.json();
    const {
      filename,
      fileType,
      mimeType,
      size,
      storageUrl,
      duration = 0,
    } = body;

    // Validate required fields
    if (!filename || !fileType || !mimeType || !size || !storageUrl) {
      return errorResponse('Missing required fields', 400);
    }

    // Validate fileType
    if (!['audio', 'video'].includes(fileType)) {
      return errorResponse('Invalid fileType. Must be "audio" or "video"', 400);
    }

    const db = getNocoDBClient();

    // Create file record
    const file = await db.dbTableRow.create(
      'noco',
      'SubzCreator',
      'Files',
      {
        UserId: parseInt(userId),
        Filename: filename,
        FileType: fileType,
        MimeType: mimeType,
        Size: size,
        Duration: duration,
        StorageUrl: storageUrl,
        Status: 'ready',
      }
    );

    return successResponse(file, 'File record created successfully', 201);
  } catch (error) {
    console.error('Create file error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to create file record',
      500
    );
  }
}
