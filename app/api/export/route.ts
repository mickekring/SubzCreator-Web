/**
 * Export API
 * POST /api/export - Export transcription in various formats
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNocoDBClient, sanitizeNocoDBValue, sanitizeNumericId } from '@/lib/db/nocodb';
import { checkRateLimit, getClientIP } from '@/lib/auth/rate-limit';
import {
  generateSubtitles,
  getSubtitleMimeType,
  getSubtitleExtension,
  type SubtitleFormat,
} from '@/lib/export/subtitles';
import type { APIResponse, Transcription, TranscriptionSegment, TranslatedSegment } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * POST /api/export
 * Export transcription as subtitle file (must belong to authenticated user)
 * Body:
 *   - transcriptionId: number
 *   - format: 'srt' | 'vtt' | 'ass' | 'txt' | 'json'
 *   - includeTimestamps?: boolean (for txt format)
 *   - language?: string (ISO code for translated version, omit for original)
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

    // Rate limit check for export operations
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(`export:${session.user.id}:${clientIP}`, {
      maxRequests: 30,
      windowSeconds: 60,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.resetIn) } }
      );
    }

    const body = await request.json();
    const { transcriptionId, format, includeTimestamps, language } = body;

    if (!transcriptionId || !format) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'Missing required fields: transcriptionId, format',
        },
        { status: 400 }
      );
    }

    const validFormats: SubtitleFormat[] = ['srt', 'vtt', 'ass', 'txt', 'json'];
    if (!validFormats.includes(format)) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: `Invalid format. Supported: ${validFormats.join(', ')}`,
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
      transcriptionId
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

    // Sanitize inputs for NocoDB query
    const safeTranscriptionId = sanitizeNumericId(transcriptionId);
    const safeLanguage = language ? sanitizeNocoDBValue(language) : null;

    // Get segments - either original or translated
    let segmentsForExport: TranscriptionSegment[];

    if (safeLanguage) {
      // Fetch translated segments
      const translatedResult = await db.dbTableRow.list(
        'noco',
        'SubzCreator',
        'TranslatedSegments',
        {
          where: `(TranscriptionId,eq,${safeTranscriptionId})~and(TargetLanguage,eq,${safeLanguage})`,
          sort: 'SegmentIndex',
          limit: 10000,
        }
      );

      if (!translatedResult.list || translatedResult.list.length === 0) {
        return NextResponse.json<APIResponse>(
          {
            success: false,
            error: `No translated segments found for language: ${language}`,
          },
          { status: 404 }
        );
      }

      // Map translated segments to TranscriptionSegment format for export
      segmentsForExport = (translatedResult.list as TranslatedSegment[]).map((ts) => ({
        Id: ts.OriginalSegmentId,
        TranscriptionId: ts.TranscriptionId,
        StartTime: ts.StartTime,
        EndTime: ts.EndTime,
        Text: ts.TranslatedText,
        Confidence: 1.0,
        CreatedAt: ts.CreatedAt,
        UpdatedAt: ts.UpdatedAt,
      }));
    } else {
      // Fetch original segments
      const segments = await db.dbTableRow.list(
        'noco',
        'SubzCreator',
        'TranscriptionSegments',
        {
          where: `(TranscriptionId,eq,${safeTranscriptionId})`,
          sort: 'StartTime',
          limit: 10000,
        }
      );

      if (!segments.list || segments.list.length === 0) {
        return NextResponse.json<APIResponse>(
          {
            success: false,
            error: 'No segments found for this transcription',
          },
          { status: 404 }
        );
      }

      segmentsForExport = segments.list as TranscriptionSegment[];
    }

    // Generate subtitle content
    const content = generateSubtitles(segmentsForExport, format, {
      title: (transcription as any).Title,
      includeTimestamps,
    });

    // Create filename - include language code if exporting translation
    const baseFilename = ((transcription as any).Title || 'subtitles')
      .replace(/\.[^/.]+$/, '') // Remove existing extension
      .replace(/[^a-zA-Z0-9-_]/g, '_'); // Sanitize
    const languageSuffix = language ? `_${language}` : '';
    const filename = `${baseFilename}${languageSuffix}.${getSubtitleExtension(format)}`;

    // Return as downloadable file
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': getSubtitleMimeType(format),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export',
      },
      { status: 500 }
    );
  }
}
