/**
 * Berget AI ASR Service
 * Uses KB Whisper - Swedish fine-tuned Whisper model
 * OpenAI-compatible API endpoint
 */

import OpenAI from 'openai';

export interface BergetTranscriptionOptions {
  model?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  responseFormat?: 'json' | 'verbose_json' | 'text';
}

export interface BergetWord {
  word: string;
  start: number;
  end: number;
}

export interface BergetSegment {
  id?: number;
  startTime: number;
  endTime: number;
  text: string;
  words?: BergetWord[];
  confidence?: number;
}

export interface BergetTranscriptionResult {
  text: string;
  segments?: BergetSegment[];
  language?: string;
  duration?: number;
}

/**
 * Berget AI ASR Client
 * Uses KB Whisper for high-quality Swedish transcription
 */
export class BergetASR {
  private client: OpenAI;

  constructor(apiKey: string, baseUrl?: string) {
    if (!apiKey) {
      throw new Error('Berget API key is required');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl || 'https://api.berget.ai/v1',
    });
  }

  /**
   * Transcribe audio file using Berget KB Whisper
   */
  async transcribe(
    audioFile: File | Buffer,
    options: BergetTranscriptionOptions = {}
  ): Promise<BergetTranscriptionResult> {
    try {
      const {
        model = 'kb-whisper',
        language,
        prompt,
        responseFormat = 'verbose_json',
      } = options;

      // Create file object for upload
      const file = audioFile instanceof Buffer
        ? new File([new Uint8Array(audioFile)], 'audio.mp3', { type: 'audio/mpeg' })
        : audioFile;

      // Build request options - only include defined values
      // Note: Berget API is strict about types, so we omit undefined/default values
      const requestOptions: any = {
        file: file as any,
        model,
        response_format: responseFormat,
      };

      // Only add optional parameters if they are defined
      if (language) requestOptions.language = language;
      if (prompt) requestOptions.prompt = prompt;
      // Note: Berget doesn't support temperature parameter, so we skip it

      // Call Berget API (OpenAI compatible)
      const response = await this.client.audio.transcriptions.create(requestOptions);

      // Parse response - Berget always returns verbose JSON with segments and words
      const verboseResponse = response as any;
      console.log('Berget raw response keys:', Object.keys(verboseResponse));
      console.log('Berget segments count:', verboseResponse.segments?.length || 0);
      if (verboseResponse.segments?.[0]) {
        console.log('Berget first segment:', JSON.stringify(verboseResponse.segments[0], null, 2));
      }

      // Map Berget response to our standard format
      const segments: BergetSegment[] = verboseResponse.segments?.map((seg: any, index: number) => ({
        id: index,
        startTime: seg.start,
        endTime: seg.end,
        text: seg.text?.trim() || '',
        words: seg.words?.map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        })),
        // Berget doesn't provide confidence scores, so we don't include them
      })) || [];

      // Calculate duration from last segment if not provided
      const duration = verboseResponse.duration ||
        (segments.length > 0 ? segments[segments.length - 1].endTime : undefined);

      return {
        text: verboseResponse.text || segments.map(s => s.text).join(' '),
        segments,
        language: verboseResponse.language,
        duration,
      };
    } catch (error) {
      console.error('Berget transcription error:', error);
      throw new Error(
        `Berget transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Transcribe from URL
   * Note: Berget supports direct URL transcription via file_url parameter
   */
  async transcribeFromUrl(
    audioUrl: string,
    options: BergetTranscriptionOptions = {}
  ): Promise<BergetTranscriptionResult> {
    try {
      // For now, fetch the file and transcribe
      // TODO: Investigate if Berget's file_url parameter works with the OpenAI SDK
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return this.transcribe(buffer, options);
    } catch (error) {
      console.error('Berget transcription from URL error:', error);
      throw new Error(
        `Failed to transcribe from URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get supported languages
   * KB Whisper is optimized for Swedish but supports all Whisper languages
   */
  getSupportedLanguages(): string[] {
    return [
      'sv', // Swedish - primary and best supported
      'en', 'zh', 'de', 'es', 'ru', 'ko', 'fr', 'ja', 'pt', 'tr',
      'pl', 'ca', 'nl', 'ar', 'it', 'id', 'hi', 'fi', 'vi',
      'he', 'uk', 'el', 'ms', 'cs', 'ro', 'da', 'hu', 'ta', 'no',
    ];
  }
}

/**
 * Create Berget ASR client instance
 */
export function createBergetASR(): BergetASR {
  const apiKey = process.env.BERGET_API_KEY;
  const baseUrl = process.env.BERGET_BASE_URL;

  if (!apiKey) {
    throw new Error('BERGET_API_KEY environment variable is not set');
  }

  // Normalize base URL - remove /audio/transcriptions if present
  // The OpenAI SDK adds the endpoint automatically
  let normalizedBaseUrl = baseUrl;
  if (normalizedBaseUrl?.includes('/audio/transcriptions')) {
    normalizedBaseUrl = normalizedBaseUrl.replace('/audio/transcriptions', '');
  }

  return new BergetASR(apiKey, normalizedBaseUrl);
}
