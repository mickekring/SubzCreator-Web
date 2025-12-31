/**
 * Re-split Segments API
 * POST /api/transcriptions/:id/resplit - Re-split long segments into proper subtitles
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNocoDBClient } from '@/lib/db/nocodb';
import { splitLongSegments, balanceSegmentText, type RawSegment } from '@/lib/utils/segments';
import type { APIResponse, Transcription } from '@/lib/types';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * POST /api/transcriptions/:id/resplit
 * Re-split all segments for a transcription to proper subtitle lengths (must belong to authenticated user)
 * Body (optional):
 *   - maxCharsPerLine?: number (default: 42)
 *   - maxLines?: number (default: 2)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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
    const body = await request.json().catch(() => ({}));
    const { maxCharsPerLine = 42, maxLines = 2 } = body;

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

    // Get existing segments
    const existingSegments = await db.dbTableRow.list(
      'noco',
      'SubzCreator',
      'TranscriptionSegments',
      {
        where: `(TranscriptionId,eq,${id})`,
        sort: 'StartTime',
        limit: 10000,
      }
    );

    if (!existingSegments.list || existingSegments.list.length === 0) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'No segments found for this transcription',
        },
        { status: 404 }
      );
    }

    const originalCount = existingSegments.list.length;

    // Convert to RawSegment format
    const rawSegments: RawSegment[] = existingSegments.list.map((seg: any, index: number) => ({
      id: index,
      startTime: seg.StartTime,
      endTime: seg.EndTime,
      text: seg.Text,
      confidence: seg.Confidence,
    }));

    // Split long segments
    const splitSegments = splitLongSegments(rawSegments, {
      maxCharsPerLine,
      maxLines,
      minSegmentDuration: 1,
    });

    console.log(`Re-splitting transcription ${id}: ${originalCount} -> ${splitSegments.length} segments`);

    // Delete existing segments in parallel batches
    const BATCH_SIZE = 50;
    const segmentIds = (existingSegments.list as any[]).map((seg) => seg.Id);

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
    }

    // Create new split segments in parallel batches
    for (let i = 0; i < splitSegments.length; i += BATCH_SIZE) {
      const batch = splitSegments.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((segment) => {
          // Balance the text into two lines if needed (inserts \n at midpoint)
          const balancedText = balanceSegmentText(segment.text, maxCharsPerLine);

          return db.dbTableRow.create(
            'noco',
            'SubzCreator',
            'TranscriptionSegments',
            {
              TranscriptionId: parseInt(id),
              StartTime: segment.startTime,
              EndTime: segment.endTime,
              Text: balancedText,
              Confidence: segment.confidence || 0,
              SpeakerId: null,
            }
          );
        })
      );
    }

    return NextResponse.json<APIResponse>(
      {
        success: true,
        data: {
          originalSegments: originalCount,
          newSegments: splitSegments.length,
          maxCharsPerLine,
          maxLines,
        },
        message: `Successfully re-split ${originalCount} segments into ${splitSegments.length} subtitle segments`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Re-split segments error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to re-split segments',
      },
      { status: 500 }
    );
  }
}
