/**
 * Translation API
 * POST /api/translate - Start translation for a transcription
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNocoDBClient, sanitizeNocoDBValue, sanitizeNumericId } from '@/lib/db/nocodb';
import { createTranslationService } from '@/lib/translation';
import { checkRateLimit, getClientIP } from '@/lib/auth/rate-limit';
import type {
  APIResponse,
  Transcription,
  TranscriptionSegment,
  TranslatedSegment,
  TranslationRequest,
} from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for long translations

/**
 * POST /api/translate
 * Start translation job for a transcription
 * Body: { transcriptionId, targetLanguage, provider?, model? }
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

    // Rate limit check for expensive translation operations
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(`translate:${userId}:${clientIP}`, {
      maxRequests: 20,
      windowSeconds: 60,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.resetIn) } }
      );
    }

    const body: TranslationRequest = await request.json();
    const {
      transcriptionId,
      targetLanguage,
      provider = 'openai',
      model,
    } = body;

    // Validate required fields
    if (!transcriptionId || !targetLanguage) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'Missing required fields: transcriptionId, targetLanguage',
        },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();

    // Verify transcription exists and user owns it
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

    if (String(transcription.UserId) !== userId) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Check if transcription is completed
    if (transcription.Status !== 'completed') {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Transcription must be completed before translation' },
        { status: 400 }
      );
    }

    // Sanitize inputs for NocoDB query
    const safeTranscriptionId = sanitizeNumericId(transcriptionId);
    const safeTargetLanguage = sanitizeNocoDBValue(targetLanguage);

    // Check if translation already exists for this language
    const existingTranslations = await db.dbTableRow.list(
      'noco',
      'SubzCreator',
      'TranslatedSegments',
      {
        where: `(TranscriptionId,eq,${safeTranscriptionId})~and(TargetLanguage,eq,${safeTargetLanguage})`,
        limit: 1,
      }
    );

    if (existingTranslations.list && existingTranslations.list.length > 0) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: `Translation to ${targetLanguage} already exists. Delete it first to re-translate.`,
        },
        { status: 409 }
      );
    }

    // Get all segments for transcription
    const segmentsResult = await db.dbTableRow.list(
      'noco',
      'SubzCreator',
      'TranscriptionSegments',
      {
        where: `(TranscriptionId,eq,${safeTranscriptionId})`,
        sort: 'StartTime',
        limit: 10000,
      }
    );

    const segments = (segmentsResult.list || []) as TranscriptionSegment[];

    if (segments.length === 0) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'No segments found for transcription' },
        { status: 400 }
      );
    }

    console.log(
      `Starting translation: ${segments.length} segments from ${transcription.Language} to ${targetLanguage}`
    );

    // Create translation service and translate
    const translationService = createTranslationService();

    const result = await translationService.translateSegments(segments, {
      provider: provider as 'openai' | 'berget',
      model,
      sourceLanguage: transcription.Language || 'auto',
      targetLanguage,
      context: {
        title: transcription.Title,
      },
      onProgress: (progress) => {
        console.log(
          `Translation progress: ${progress.progress}% (batch ${progress.currentBatch}/${progress.totalBatches})`
        );
      },
    });

    console.log(
      `Translation completed: ${result.segments.length} segments translated using ${result.model}`
    );

    // Create translated segment records
    const translatedRecords = translationService.createTranslatedSegmentRecords(
      transcriptionId,
      segments,
      result.segments,
      targetLanguage
    );

    // Save translated segments to database
    console.log(`Saving ${translatedRecords.length} translated segments to database`);

    for (const record of translatedRecords) {
      await db.dbTableRow.create('noco', 'SubzCreator', 'TranslatedSegments', record);
    }

    console.log('Translation saved successfully');

    return NextResponse.json<APIResponse>(
      {
        success: true,
        data: {
          transcriptionId,
          targetLanguage,
          segmentsTranslated: result.segments.length,
          provider: result.provider,
          model: result.model,
          tokensUsed: result.totalTokensUsed,
        },
        message: `Successfully translated ${result.segments.length} segments to ${targetLanguage}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Translation error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Translation failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/translate
 * Get available languages for translation
 */
export async function GET() {
  try {
    const translationService = createTranslationService();
    const languages = translationService.getSupportedLanguages();

    return NextResponse.json<APIResponse>(
      {
        success: true,
        data: { languages },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get languages error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get languages',
      },
      { status: 500 }
    );
  }
}
