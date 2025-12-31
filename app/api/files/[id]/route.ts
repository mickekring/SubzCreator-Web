/**
 * File Detail API
 * GET /api/files/:id - Get file by ID
 * DELETE /api/files/:id - Delete file
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNocoDBClient } from '@/lib/db/nocodb';
import { createS3Storage } from '@/lib/storage/s3';
import type { APIResponse, File } from '@/lib/types';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/files/:id
 * Get file by ID (must belong to authenticated user)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Authenticate
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'File ID is required',
        },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();

    // Get file
    const file = await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Files',
      id
    ) as File | null;

    if (!file) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'File not found',
        },
        { status: 404 }
      );
    }

    // Verify ownership
    if (String(file.UserId) !== session.user.id) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json<APIResponse<typeof file>>(
      {
        success: true,
        data: file,
        message: 'File retrieved successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get file error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve file',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/files/:id
 * Delete file and associated storage (must belong to authenticated user)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Authenticate
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'File ID is required',
        },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();

    // Get file to extract storage URL
    const file = await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Files',
      id
    ) as File | null;

    if (!file) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'File not found',
        },
        { status: 404 }
      );
    }

    // Verify ownership
    if (String(file.UserId) !== session.user.id) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Delete from S3 if storage URL exists
    if (file.StorageUrl) {
      try {
        const s3 = createS3Storage();
        // Extract key from URL
        const url = new URL(file.StorageUrl);
        const key = url.pathname.substring(1); // Remove leading slash
        await s3.delete(key);
      } catch (s3Error) {
        console.error('S3 delete error:', s3Error);
        // Continue with database deletion even if S3 delete fails
      }
    }

    // Delete from database
    await db.dbTableRow.delete(
      'noco',
      'SubzCreator',
      'Files',
      id
    );

    return NextResponse.json<APIResponse>(
      {
        success: true,
        message: 'File deleted successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete file error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete file',
      },
      { status: 500 }
    );
  }
}
