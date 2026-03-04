/**
 * Translated Segment API
 * PATCH /api/translated-segments/:id - Update translated segment
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import NocoDBClient, { getNocoDBClient } from '@/lib/db/nocodb';
import type { APIResponse, Transcription, TranslatedSegment } from '@/lib/types';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * PATCH /api/translated-segments/:id
 * Update a translated segment - must belong to authenticated user's transcription
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
          error: 'Segment ID is required',
        },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();
    const { baseId, tableId: translatedSegmentsTableId } = await NocoDBClient.getIds('TranslatedSegments');
    const { tableId: transcriptionsTableId } = await NocoDBClient.getIds('Transcriptions');

    // Get translated segment to verify ownership through transcription
    const existingSegment = await db.dbTableRow.read(
      'noco',
      baseId,
      translatedSegmentsTableId,
      id
    ) as TranslatedSegment | null;

    if (!existingSegment) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Translated segment not found' },
        { status: 404 }
      );
    }

    // Get parent transcription to verify ownership
    const transcription = await db.dbTableRow.read(
      'noco',
      baseId,
      transcriptionsTableId,
      existingSegment.TranscriptionId
    ) as Transcription | null;

    if (!transcription || String(transcription.UserId) !== session.user.id) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Build update object (allow text and timing fields)
    const allowedFields = ['TranslatedText', 'StartTime', 'EndTime'];
    const updateData: Record<string, unknown> = {};

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

    // Update segment
    const segment = await db.dbTableRow.update(
      'noco',
      baseId,
      translatedSegmentsTableId,
      id,
      updateData
    );

    return NextResponse.json<APIResponse<typeof segment>>(
      {
        success: true,
        data: segment,
        message: 'Translated segment updated successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update translated segment error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update translated segment',
      },
      { status: 500 }
    );
  }
}
