/**
 * Translation Detail API
 * GET /api/translate/:transcriptionId - Get translations for a transcription
 * DELETE /api/translate/:transcriptionId - Delete translation for a language
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNocoDBClient, sanitizeNocoDBValue, sanitizeNumericId } from '@/lib/db/nocodb';
import type {
  APIResponse,
  Transcription,
  TranslatedSegment,
} from '@/lib/types';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    transcriptionId: string;
  }>;
}

/**
 * GET /api/translate/:transcriptionId
 * Get translated segments for a transcription
 * Query params:
 *   - language: Target language to fetch (optional, returns all if not specified)
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

    const { transcriptionId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const targetLanguage = searchParams.get('language');

    if (!transcriptionId) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Transcription ID is required' },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();

    // Verify transcription ownership
    const transcription = (await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Transcriptions',
      transcriptionId
    )) as Transcription | null;

    if (!transcription) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Transcription not found' },
        { status: 404 }
      );
    }

    if (String(transcription.UserId) !== session.user.id) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Sanitize inputs for NocoDB query
    const safeTranscriptionId = sanitizeNumericId(transcriptionId);
    const safeTargetLanguage = targetLanguage ? sanitizeNocoDBValue(targetLanguage) : null;

    // Build query
    let where = `(TranscriptionId,eq,${safeTranscriptionId})`;
    if (safeTargetLanguage) {
      where += `~and(TargetLanguage,eq,${safeTargetLanguage})`;
    }

    // Fetch translated segments
    const translationsResult = await db.dbTableRow.list(
      'noco',
      'SubzCreator',
      'TranslatedSegments',
      {
        where,
        sort: 'SegmentIndex',
        limit: 10000,
      }
    );

    const translations = (translationsResult.list || []) as TranslatedSegment[];

    // Group by language if no specific language requested
    if (!targetLanguage) {
      const byLanguage: Record<string, TranslatedSegment[]> = {};
      for (const segment of translations) {
        if (!byLanguage[segment.TargetLanguage]) {
          byLanguage[segment.TargetLanguage] = [];
        }
        byLanguage[segment.TargetLanguage].push(segment);
      }

      // Get available languages with segment counts
      const availableLanguages = Object.entries(byLanguage).map(
        ([language, segments]) => ({
          language,
          segmentCount: segments.length,
        })
      );

      return NextResponse.json<APIResponse>(
        {
          success: true,
          data: {
            transcriptionId: parseInt(transcriptionId, 10),
            availableLanguages,
            translations: byLanguage,
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json<APIResponse>(
      {
        success: true,
        data: {
          transcriptionId: parseInt(transcriptionId, 10),
          language: targetLanguage,
          segments: translations,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get translations error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get translations',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/translate/:transcriptionId
 * Delete translation for a specific language
 * Query params:
 *   - language: Target language to delete (required)
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

    const { transcriptionId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const targetLanguage = searchParams.get('language');

    if (!transcriptionId) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Transcription ID is required' },
        { status: 400 }
      );
    }

    if (!targetLanguage) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Language parameter is required' },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();

    // Verify transcription ownership
    const transcription = (await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Transcriptions',
      transcriptionId
    )) as Transcription | null;

    if (!transcription) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Transcription not found' },
        { status: 404 }
      );
    }

    if (String(transcription.UserId) !== session.user.id) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Sanitize inputs for NocoDB query
    const safeTranscriptionId = sanitizeNumericId(transcriptionId);
    const safeTargetLanguage = sanitizeNocoDBValue(targetLanguage);

    // Find all translated segments for this language
    const translationsResult = await db.dbTableRow.list(
      'noco',
      'SubzCreator',
      'TranslatedSegments',
      {
        where: `(TranscriptionId,eq,${safeTranscriptionId})~and(TargetLanguage,eq,${safeTargetLanguage})`,
        limit: 10000,
      }
    );

    const translations = (translationsResult.list || []) as TranslatedSegment[];

    if (translations.length === 0) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: `No translation found for language: ${targetLanguage}`,
        },
        { status: 404 }
      );
    }

    // Delete all segments for this language in batches
    console.log(
      `Deleting ${translations.length} translated segments for ${targetLanguage}`
    );

    const BATCH_SIZE = 50;
    const segmentIds = translations.map((t) => t.Id);

    for (let i = 0; i < segmentIds.length; i += BATCH_SIZE) {
      const batch = segmentIds.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((id) =>
          db.dbTableRow.delete('noco', 'SubzCreator', 'TranslatedSegments', id)
        )
      );
    }

    console.log(`Deleted ${translations.length} translated segments`);

    return NextResponse.json<APIResponse>(
      {
        success: true,
        message: `Deleted ${translations.length} translated segments for ${targetLanguage}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete translation error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete translation',
      },
      { status: 500 }
    );
  }
}
