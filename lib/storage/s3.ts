/**
 * S3 Storage Client
 * Handles file uploads, downloads, and presigned URLs for GleSYS Object Storage
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'fs';

export interface S3Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;
  publicUrl?: string;
}

// Directory configuration from environment
export const S3_DIRS = {
  upload: process.env.S3_UPLOAD_FILE_DIR || 'subzcreator/upload',
  video: process.env.S3_VIDEO_FILE_DIR || 'subzcreator/video',
  audio: process.env.S3_AUDIO_FILE_DIR || 'subzcreator/audio',
  subs: process.env.S3_SUBS_DIR || 'subzcreator/subs',
} as const;

export type S3Directory = keyof typeof S3_DIRS;

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  expiresInSeconds?: number;
}

export interface PresignedUrlOptions {
  expiresIn?: number; // seconds, default 3600 (1 hour)
  contentType?: string;
}

/**
 * S3 Storage Service
 */
export class S3Storage {
  private client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor(config: S3Config) {
    this.bucketName = config.bucketName;
    this.publicUrl = config.publicUrl || `https://${config.endpoint}/${config.bucketName}`;

    this.client = new S3Client({
      endpoint: `https://${config.endpoint}`,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true, // Required for GleSYS and MinIO
    });
  }

  /**
   * Generate presigned URL for upload
   */
  async getPresignedUploadUrl(
    key: string,
    options: PresignedUrlOptions = {}
  ): Promise<{ url: string; key: string; publicUrl: string }> {
    const { expiresIn = 3600, contentType } = options;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn,
    });

    return {
      url,
      key,
      publicUrl: this.getPublicUrl(key),
    };
  }

  /**
   * Generate presigned URL for download
   */
  async getPresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Upload file directly
   */
  async upload(
    key: string,
    body: Buffer | Uint8Array | string,
    options: UploadOptions = {}
  ): Promise<{ key: string; publicUrl: string }> {
    const { contentType, metadata } = options;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      })
    );

    return {
      key,
      publicUrl: this.getPublicUrl(key),
    };
  }

  /**
   * Upload file from local path using streaming
   * Memory-efficient for large files
   * Uses @aws-sdk/lib-storage Upload for reliable streaming to S3-compatible storage
   */
  async uploadFromPath(
    key: string,
    filePath: string,
    options: UploadOptions = {}
  ): Promise<{ key: string; publicUrl: string }> {
    const { contentType, metadata } = options;

    // Create a read stream for memory-efficient upload
    const stream = createReadStream(filePath);

    // Use Upload utility for reliable streaming uploads
    // This handles multipart uploads automatically and works better with S3-compatible providers
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucketName,
        Key: key,
        Body: stream,
        ContentType: contentType,
        Metadata: metadata,
      },
    });

    await upload.done();

    return {
      key,
      publicUrl: this.getPublicUrl(key),
    };
  }

  /**
   * Download file
   */
  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error('Empty response body');
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Delete file
   */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })
    );
  }

  /**
   * Check if file exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getMetadata(key: string): Promise<{
    size: number;
    contentType?: string;
    lastModified?: Date;
    metadata?: Record<string, string>;
  }> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })
    );

    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType,
      lastModified: response.LastModified,
      metadata: response.Metadata,
    };
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  /**
   * Generate unique file key with timestamp
   */
  static generateKey(userId: string, filename: string, folder: string = 'uploads'): string {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${folder}/${userId}/${timestamp}-${sanitizedFilename}`;
  }

  /**
   * Generate key for original upload
   */
  static generateUploadKey(userId: string, uuid: string, extension: string): string {
    return `${S3_DIRS.upload}/${userId}/${uuid}-original.${extension}`;
  }

  /**
   * Generate key for 480p preview video
   */
  static generateVideoKey(userId: string, uuid: string): string {
    return `${S3_DIRS.video}/${userId}/${uuid}-480p.mp4`;
  }

  /**
   * Generate key for transcription audio
   */
  static generateAudioKey(userId: string, uuid: string): string {
    return `${S3_DIRS.audio}/${userId}/${uuid}.mp3`;
  }

  /**
   * Generate key for subtitle file
   */
  static generateSubsKey(userId: string, uuid: string, format: string): string {
    return `${S3_DIRS.subs}/${userId}/${uuid}.${format}`;
  }

  /**
   * Generate key for thumbnail image
   */
  static generateThumbnailKey(userId: string, uuid: string): string {
    return `${S3_DIRS.video}/${userId}/${uuid}-thumb.jpg`;
  }
}

/**
 * Create S3 storage instance from environment variables
 */
export function createS3Storage(): S3Storage {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const region = process.env.S3_DEFAULT_REGION || 'us-east-1';
  const bucketName = process.env.S3_BUCKET_NAME || process.env.S3_BUCKET;
  const publicUrl = process.env.S3_FILE_URL;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('Missing required S3 environment variables');
  }

  return new S3Storage({
    endpoint,
    accessKeyId,
    secretAccessKey,
    region,
    bucketName,
    publicUrl,
  });
}
