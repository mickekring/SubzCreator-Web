/**
 * Transcriptions API
 * POST /api/transcriptions - Create new transcription job
 * GET /api/transcriptions - List transcriptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNocoDBClient, sanitizeNumericId } from '@/lib/db/nocodb';
import { createASRService } from '@/lib/asr';
import { splitLongSegments, balanceSegmentText, type RawSegment } from '@/lib/utils/segments';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/auth/rate-limit';
import type { APIResponse, Transcription, File } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for long transcriptions

/**
 * GET /api/transcriptions
 * List transcriptions for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const searchParams = request.nextUrl.searchParams;
    const limitParam = searchParams.get('limit') || '50';
    const offsetParam = searchParams.get('offset') || '0';

    // Validate numeric parameters
    const limit = Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100);
    const offset = Math.max(0, parseInt(offsetParam, 10) || 0);

    const db = getNocoDBClient();

    // Get transcriptions for this user - ensure userId is a number
    const userIdNum = sanitizeNumericId(userId);

    const transcriptions = await db.dbTableRow.list(
      'noco',
      'SubzCreator',
      'Transcriptions',
      {
        where: `(UserId,eq,${userIdNum})`,
        limit,
        offset,
        sort: '-CreatedAt',
      }
    );

    return NextResponse.json<APIResponse<typeof transcriptions>>(
      {
        success: true,
        data: transcriptions,
        message: 'Transcriptions retrieved successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get transcriptions error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: 'Failed to retrieve transcriptions',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/transcriptions
 * Create a new transcription job
 * Body:
 *   - fileId: number (ID of the source file)
 *   - sourceFileUrl: string (S3 URL)
 *   - title: string
 *   - language?: string
 *   - provider?: 'berget' | 'groq'
 *   - model?: string (e.g., 'kb-whisper', 'whisper-large-v3')
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Rate limit check for expensive ASR operations
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(`transcription:${userId}:${clientIP}`, {
      maxRequests: 10,
      windowSeconds: 60,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.resetIn) } }
      );
    }

    const body = await request.json();
    const {
      fileId,
      sourceFileUrl,
      title,
      language,
      provider = 'berget',
      model = 'kb-whisper',
    } = body;

    // Validate required fields
    if (!fileId || !sourceFileUrl || !title) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'Missing required fields: fileId, sourceFileUrl, title',
        },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();

    // SECURITY: Verify file ownership before creating transcription
    const file = await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Files',
      fileId
    ) as File | null;

    if (!file) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    if (String(file.UserId) !== userId) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Create transcription record with pending status
    const transcription = await db.dbTableRow.create(
      'noco',
      'SubzCreator',
      'Transcriptions',
      {
        UserId: parseInt(userId),
        FileId: fileId,
        Title: title,
        Status: 'pending',
        Language: language || 'auto',
        Duration: 0,
        SourceFileUrl: sourceFileUrl,
        AsrProvider: provider,
      }
    );

    const transcriptionId = transcription.Id;

    // Start transcription process asynchronously
    // In production, this should be a background job
    processTranscription(transcriptionId, sourceFileUrl, provider, model, language).catch((error) => {
      console.error('Background transcription error:', error);
    });

    return NextResponse.json<APIResponse<typeof transcription>>(
      {
        success: true,
        data: transcription,
        message: 'Transcription job created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create transcription error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create transcription',
      },
      { status: 500 }
    );
  }
}

/**
 * Background transcription processing
 * TODO: Move to a proper job queue in production (Bull, BullMQ, etc.)
 */
async function processTranscription(
  transcriptionId: number,
  sourceFileUrl: string,
  provider: string,
  model: string,
  language?: string
) {
  const db = getNocoDBClient();

  try {
    // Update status to processing
    await db.dbTableRow.update(
      'noco',
      'SubzCreator',
      'Transcriptions',
      transcriptionId,
      {
        Status: 'processing',
      }
    );

    // Initialize ASR service
    const asr = createASRService();

    // Perform transcription
    const result = await asr.transcribeFromUrl(sourceFileUrl, {
      provider: provider as any,
      model,
      language,
    });

    console.log(`ASR result for transcription ${transcriptionId}:`, {
      textLength: result.text?.length,
      segmentsCount: result.segments?.length || 0,
      language: result.language,
      duration: result.duration,
      firstSegment: result.segments?.[0],
    });

    // Update transcription with results
    await db.dbTableRow.update(
      'noco',
      'SubzCreator',
      'Transcriptions',
      transcriptionId,
      {
        Status: 'completed',
        TranscriptText: result.text,
        Language: result.language || language || 'unknown',
        Duration: result.duration || 0,
        Confidence: result.segments
          ? result.segments.reduce((sum, seg) => sum + (seg.confidence || 0), 0) / result.segments.length
          : 0,
      }
    );

    // Store segments if available - split long segments for proper subtitles
    if (result.segments && result.segments.length > 0) {
      // Convert to RawSegment format and split long segments
      const rawSegments: RawSegment[] = result.segments.map((seg, index) => ({
        id: index,
        startTime: seg.startTime,
        endTime: seg.endTime,
        text: seg.text,
        confidence: seg.confidence,
      }));

      // Split segments that are too long (max 84 chars = 42 chars x 2 lines)
      const splitSegments = splitLongSegments(rawSegments, {
        maxCharsPerLine: 42,
        maxLines: 2,
        minSegmentDuration: 1,
      });

      console.log(`Split ${rawSegments.length} segments into ${splitSegments.length} subtitle segments`);

      for (const segment of splitSegments) {
        // Balance the text into two lines if needed (inserts \n at midpoint)
        const balancedText = balanceSegmentText(segment.text, 42);

        await db.dbTableRow.create(
          'noco',
          'SubzCreator',
          'TranscriptionSegments',
          {
            TranscriptionId: transcriptionId,
            StartTime: segment.startTime,
            EndTime: segment.endTime,
            Text: balancedText,
            Confidence: segment.confidence || 0,
            SpeakerId: null,
          }
        );
      }
    }

    console.log(`Transcription ${transcriptionId} completed successfully`);
  } catch (error) {
    console.error(`Transcription ${transcriptionId} failed:`, error);

    // Update status to failed
    await db.dbTableRow.update(
      'noco',
      'SubzCreator',
      'Transcriptions',
      transcriptionId,
      {
        Status: 'failed',
      }
    );
  }
}
