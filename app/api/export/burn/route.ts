/**
 * Burnt-in Subtitle Export API
 * POST /api/export/burn - Export video with burnt-in subtitles
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNocoDBClient, sanitizeNumericId, sanitizeNocoDBValue } from '@/lib/db/nocodb';
import { createS3Storage, S3Storage } from '@/lib/storage/s3';
import { generateASS } from '@/lib/export/subtitles';
import { burnSubtitles, saveToTempFile, cleanupTempFile, readFileToBuffer } from '@/lib/media/ffmpeg';
import { checkRateLimit, getClientIP } from '@/lib/auth/rate-limit';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { APIResponse, Transcription, TranscriptionSegment, TranslatedSegment } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 600; // 10 minutes for long videos

const TEMP_DIR = process.env.FFMPEG_TEMP_DIR || '/tmp/subzcreator';

interface SubtitleStyle {
  fontSize?: number;
  fontColor?: string;
  showBackground?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  paddingX?: number;
  paddingY?: number;
}

/**
 * POST /api/export/burn
 * Export video with burnt-in subtitles (must belong to authenticated user)
 * Body:
 *   - transcriptionId: number
 *   - resolution?: '720p' | '1080p' | '4k' (default: '1080p')
 *   - language?: string (target language code for translated subtitles)
 *   - style?: SubtitleStyle (font size, colors, background settings)
 */
export async function POST(request: NextRequest) {
  let tempVideoPath: string | null = null;
  let tempSubtitlePath: string | null = null;
  let outputVideoPath: string | null = null;

  try {
    // Authenticate
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Rate limit check for expensive video processing operations
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(`export-burn:${session.user.id}:${clientIP}`, {
      maxRequests: 5,
      windowSeconds: 300, // 5 per 5 minutes for heavy operations
    });

    if (!rateLimitResult.success) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.resetIn) } }
      );
    }

    const body = await request.json();
    const { transcriptionId, resolution = '1080p', language, style = {} as SubtitleStyle } = body;

    if (!transcriptionId) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'Missing required field: transcriptionId',
        },
        { status: 400 }
      );
    }

    const db = getNocoDBClient();
    const s3 = createS3Storage();

    // Get transcription
    const transcription = (await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Transcriptions',
      transcriptionId
    )) as Transcription | null;

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

    // Get associated file for original video URL
    const file = (await db.dbTableRow.read(
      'noco',
      'SubzCreator',
      'Files',
      transcription.FileId
    )) as any;

    if (!file) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'Original file not found',
        },
        { status: 404 }
      );
    }

    // Check if we have original file - prefer OriginalUrl over StorageUrl
    // StorageUrl is the 480p preview, OriginalUrl is the full quality original
    const originalVideoUrl = file.OriginalUrl || file.StorageUrl;
    if (!originalVideoUrl) {
      return NextResponse.json<APIResponse>(
        {
          success: false,
          error: 'Original file URL not available',
        },
        { status: 404 }
      );
    }

    // Sanitize transcriptionId for NocoDB query
    const safeTranscriptionId = sanitizeNumericId(transcriptionId);
    const safeLanguage = language ? sanitizeNocoDBValue(language) : null;

    // Get segments - either original or translated
    let segmentsForBurn: TranscriptionSegment[];

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

      // Map translated segments to the format expected by generateASS
      // Only Text, StartTime, EndTime are used by the ASS generator
      segmentsForBurn = (translatedResult.list as TranslatedSegment[]).map((ts) => ({
        Id: ts.OriginalSegmentId,
        TranscriptionId: ts.TranscriptionId,
        SegmentIndex: ts.SegmentIndex,
        Text: ts.TranslatedText,
        StartTime: ts.StartTime,
        EndTime: ts.EndTime,
        Confidence: 1,
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

      segmentsForBurn = segments.list as TranscriptionSegment[];
    }

    console.log(`Burning subtitles for transcription ${transcriptionId} with ${segmentsForBurn.length} segments${safeLanguage ? ` (${language})` : ''}`);

    console.log('Subtitle style received:', JSON.stringify(style, null, 2));

    // Prepare ASS options with detailed logging
    const assOptions = {
      title: transcription.Title,
      fontSize: style.fontSize || 48,
      fontColor: style.fontColor || '#FFFFFF',
      showBackground: style.showBackground !== false,
      backgroundColor: style.backgroundColor || '#000000',
      backgroundOpacity: style.backgroundOpacity ?? 80,
      paddingY: style.paddingY ?? 5, // Controls box padding (capped at 8 in ASS to avoid line overlap)
    };
    console.log('ASS options being used:', JSON.stringify(assOptions, null, 2));

    // Generate ASS subtitle content with custom styling
    const assContent = generateASS(segmentsForBurn, assOptions);

    // Log first part of ASS content to verify styling
    console.log('ASS content header:', assContent.substring(0, 800));

    // Save ASS to temp file
    tempSubtitlePath = join(TEMP_DIR, `${randomUUID()}.ass`);
    writeFileSync(tempSubtitlePath, assContent, 'utf-8');
    console.log('ASS subtitle saved to:', tempSubtitlePath);

    // Download original video from S3
    console.log('Downloading original video from:', originalVideoUrl);

    // Extract S3 key from URL
    const s3Key = extractS3Key(originalVideoUrl);
    if (!s3Key) {
      // If we can't extract key, try fetching directly from URL
      const response = await fetch(originalVideoUrl);
      if (!response.ok) {
        throw new Error('Failed to download original video');
      }
      const videoBuffer = Buffer.from(await response.arrayBuffer());
      const extension = file.Filename?.split('.').pop() || 'mp4';
      tempVideoPath = await saveToTempFile(videoBuffer, extension);
    } else {
      // Download from S3
      const videoBuffer = await s3.download(s3Key);
      const extension = file.Filename?.split('.').pop() || 'mp4';
      tempVideoPath = await saveToTempFile(videoBuffer, extension);
    }
    console.log('Original video saved to:', tempVideoPath);

    // Burn subtitles with selected resolution
    console.log(`Burning subtitles at ${resolution} with high quality encoding`);
    const result = await burnSubtitles(tempVideoPath, tempSubtitlePath, {
      resolution: resolution as '720p' | '1080p' | '4k',
      quality: 'high',
    });
    outputVideoPath = result.path;
    console.log('Burnt video created:', outputVideoPath, 'Size:', result.size);

    // Read output video
    const outputBuffer = await readFileToBuffer(outputVideoPath);

    // Generate filename (include language if translated)
    const baseFilename = (transcription.Title || 'video')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '_');
    const langSuffix = language ? `_${language}` : '';
    const filename = `${baseFilename}_subtitled${langSuffix}_${resolution}.mp4`;

    // Clean up temp files
    if (tempVideoPath) cleanupTempFile(tempVideoPath);
    if (tempSubtitlePath && existsSync(tempSubtitlePath)) unlinkSync(tempSubtitlePath);
    if (outputVideoPath) cleanupTempFile(outputVideoPath);

    // Return as downloadable file
    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': outputBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Burn subtitles error:', error);

    // Clean up on error
    if (tempVideoPath) cleanupTempFile(tempVideoPath);
    if (tempSubtitlePath && existsSync(tempSubtitlePath)) unlinkSync(tempSubtitlePath);
    if (outputVideoPath) cleanupTempFile(outputVideoPath);

    return NextResponse.json<APIResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to burn subtitles',
      },
      { status: 500 }
    );
  }
}

/**
 * Extract S3 key from public URL
 */
function extractS3Key(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // Remove leading slash
    const path = urlObj.pathname.substring(1);

    // If path starts with bucket name, remove it
    const bucketName = process.env.S3_BUCKET_NAME || process.env.S3_BUCKET || '';
    if (path.startsWith(bucketName + '/')) {
      return path.substring(bucketName.length + 1);
    }

    return path;
  } catch {
    return null;
  }
}
