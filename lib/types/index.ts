/**
 * Common Types for SubzCreator
 */

// User Types
export interface User {
  Id: number
  Email: string
  Name: string
  PasswordHash: string
  Role: 'admin' | 'editor' | 'viewer'
  CreatedAt: string
  UpdatedAt: string
}

// File Types
export interface File {
  Id: number
  UserId: number
  Filename: string
  FileType: 'audio' | 'video'
  MimeType: string
  Size: number
  Duration: number
  // Storage URLs
  OriginalUrl: string      // Original file in upload dir
  PreviewUrl?: string      // 480p video preview (video only)
  ThumbnailUrl?: string    // Thumbnail image (video only, extracted at 25%)
  AudioUrl: string         // MP3 for transcription
  StorageUrl: string       // Legacy: same as PreviewUrl or AudioUrl for playback
  // Processing status
  Status: 'uploading' | 'processing' | 'ready' | 'error'
  ProcessingProgress?: number  // 0-100
  ProcessingError?: string
  CreatedAt: string
  UpdatedAt: string
}

// Media Processing Job
export interface MediaJob {
  Id: number
  FileId: number
  UserId: number
  Status: 'pending' | 'processing' | 'completed' | 'failed'
  Progress: number  // 0-100
  CurrentStep: 'uploading' | 'converting_video' | 'extracting_audio' | 'finalizing'
  Error?: string
  CreatedAt: string
  UpdatedAt: string
}

// Transcription Types
export interface Transcription {
  Id: number
  UserId: number
  FileId: number  // Links to Files table for video/audio playback
  Title: string
  Status: 'pending' | 'processing' | 'completed' | 'failed'
  Language: string
  Duration: number
  SourceFileUrl: string
  TranscriptText: string
  Confidence: number
  AsrProvider: 'groq' | 'berget'
  CreatedAt: string
  UpdatedAt: string
}

export interface TranscriptionSegment {
  Id: number
  TranscriptionId: number
  StartTime: number
  EndTime: number
  Text: string
  Confidence: number
  SpeakerId?: number
  CreatedAt: string
  UpdatedAt: string
}

// Translation Types
export interface TranslatedSegment {
  Id: number
  TranscriptionId: number
  OriginalSegmentId: number
  SegmentIndex: number
  TargetLanguage: string
  TranslatedText: string
  StartTime: number
  EndTime: number
  CreatedAt: string
  UpdatedAt: string
}

export interface TranslationRequest {
  transcriptionId: number
  targetLanguage: string
  provider?: 'openai' | 'berget'
  model?: string
}

export interface TranslationProgress {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number  // 0-100
  currentBatch?: number
  totalBatches?: number
  error?: string
}

export interface TranslationBatchInput {
  segments: { index: number; text: string }[]
}

export interface TranslationBatchOutput {
  segments: { index: number; text: string }[]
}

// Subtitle Types
export interface Subtitle {
  Id: number
  TranscriptionId: number
  Format: 'srt' | 'vtt' | 'stl' | 'ttml'
  Language: string
  Content: string
  Settings: SubtitleSettings
  CreatedAt: string
  UpdatedAt: string
}

export interface SubtitleSettings {
  fontSize?: number
  fontFamily?: string
  textColor?: string
  backgroundColor?: string
  position?: 'top' | 'middle' | 'bottom'
  maxLineLength?: number
  charactersPerSecond?: number
}

// Glossary Types
export interface Glossary {
  Id: number
  UserId: number
  Name: string
  Terms: GlossaryTerm[]
  Language: string
  IsActive: boolean
  CreatedAt: string
  UpdatedAt: string
}

export interface GlossaryTerm {
  original: string
  replacement: string
  caseSensitive?: boolean
}

// ASR Types
export interface ASRRequest {
  fileUrl: string
  language?: string
  provider?: 'groq' | 'berget'
}

export interface ASRResponse {
  text: string
  segments: ASRSegment[]
  language: string
  duration: number
}

export interface ASRSegment {
  id: number
  start: number
  end: number
  text: string
  confidence?: number
}

// Upload Types
export interface UploadPresignedUrlRequest {
  filename: string
  fileType: string
  fileSize: number
}

export interface UploadPresignedUrlResponse {
  url: string
  fileId: string
  expiresIn: number
}

// API Response Types
export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Pagination Types
export interface PaginationParams {
  limit?: number
  offset?: number
  sort?: string
}

export interface PaginatedResponse<T> {
  list: T[]
  pageInfo: {
    totalRows: number
    page: number
    pageSize: number
    isFirstPage: boolean
    isLastPage: boolean
  }
}
