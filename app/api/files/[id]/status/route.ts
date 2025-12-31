/**
 * File Status API
 * Get current processing status of a file
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNocoDBClient } from '@/lib/db/nocodb';
import type { APIResponse, File } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

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
    const db = getNocoDBClient();

    const file = await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Files',
      id
    ) as File | null;

    if (!file) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'File not found' },
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

    return NextResponse.json<APIResponse>({
      success: true,
      data: {
        id: file.Id,
        status: file.Status,
        progress: file.ProcessingProgress || 0,
        error: file.ProcessingError,
        previewUrl: file.PreviewUrl,
        audioUrl: file.AudioUrl,
        storageUrl: file.StorageUrl,
      },
    });
  } catch (error) {
    console.error('Get file status error:', error);
    return NextResponse.json<APIResponse>(
      { success: false, error: 'Failed to get file status' },
      { status: 500 }
    );
  }
}
