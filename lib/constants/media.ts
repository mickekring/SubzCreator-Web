/**
 * Media Constants
 * Single source of truth for media-related constants
 */

// Audio MIME types
export const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/m4a',
  'audio/aiff',
  'audio/ogg',
  'audio/flac',
  'audio/wma',
  'audio/aac',
] as const;

// Video MIME types
export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/x-flv',
  'video/x-ms-wmv',
] as const;

// All allowed media MIME types
export const ALLOWED_MIME_TYPES = [
  ...AUDIO_MIME_TYPES,
  ...VIDEO_MIME_TYPES,
] as const;

// File size limits
export const FILE_SIZE_LIMITS = {
  /** Maximum file size in bytes (2GB) */
  MAX_FILE_SIZE: 2 * 1024 * 1024 * 1024,
  /** Maximum file size for direct upload (1GB) */
  MAX_DIRECT_UPLOAD_SIZE: 1024 * 1024 * 1024,
} as const;

// Type helpers
export type AudioMimeType = typeof AUDIO_MIME_TYPES[number];
export type VideoMimeType = typeof VIDEO_MIME_TYPES[number];
export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

/**
 * Check if a MIME type is an audio type
 */
export function isAudioType(mimeType: string): mimeType is AudioMimeType {
  return AUDIO_MIME_TYPES.includes(mimeType as AudioMimeType);
}

/**
 * Check if a MIME type is a video type
 */
export function isVideoType(mimeType: string): mimeType is VideoMimeType {
  return VIDEO_MIME_TYPES.includes(mimeType as VideoMimeType);
}

/**
 * Check if a MIME type is allowed
 */
export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType);
}
