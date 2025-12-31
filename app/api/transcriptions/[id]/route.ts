/**
 * Transcription Detail API
 * GET /api/transcriptions/:id - Get transcription by ID
 * PATCH /api/transcriptions/:id - Update transcription
 * DELETE /api/transcriptions/:id - Delete transcription
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNocoDBClient } from '@/lib/db/nocodb';
import { createS3Storage } from '@/lib/storage/s3';
import type { APIResponse, Transcription, File as FileRecord } from '@/lib/types';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/transcriptions/:id
 * Get transcription by ID with segments (must belong to authenticated user)
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
          error: 'Transcription ID is required',
        },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();

    // Get transcription
    const transcription = await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Transcriptions',
      id
    ) as Transcription | null;

    if (!transcription) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'Transcription not found',
        },
        { status: 404 }
      );
    }

    // Verify ownership
    if (String(transcription.UserId) !== session.user.id) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get segments
    console.log(`Fetching segments for transcription ID: ${id}`);
    const segments = await db.dbTableRow.list(
      'noco',
      'SubzCreator',
      'TranscriptionSegments',
      {
        where: `(TranscriptionId,eq,${id})`,
        sort: 'StartTime',
        limit: 10000, // High limit to get all segments
      }
    );
    console.log(`Found ${segments.list?.length || 0} segments`);
    if (segments.list?.length) {
      console.log('First segment:', JSON.stringify(segments.list[0]));
    }

    const response = {
      ...transcription,
      segments: segments.list || [],
    };

    return NextResponse.json<APIResponse<typeof response>>(
      {
        success: true,
        data: response,
        message: 'Transcription retrieved successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get transcription error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve transcription',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/transcriptions/:id
 * Update transcription (title, transcript text, etc.)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
    const body = await request.json();

    if (!id) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'Transcription ID is required',
        },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();

    // Verify ownership before update
    const existing = await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Transcriptions',
      id
    ) as Transcription | null;

    if (!existing) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Transcription not found' },
        { status: 404 }
      );
    }

    if (String(existing.UserId) !== session.user.id) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Build update object (only allow certain fields)
    const allowedFields = ['Title', 'TranscriptText', 'Language'];
    const updateData: any = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'No valid fields to update',
        },
        { status: 400 }
      );
    }

    // Update transcription
    const transcription = await db.dbTableRow.update(
      'noco',
      'SubzCreator',
      'Transcriptions',
      id,
      updateData
    );

    return NextResponse.json<APIResponse<typeof transcription>>(
      {
        success: true,
        data: transcription,
        message: 'Transcription updated successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update transcription error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update transcription',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/transcriptions/:id
 * Delete transcription, all associated segments, and the linked file (must belong to authenticated user)
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
    console.log(`DELETE transcription request - ID: ${id}, User: ${session.user.id}`);

    if (!id) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'Transcription ID is required',
        },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();

    // Check if transcription exists
    const transcription = await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Transcriptions',
      id
    ) as Transcription | null;

    console.log(`Found transcription:`, transcription ? { Id: transcription.Id, Status: transcription.Status, UserId: transcription.UserId, FileId: transcription.FileId } : 'null');

    if (!transcription) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'Transcription not found',
        },
        { status: 404 }
      );
    }

    // Verify ownership
    if (String(transcription.UserId) !== session.user.id) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Store FileId for later deletion
    const fileId = transcription.FileId;

    // Delete associated segments
    // Note: In NocoDB, cascade delete might not work automatically
    // So we need to manually delete segments first
    const segments = await db.dbTableRow.list(
      'noco',
      'SubzCreator',
      'TranscriptionSegments',
      {
        where: `(TranscriptionId,eq,${id})`,
        limit: 10000,
      }
    );

    console.log(`Found ${segments.list?.length || 0} segments to delete`);

    if (segments.list && segments.list.length > 0) {
      // Delete segments in parallel batches to avoid N+1 issue
      const BATCH_SIZE = 50;
      const segmentIds = segments.list.map((segment: any) => segment.Id);

      for (let i = 0; i < segmentIds.length; i += BATCH_SIZE) {
        const batch = segmentIds.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map((segmentId) =>
            db.dbTableRow.delete(
              'noco',
              'SubzCreator',
              'TranscriptionSegments',
              segmentId
            )
          )
        );
        console.log(`Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(segmentIds.length / BATCH_SIZE)}`);
      }
      console.log(`All ${segments.list.length} segments deleted`);
    }

    // Delete transcription
    console.log(`Deleting transcription ${id}`);
    const deleteResult = await db.dbTableRow.delete(
      'noco',
      'SubzCreator',
      'Transcriptions',
      id
    );
    console.log(`Transcription delete result:`, deleteResult);

    // Verify transcription deletion succeeded
    const verifyDeleted = await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Transcriptions',
      id
    ).catch(() => null);

    if (verifyDeleted) {
      console.error(`ERROR: Transcription ${id} still exists after delete!`, verifyDeleted);
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'Delete failed - record still exists',
        },
        { status: 500 }
      );
    }

    console.log(`Transcription ${id} deleted successfully`);

    // Delete associated file and S3 objects
    if (fileId) {
      console.log(`Deleting associated file ${fileId}`);
      try {
        // Get file record to get S3 URLs
        const fileRecord = await db.dbTableRow.read(
          'noco',
          'SubzCreator',
          'Files',
          fileId
        ) as FileRecord | null;

        if (fileRecord) {
          // Delete S3 files
          const s3 = createS3Storage();
          const s3PublicUrl = process.env.S3_FILE_URL || '';

          // Helper to extract S3 key from URL
          const extractKey = (url: string | undefined): string | null => {
            if (!url || !s3PublicUrl) return null;
            if (url.startsWith(s3PublicUrl)) {
              return url.substring(s3PublicUrl.length + 1); // +1 for the trailing slash
            }
            return null;
          };

          // Collect all S3 keys to delete
          const keysToDelete = [
            extractKey(fileRecord.OriginalUrl),
            extractKey(fileRecord.PreviewUrl),
            extractKey(fileRecord.ThumbnailUrl),
            extractKey(fileRecord.AudioUrl),
          ].filter((key): key is string => key !== null);

          console.log(`Deleting ${keysToDelete.length} S3 objects:`, keysToDelete);

          // Delete each S3 object
          for (const key of keysToDelete) {
            try {
              await s3.delete(key);
              console.log(`Deleted S3 object: ${key}`);
            } catch (s3Err) {
              console.error(`Failed to delete S3 object ${key}:`, s3Err);
            }
          }
        }

        // Delete file record from database
        await db.dbTableRow.delete(
          'noco',
          'SubzCreator',
          'Files',
          fileId
        );
        console.log(`File record ${fileId} deleted successfully`);
      } catch (fileErr) {
        // Log but don't fail the whole operation if file delete fails
        console.error(`Failed to delete file ${fileId}:`, fileErr);
      }
    }

    return NextResponse.json<APIResponse>(
      {
        success: true,
        message: 'Transcription and associated file deleted successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete transcription error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete transcription',
      },
      { status: 500 }
    );
  }
}
