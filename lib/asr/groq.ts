/**
 * Groq ASR Service
 * Uses Groq's Whisper implementation for speech recognition
 */

import OpenAI from 'openai';

export interface GroqTranscriptionOptions {
  model?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  responseFormat?: 'json' | 'verbose_json' | 'text';
}

export interface GroqSegment {
  id?: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
}

export interface GroqTranscriptionResult {
  text: string;
  segments?: GroqSegment[];
  language?: string;
  duration?: number;
}

/**
 * Groq ASR Client
 */
export class GroqASR {
  private client: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Groq API key is required');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }

  /**
   * Transcribe audio file using Groq Whisper
   */
  async transcribe(
    audioFile: File | Buffer,
    options: GroqTranscriptionOptions = {}
  ): Promise<GroqTranscriptionResult> {
    try {
      const {
        model = 'whisper-large-v3',
        language,
        prompt,
        temperature = 0,
        responseFormat = 'verbose_json',
      } = options;

      // Create form data for file upload
      const file = audioFile instanceof Buffer
        ? new File([new Uint8Array(audioFile)], 'audio.mp3', { type: 'audio/mpeg' })
        : audioFile;

      // Call Groq API
      const response = await this.client.audio.transcriptions.create({
        file: file as any,
        model,
        language,
        prompt,
        temperature,
        response_format: responseFormat,
        timestamp_granularities: ['segment'],
      });

      // Parse response based on format
      if (responseFormat === 'verbose_json') {
        const verboseResponse = response as any;
        console.log('Groq raw response keys:', Object.keys(verboseResponse));
        console.log('Groq segments count:', verboseResponse.segments?.length || 0);
        if (verboseResponse.segments?.[0]) {
          console.log('Groq first segment:', verboseResponse.segments[0]);
        }

        return {
          text: verboseResponse.text,
          segments: verboseResponse.segments?.map((seg: any) => ({
            id: seg.id,
            startTime: seg.start,
            endTime: seg.end,
            text: seg.text,
            confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : undefined,
          })) as GroqSegment[],
          language: verboseResponse.language,
          duration: verboseResponse.duration,
        };
      }

      // For 'text' or 'json' format
      return {
        text: typeof response === 'string' ? response : (response as any).text,
      };
    } catch (error) {
      console.error('Groq transcription error:', error);
      throw new Error(
        `Groq transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Transcribe from URL
   */
  async transcribeFromUrl(
    audioUrl: string,
    options: GroqTranscriptionOptions = {}
  ): Promise<GroqTranscriptionResult> {
    try {
      // Fetch audio file from URL
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return this.transcribe(buffer, options);
    } catch (error) {
      console.error('Groq transcription from URL error:', error);
      throw new Error(
        `Failed to transcribe from URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return [
      'en', 'zh', 'de', 'es', 'ru', 'ko', 'fr', 'ja', 'pt', 'tr',
      'pl', 'ca', 'nl', 'ar', 'sv', 'it', 'id', 'hi', 'fi', 'vi',
      'he', 'uk', 'el', 'ms', 'cs', 'ro', 'da', 'hu', 'ta', 'no',
    ];
  }
}

/**
 * Create Groq ASR client instance
 */
export function createGroqASR(): GroqASR {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable is not set');
  }

  return new GroqASR(apiKey);
}
