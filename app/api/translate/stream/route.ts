/**
 * Translation Stream API
 * POST /api/translate/stream - Start translation with SSE progress updates
 */

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getNocoDBClient, sanitizeNocoDBValue, sanitizeNumericId } from '@/lib/db/nocodb';
import { createTranslationService } from '@/lib/translation';
import { checkRateLimit, getClientIP } from '@/lib/auth/rate-limit';
import type {
  Transcription,
  TranscriptionSegment,
} from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/translate/stream
 * Start translation job with Server-Sent Events for progress updates
 */
export async function POST(request: NextRequest) {
  // Authenticate
  const session = await auth();
  if (!session?.user) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const userId = session.user.id;

  // Rate limit check for expensive translation operations
  const clientIP = getClientIP(request);
  const rateLimitResult = checkRateLimit(`translate-stream:${userId}:${clientIP}`, {
    maxRequests: 20,
    windowSeconds: 60,
  });

  if (!rateLimitResult.success) {
    return new Response(
      JSON.stringify({ success: false, error: 'Too many requests. Please try again later.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(rateLimitResult.resetIn) } }
    );
  }

  const body = await request.json();
  const {
    transcriptionId,
    targetLanguage,
    provider = 'openai',
    model,
  } = body;

  // Validate required fields
  if (!transcriptionId || !targetLanguage) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Missing required fields: transcriptionId, targetLanguage',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
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
    return new Response(
      JSON.stringify({ success: false, error: 'Transcription not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (String(transcription.UserId) !== userId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Access denied' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (transcription.Status !== 'completed') {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Transcription must be completed before translation',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Sanitize inputs for NocoDB query
  const safeTranscriptionId = sanitizeNumericId(transcriptionId);
  const safeTargetLanguage = sanitizeNocoDBValue(targetLanguage);

  // Check if translation already exists
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
    return new Response(
      JSON.stringify({
        success: false,
        error: `Translation to ${targetLanguage} already exists. Delete it first to re-translate.`,
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get all segments
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
    return new Response(
      JSON.stringify({ success: false, error: 'No segments found' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        sendEvent('progress', {
          status: 'processing',
          progress: 0,
          message: 'Starting translation...',
          currentBatch: 0,
          totalBatches: Math.ceil(segments.length / 25),
        });

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
            sendEvent('progress', {
              status: 'processing',
              progress: progress.progress,
              message: `Translating batch ${progress.currentBatch} of ${progress.totalBatches}...`,
              currentBatch: progress.currentBatch,
              totalBatches: progress.totalBatches,
            });
          },
        });

        sendEvent('progress', {
          status: 'processing',
          progress: 90,
          message: 'Saving translations to database...',
        });

        // Create and save translated segment records
        const translatedRecords = translationService.createTranslatedSegmentRecords(
          transcriptionId,
          segments,
          result.segments,
          targetLanguage
        );

        for (const record of translatedRecords) {
          await db.dbTableRow.create('noco', 'SubzCreator', 'TranslatedSegments', record);
        }

        sendEvent('complete', {
          success: true,
          segmentsTranslated: result.segments.length,
          provider: result.provider,
          model: result.model,
          tokensUsed: result.totalTokensUsed,
        });

      } catch (error) {
        console.error('Translation stream error:', error);
        sendEvent('error', {
          success: false,
          error: error instanceof Error ? error.message : 'Translation failed',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
