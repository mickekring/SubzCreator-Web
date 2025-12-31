/**
 * FFmpeg Service
 * Handles video/audio conversion for transcription workflow
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

// Temp directory for processing
const TEMP_DIR = process.env.FFMPEG_TEMP_DIR || '/tmp/subzcreator';

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

export interface MediaInfo {
  duration: number; // seconds
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
  format: string;
  size: number;
}

export interface ConversionResult {
  path: string;
  size: number;
  duration: number;
}

/**
 * Get media file information using ffprobe
 */
export async function getMediaInfo(inputPath: string): Promise<MediaInfo> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath
    ]);
    const data = JSON.parse(stdout);

    const format = data.format || {};
    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');

    return {
      duration: parseFloat(format.duration || '0'),
      width: videoStream?.width,
      height: videoStream?.height,
      codec: videoStream?.codec_name || audioStream?.codec_name,
      bitrate: parseInt(format.bit_rate || '0', 10),
      format: format.format_name || 'unknown',
      size: parseInt(format.size || '0', 10),
    };
  } catch (error) {
    console.error('ffprobe error:', error);
    throw new Error('Failed to get media info');
  }
}

/**
 * Convert video to 480p web preview
 * - 480p height (width auto-scaled to maintain aspect ratio)
 * - H.264 codec for maximum compatibility
 * - Lower bitrate for fast streaming
 */
export async function convertTo480p(inputPath: string): Promise<ConversionResult> {
  const outputPath = join(TEMP_DIR, `${randomUUID()}-480p.mp4`);

  // FFmpeg arguments:
  // -vf scale=-2:480 = Scale to 480p height, auto-calculate width (divisible by 2)
  // -c:v libx264 = H.264 video codec
  // -preset fast = Faster encoding
  // -crf 28 = Quality (higher = smaller file, 28 is good for preview)
  // -c:a aac = AAC audio codec
  // -b:a 128k = 128kbps audio
  // -movflags +faststart = Enable streaming
  try {
    await execFileAsync('ffmpeg', [
      '-i', inputPath,
      '-vf', 'scale=-2:480',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', outputPath
    ], { maxBuffer: 50 * 1024 * 1024 });

    const stats = statSync(outputPath);
    const info = await getMediaInfo(outputPath);

    return {
      path: outputPath,
      size: stats.size,
      duration: info.duration,
    };
  } catch (error) {
    console.error('480p conversion error:', error);
    // Clean up on failure
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
    throw new Error('Failed to convert to 480p');
  }
}

/**
 * Extract audio as MP3 optimized for transcription
 * - Mono channel (speech is mono)
 * - 16kHz sample rate (Whisper internal rate)
 * - 64kbps bitrate (sufficient for speech, keeps file small)
 */
export async function extractAudioForTranscription(inputPath: string): Promise<ConversionResult> {
  const outputPath = join(TEMP_DIR, `${randomUUID()}.mp3`);

  // FFmpeg arguments:
  // -vn = No video
  // -ac 1 = Mono
  // -ar 16000 = 16kHz sample rate
  // -b:a 64k = 64kbps bitrate
  // -f mp3 = MP3 format
  try {
    await execFileAsync('ffmpeg', [
      '-i', inputPath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-b:a', '64k',
      '-f', 'mp3',
      '-y', outputPath
    ], { maxBuffer: 50 * 1024 * 1024 });

    const stats = statSync(outputPath);
    const info = await getMediaInfo(outputPath);

    return {
      path: outputPath,
      size: stats.size,
      duration: info.duration,
    };
  } catch (error) {
    console.error('Audio extraction error:', error);
    // Clean up on failure
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
    throw new Error('Failed to extract audio');
  }
}

/**
 * Check if input is a video file (has video stream)
 */
export async function isVideoFile(inputPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-select_streams', 'v',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      inputPath
    ]);
    return stdout.trim() === 'video';
  } catch {
    return false;
  }
}

/**
 * Clean up temporary file
 */
export function cleanupTempFile(filePath: string): void {
  try {
    if (existsSync(filePath) && filePath.startsWith(TEMP_DIR)) {
      unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Failed to cleanup temp file:', filePath, error);
  }
}

/**
 * Save buffer to temp file for processing
 * @deprecated Use saveStreamToTempFile for large files to avoid memory issues
 */
export async function saveToTempFile(buffer: Buffer, extension: string): Promise<string> {
  const filePath = join(TEMP_DIR, `${randomUUID()}.${extension}`);

  return new Promise((resolve, reject) => {
    const writeStream = createWriteStream(filePath);
    writeStream.write(buffer);
    writeStream.end();
    writeStream.on('finish', () => resolve(filePath));
    writeStream.on('error', reject);
  });
}

/**
 * Save a ReadableStream to temp file for processing
 * This is memory-efficient for large files as it streams directly to disk
 */
export async function saveStreamToTempFile(
  stream: ReadableStream<Uint8Array>,
  extension: string
): Promise<string> {
  const filePath = join(TEMP_DIR, `${randomUUID()}.${extension}`);

  const writeStream = createWriteStream(filePath);
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Write chunk to file
      await new Promise<void>((resolve, reject) => {
        const canContinue = writeStream.write(value);
        if (canContinue) {
          resolve();
        } else {
          writeStream.once('drain', resolve);
          writeStream.once('error', reject);
        }
      });
    }

    // Close the write stream
    await new Promise<void>((resolve, reject) => {
      writeStream.end();
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    return filePath;
  } catch (error) {
    // Clean up on error
    writeStream.destroy();
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    throw error;
  }
}

/**
 * Read file to buffer
 */
export async function readFileToBuffer(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const readStream = createReadStream(filePath);

    readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    readStream.on('end', () => resolve(Buffer.concat(chunks)));
    readStream.on('error', reject);
  });
}

/**
 * Burn subtitles into video (hardcoded subtitles)
 * - Uses ASS subtitles for styling control
 * - H.264 codec for compatibility
 * - High quality encoding to preserve original quality
 */
export async function burnSubtitles(
  inputPath: string,
  subtitlePath: string,
  options: {
    resolution?: '720p' | '1080p' | '4k';
    quality?: 'high' | 'medium' | 'low';
  } = {}
): Promise<ConversionResult> {
  const { resolution = '1080p', quality = 'high' } = options;
  const outputPath = join(TEMP_DIR, `${randomUUID()}-burned.mp4`);

  // Get source video info to match quality
  const sourceInfo = await getMediaInfo(inputPath);
  console.log('Source video info:', sourceInfo);

  // Quality settings (CRF: lower = better quality, larger file)
  // CRF 16 for high quality is visually lossless for most content
  const crfMap = {
    high: 16,
    medium: 20,
    low: 26,
  };

  // Bitrate targets based on resolution (YouTube high frame rate recommendations)
  // Using high frame rate values to ensure quality for 48/50/60fps content
  const bitrateMap = {
    '720p': '8M',    // YouTube recommends 7.5 Mbps for high frame rate
    '1080p': '12M',  // YouTube recommends 12 Mbps for high frame rate
    '4k': '68M',     // YouTube recommends 53-68 Mbps for high frame rate
  };

  // Escape special characters in subtitle path for FFmpeg filter
  // Note: With execFile we don't need shell escaping, but FFmpeg filter still needs escaping
  const escapedSubPath = subtitlePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "'\\''");

  // Build video filter based on resolution
  let vf = '';
  if (resolution === '720p') {
    vf = `scale=-2:720,subtitles='${escapedSubPath}'`;
  } else if (resolution === '1080p') {
    vf = `scale=-2:1080,subtitles='${escapedSubPath}'`;
  } else {
    // 4k / Original - no scaling, just subtitles
    vf = `subtitles='${escapedSubPath}'`;
  }

  // FFmpeg arguments with high quality settings
  const ffmpegArgs = [
    '-i', inputPath,
    '-vf', vf,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', String(crfMap[quality]),
    '-maxrate', bitrateMap[resolution],
    '-bufsize', bitrateMap[resolution],
    '-profile:v', 'high',
    '-level', '4.1',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '256k',
    '-movflags', '+faststart',
    '-y', outputPath
  ];

  console.log('Burning subtitles with ffmpeg args:', ffmpegArgs);

  try {
    // Longer timeout for high quality encoding
    await execFileAsync('ffmpeg', ffmpegArgs, { maxBuffer: 100 * 1024 * 1024, timeout: 30 * 60 * 1000 });

    const stats = statSync(outputPath);
    const info = await getMediaInfo(outputPath);

    console.log('Output video info:', info);

    return {
      path: outputPath,
      size: stats.size,
      duration: info.duration,
    };
  } catch (error) {
    console.error('Burn subtitles error:', error);
    // Clean up on failure
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
    throw new Error('Failed to burn subtitles into video');
  }
}

/**
 * Extract a thumbnail from video at specified position
 * @param inputPath - Path to video file
 * @param positionPercent - Position in video as percentage (0-100), default 25%
 * @returns Path to thumbnail image
 */
export async function extractThumbnail(
  inputPath: string,
  positionPercent: number = 25
): Promise<{ path: string; size: number }> {
  const outputPath = join(TEMP_DIR, `${randomUUID()}-thumb.jpg`);

  // First get video duration
  const mediaInfo = await getMediaInfo(inputPath);
  const duration = mediaInfo.duration || 0;

  // Calculate position in seconds (at specified percentage of duration)
  const position = Math.max(0, (duration * positionPercent) / 100);

  // FFmpeg arguments to extract a single frame:
  // -ss = seek to position
  // -vframes 1 = extract 1 frame
  // -vf scale = scale to reasonable thumbnail size (720p width max, maintain aspect)
  // -q:v 2 = high quality JPEG (1-31, lower is better)
  try {
    await execFileAsync('ffmpeg', [
      '-ss', String(position),
      '-i', inputPath,
      '-vframes', '1',
      '-vf', "scale='min(720,iw)':-1",
      '-q:v', '2',
      '-y', outputPath
    ], { maxBuffer: 10 * 1024 * 1024 });

    const stats = statSync(outputPath);
    return {
      path: outputPath,
      size: stats.size,
    };
  } catch (error) {
    console.error('Thumbnail extraction error:', error);
    // Clean up on failure
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
    throw new Error('Failed to extract thumbnail');
  }
}

/**
 * Process media file: create preview, extract audio, and thumbnail
 * Returns paths to processed files
 */
export async function processMediaFile(inputPath: string): Promise<{
  isVideo: boolean;
  previewPath?: string;
  previewSize?: number;
  thumbnailPath?: string;
  thumbnailSize?: number;
  audioPath: string;
  audioSize: number;
  duration: number;
}> {
  const isVideo = await isVideoFile(inputPath);

  // Extract audio for transcription (always needed)
  const audioResult = await extractAudioForTranscription(inputPath);

  if (isVideo) {
    // Create 480p preview for video
    const previewResult = await convertTo480p(inputPath);

    // Extract thumbnail at 25% position
    let thumbnailResult: { path: string; size: number } | null = null;
    try {
      thumbnailResult = await extractThumbnail(inputPath, 25);
    } catch (err) {
      console.error('Failed to extract thumbnail, continuing without it:', err);
    }

    return {
      isVideo: true,
      previewPath: previewResult.path,
      previewSize: previewResult.size,
      thumbnailPath: thumbnailResult?.path,
      thumbnailSize: thumbnailResult?.size,
      audioPath: audioResult.path,
      audioSize: audioResult.size,
      duration: audioResult.duration,
    };
  }

  // Audio-only file
  return {
    isVideo: false,
    audioPath: audioResult.path,
    audioSize: audioResult.size,
    duration: audioResult.duration,
  };
}
