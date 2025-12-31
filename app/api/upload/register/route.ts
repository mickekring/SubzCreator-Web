/**
 * File Registration API
 * POST /api/upload/register
 * Registers a file that was uploaded directly to S3 and triggers processing
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/auth';
import { createS3Storage, S3Storage } from '@/lib/storage/s3';
import { getNocoDBClient } from '@/lib/db/nocodb';
import {
  saveToTempFile,
  processMediaFile,
  cleanupTempFile,
  readFileToBuffer,
  getMediaInfo,
} from '@/lib/media/ffmpeg';
import type { APIResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for processing

interface RegisterRequest {
  filename: string;
  fileType: 'audio' | 'video';
  mimeType: string;
  size: number;
  s3Key: string;
  storageUrl: string;
}

export async function POST(request: NextRequest) {
  const tempFiles: string[] = [];

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
    const body: RegisterRequest = await request.json();

    const { filename, fileType, mimeType, size, s3Key, storageUrl } = body;

    // Validate required fields
    if (!filename || !fileType || !mimeType || !size || !s3Key || !storageUrl) {
      return NextResponse.json<APIResponse>(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const uuid = randomUUID();
    const isVideo = fileType === 'video';
    const extension = filename.split('.').pop()?.toLowerCase() || 'bin';

    // Initialize storage and database
    const s3 = createS3Storage();
    const db = getNocoDBClient();

    // Create file record with 'processing' status
    const fileRecord = await db.dbTableRow.create(
      'noco',
      'SubzCreator',
      'Files',
      {
        UserId: parseInt(userId),
        Filename: filename,
        FileType: fileType,
        MimeType: mimeType,
        Size: size,
        Duration: 0, // Will be updated after processing
        OriginalUrl: storageUrl,
        StorageUrl: storageUrl,
        AudioUrl: '',
        Status: 'processing',
        ProcessingProgress: 10,
      }
    );

    const fileId = fileRecord.Id;
    console.log(`File ${fileId} registered, starting background processing`);

    // Start background processing (non-blocking)
    processInBackground(
      fileId,
      storageUrl,
      userId,
      uuid,
      isVideo,
      extension,
      s3,
      db,
      tempFiles
    ).catch((error) => {
      console.error('Background processing error:', error);
    });

    // Return immediately with file ID
    return NextResponse.json<APIResponse>({
      success: true,
      data: {
        fileId,
        filename,
        status: 'processing',
        storageUrl,
      },
    });
  } catch (error) {
    console.error('Register file error:', error);

    // Clean up temp files on error
    for (const tempFile of tempFiles) {
      cleanupTempFile(tempFile);
    }

    return NextResponse.json<APIResponse>(
      { success: false, error: error instanceof Error ? error.message : 'Registration failed' },
      { status: 500 }
    );
  }
}

/**
 * Background processing function
 * Downloads from S3, processes with FFmpeg, and re-uploads
 */
async function processInBackground(
  fileId: number,
  sourceUrl: string,
  userId: string,
  uuid: string,
  isVideo: boolean,
  extension: string,
  s3: S3Storage,
  db: any,
  tempFiles: string[]
) {
  try {
    // Update progress: Downloading original
    await updateFileProgress(db, fileId, 15, 'processing');

    // Download original file from S3
    console.log(`Downloading file from ${sourceUrl}`);
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer());
    const tempOriginalPath = await saveToTempFile(fileBuffer, extension);
    tempFiles.push(tempOriginalPath);

    // Get media info
    const mediaInfo = await getMediaInfo(tempOriginalPath);
    console.log(`Media info: duration=${mediaInfo.duration}s`);

    // Update progress: Starting conversion
    await updateFileProgress(db, fileId, 25, 'processing');

    // Process media (FFmpeg conversion)
    const result = await processMediaFile(tempOriginalPath);

    if (result.previewPath) tempFiles.push(result.previewPath);
    if (result.thumbnailPath) tempFiles.push(result.thumbnailPath);
    tempFiles.push(result.audioPath);

    // Update progress: Uploading converted files
    await updateFileProgress(db, fileId, 60, 'processing');

    // Upload converted files to S3
    let previewUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    let audioUrl: string;

    // Upload audio
    const audioBuffer = await readFileToBuffer(result.audioPath);
    const audioKey = S3Storage.generateAudioKey(userId, uuid);
    const audioUpload = await s3.upload(audioKey, audioBuffer, {
      contentType: 'audio/mpeg',
    });
    audioUrl = audioUpload.publicUrl;

    await updateFileProgress(db, fileId, 75, 'processing');

    // Upload video preview (if video)
    if (isVideo && result.previewPath) {
      const previewBuffer = await readFileToBuffer(result.previewPath);
      const previewKey = S3Storage.generateVideoKey(userId, uuid);
      const previewUpload = await s3.upload(previewKey, previewBuffer, {
        contentType: 'video/mp4',
      });
      previewUrl = previewUpload.publicUrl;
    }

    // Upload thumbnail (if video and thumbnail was generated)
    if (isVideo && result.thumbnailPath) {
      const thumbnailBuffer = await readFileToBuffer(result.thumbnailPath);
      const thumbnailKey = S3Storage.generateThumbnailKey(userId, uuid);
      const thumbnailUpload = await s3.upload(thumbnailKey, thumbnailBuffer, {
        contentType: 'image/jpeg',
      });
      thumbnailUrl = thumbnailUpload.publicUrl;
      console.log(`Thumbnail uploaded: ${thumbnailUrl}`);
    }

    await updateFileProgress(db, fileId, 90, 'processing');

    // Update file record with URLs and 'ready' status
    const storageUrl = previewUrl || audioUrl;

    await db.dbTableRow.update(
      'noco',
      'SubzCreator',
      'Files',
      fileId,
      {
        PreviewUrl: previewUrl || null,
        ThumbnailUrl: thumbnailUrl || null,
        AudioUrl: audioUrl,
        StorageUrl: storageUrl,
        Status: 'ready',
        ProcessingProgress: 100,
        Duration: Math.round(result.duration),
      }
    );

    console.log(`File ${fileId} processing complete`);
  } catch (error) {
    console.error(`File ${fileId} processing failed:`, error);

    // Update file record with error status
    try {
      await db.dbTableRow.update(
        'noco',
        'SubzCreator',
        'Files',
        fileId,
        {
          Status: 'error',
          ProcessingError: error instanceof Error ? error.message : 'Processing failed',
        }
      );
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }
  } finally {
    // Clean up all temp files
    for (const tempFile of tempFiles) {
      cleanupTempFile(tempFile);
    }
  }
}

/**
 * Helper to update file progress
 */
async function updateFileProgress(db: any, fileId: number, progress: number, status: string) {
  try {
    await db.dbTableRow.update(
      'noco',
      'SubzCreator',
      'Files',
      fileId,
      {
        ProcessingProgress: progress,
        Status: status,
      }
    );
  } catch (error) {
    console.error('Failed to update progress:', error);
  }
}
