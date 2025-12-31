/**
 * ASR Service Abstraction Layer
 * Provides a unified interface for different ASR providers
 */

import { GroqASR, createGroqASR, type GroqTranscriptionOptions, type GroqTranscriptionResult, type GroqSegment } from './groq';
import { BergetASR, createBergetASR, type BergetTranscriptionOptions, type BergetTranscriptionResult, type BergetSegment } from './berget';

export type ASRProvider = 'groq' | 'berget' | 'openai';

export interface TranscriptionOptions {
  provider?: ASRProvider;
  model?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
}

// Unified segment type that works with all providers
export interface TranscriptionSegment {
  id?: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
  words?: { word: string; start: number; end: number }[];
}

export interface TranscriptionResult {
  text: string;
  segments?: TranscriptionSegment[];
  language?: string;
  duration?: number;
  provider: ASRProvider;
}

// Common interface for ASR clients
interface ASRClient {
  transcribe(audioFile: File | Buffer, options: any): Promise<any>;
  transcribeFromUrl(audioUrl: string, options: any): Promise<any>;
  getSupportedLanguages(): string[];
}

/**
 * Main ASR Service
 */
export class ASRService {
  private groqClient?: GroqASR;
  private bergetClient?: BergetASR;
  private defaultProvider: ASRProvider;

  constructor(defaultProvider: ASRProvider = 'berget') {
    this.defaultProvider = defaultProvider;
  }

  /**
   * Get ASR client for specified provider
   */
  private getClient(provider: ASRProvider): ASRClient {
    switch (provider) {
      case 'groq':
        if (!this.groqClient) {
          this.groqClient = createGroqASR();
        }
        return this.groqClient;

      case 'berget':
        if (!this.bergetClient) {
          this.bergetClient = createBergetASR();
        }
        return this.bergetClient;

      case 'openai':
        // TODO: Implement OpenAI ASR client
        throw new Error('OpenAI ASR is not yet implemented');

      default:
        throw new Error(`Unknown ASR provider: ${provider}`);
    }
  }

  /**
   * Transcribe audio file
   */
  async transcribe(
    audioFile: File | Buffer,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const provider = options.provider || this.defaultProvider;
    const client = this.getClient(provider);

    const result = await client.transcribe(audioFile, {
      model: options.model,
      language: options.language,
      prompt: options.prompt,
      temperature: options.temperature,
      responseFormat: 'verbose_json',
    });

    return {
      ...result,
      provider,
    };
  }

  /**
   * Transcribe from URL
   */
  async transcribeFromUrl(
    audioUrl: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const provider = options.provider || this.defaultProvider;
    const client = this.getClient(provider);

    const result = await client.transcribeFromUrl(audioUrl, {
      model: options.model,
      language: options.language,
      prompt: options.prompt,
      temperature: options.temperature,
      responseFormat: 'verbose_json',
    });

    return {
      ...result,
      provider,
    };
  }

  /**
   * Get supported languages for a provider
   */
  getSupportedLanguages(provider?: ASRProvider): string[] {
    const targetProvider = provider || this.defaultProvider;
    const client = this.getClient(targetProvider);
    return client.getSupportedLanguages();
  }

  /**
   * Check if provider is available
   */
  isProviderAvailable(provider: ASRProvider): boolean {
    try {
      this.getClient(provider);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create ASR service instance
 */
export function createASRService(): ASRService {
  const defaultProvider = (process.env.DEFAULT_ASR_PROVIDER as ASRProvider) || 'groq';
  return new ASRService(defaultProvider);
}

// Re-export types
export type { GroqTranscriptionOptions, GroqTranscriptionResult, GroqSegment };
export type { BergetTranscriptionOptions, BergetTranscriptionResult, BergetSegment };
