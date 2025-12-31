/**
 * Media Upload & Processing API
 * Handles file upload with FFmpeg conversion
 *
 * Flow:
 * 1. Upload original file to S3 (upload dir)
 * 2. Create file record with 'processing' status
 * 3. Start background FFmpeg processing
 * 4. Convert to 480p preview (video) and extract audio (MP3)
 * 5. Upload converted files to S3
 * 6. Update file record with URLs and 'ready' status
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createS3Storage, S3Storage } from '@/lib/storage/s3';
import { getNocoDBClient, NocoDBApi } from '@/lib/db/nocodb';
import {
  saveStreamToTempFile,
  processMediaFile,
  cleanupTempFile,
  getMediaInfo,
} from '@/lib/media/ffmpeg';
import { authenticateRequest, errorResponse } from '@/lib/auth/api-middleware';
import { isAllowedMimeType, FILE_SIZE_LIMITS } from '@/lib/constants/media';
import type { APIResponse } from '@/lib/types';

// Allow longer processing time for large files
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  const tempFiles: string[] = [];

  try {
    const authResult = await authenticateRequest();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return errorResponse('No file provided', 400);
    }

    // Validate file type
    if (!isAllowedMimeType(file.type)) {
      return errorResponse(`Unsupported file type: ${file.type}`, 400);
    }

    // Validate file size
    if (file.size > FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
      return errorResponse('File too large. Maximum size is 2GB.', 400);
    }

    const uuid = randomUUID();
    const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const isVideo = file.type.startsWith('video');

    // Initialize storage and database
    const s3 = createS3Storage();
    const db = getNocoDBClient();

    // Step 1: Stream file directly to temp file (memory-efficient for large files)
    const tempOriginalPath = await saveStreamToTempFile(file.stream(), extension);
    tempFiles.push(tempOriginalPath);

    // Get media info
    const mediaInfo = await getMediaInfo(tempOriginalPath);

    // Step 2: Upload original to S3 from temp file (streaming - memory efficient)
    const originalKey = S3Storage.generateUploadKey(userId, uuid, extension);
    const { publicUrl: originalUrl } = await s3.uploadFromPath(originalKey, tempOriginalPath, {
      contentType: file.type,
    });

    // Step 3: Create file record with 'processing' status
    const fileRecord = await db.dbTableRow.create(
      'noco',
      'SubzCreator',
      'Files',
      {
        UserId: userId,
        Filename: file.name,
        FileType: isVideo ? 'video' : 'audio',
        MimeType: file.type,
        Size: file.size,
        Duration: Math.round(mediaInfo.duration),
        OriginalUrl: originalUrl,
        StorageUrl: originalUrl, // Temporary, will be updated
        AudioUrl: '', // Will be updated after processing
        Status: 'processing',
        ProcessingProgress: 10,
      }
    );

    const fileId = fileRecord.Id;

    // Step 4: Start background processing (non-blocking)
    processInBackground(
      fileId,
      tempOriginalPath,
      userId,
      uuid,
      isVideo,
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
        filename: file.name,
        status: 'processing',
        originalUrl,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);

    // Clean up temp files on error
    for (const tempFile of tempFiles) {
      cleanupTempFile(tempFile);
    }

    return errorResponse(
      error instanceof Error ? error.message : 'Upload failed',
      500
    );
  }
}

/**
 * Background processing function
 */
async function processInBackground(
  fileId: number,
  tempOriginalPath: string,
  userId: string,
  uuid: string,
  isVideo: boolean,
  s3: S3Storage,
  db: NocoDBApi,
  tempFiles: string[]
) {
  try {
    // Update progress: Starting conversion
    await updateFileProgress(db, fileId, 20, 'processing');

    // Step 5: Process media (FFmpeg conversion)
    const result = await processMediaFile(tempOriginalPath);

    if (result.previewPath) tempFiles.push(result.previewPath);
    if (result.thumbnailPath) tempFiles.push(result.thumbnailPath);
    tempFiles.push(result.audioPath);

    // Update progress: Uploading converted files
    await updateFileProgress(db, fileId, 50, 'processing');

    // Step 6: Upload converted files to S3 (using streaming for memory efficiency)
    let previewUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    let audioUrl: string;

    // Upload audio (streaming)
    const audioKey = S3Storage.generateAudioKey(userId, uuid);
    const audioUpload = await s3.uploadFromPath(audioKey, result.audioPath, {
      contentType: 'audio/mpeg',
    });
    audioUrl = audioUpload.publicUrl;

    await updateFileProgress(db, fileId, 70, 'processing');

    // Upload video preview (if video, streaming)
    if (isVideo && result.previewPath) {
      const previewKey = S3Storage.generateVideoKey(userId, uuid);
      const previewUpload = await s3.uploadFromPath(previewKey, result.previewPath, {
        contentType: 'video/mp4',
      });
      previewUrl = previewUpload.publicUrl;
    }

    // Upload thumbnail (if video and thumbnail was generated, streaming)
    if (isVideo && result.thumbnailPath) {
      const thumbnailKey = S3Storage.generateThumbnailKey(userId, uuid);
      const thumbnailUpload = await s3.uploadFromPath(thumbnailKey, result.thumbnailPath, {
        contentType: 'image/jpeg',
      });
      thumbnailUrl = thumbnailUpload.publicUrl;
      console.log(`Thumbnail uploaded: ${thumbnailUrl}`);
    }

    await updateFileProgress(db, fileId, 90, 'processing');

    // Step 7: Update file record with URLs and 'ready' status
    const storageUrl = previewUrl || audioUrl; // Use preview for video, audio for audio-only

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
async function updateFileProgress(db: NocoDBApi, fileId: number, progress: number, status: string) {
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
