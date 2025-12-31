/**
 * Translation Service Abstraction Layer
 * Provides a unified interface for LLM-based subtitle translation
 */

import {
  OpenAITranslation,
  createOpenAITranslation,
  type OpenAITranslationOptions,
  type TranslationResult,
} from './openai';
import {
  BergetTranslation,
  createBergetTranslation,
  BERGET_MODELS,
  BERGET_MODEL_NAMES,
} from './berget';
import {
  createTranslationBatches,
  getLanguageName,
  LANGUAGE_NAMES,
} from './prompts';
import type {
  TranscriptionSegment,
  TranslatedSegment,
  TranslationProgress,
} from '@/lib/types';

// Translation client interface (both OpenAI and Berget implement this)
interface TranslationClient {
  translateBatch(
    segments: { index: number; text: string }[],
    options: OpenAITranslationOptions
  ): Promise<TranslationResult>;
  generateContextSummary(fullText: string, sourceLanguage: string): Promise<string>;
}

export type TranslationProvider = 'openai' | 'berget';

export interface TranslationOptions {
  provider?: TranslationProvider;
  model?: string;
  sourceLanguage: string;
  targetLanguage: string;
  context?: {
    title?: string;
    summary?: string;
  };
  batchSize?: number;
  onProgress?: (progress: TranslationProgress) => void;
}

export interface FullTranslationResult {
  segments: { index: number; text: string }[];
  provider: TranslationProvider;
  model: string;
  totalTokensUsed?: number;
}

/**
 * Main Translation Service
 */
export class TranslationService {
  private openaiClient?: OpenAITranslation;
  private bergetClient?: BergetTranslation;
  private defaultProvider: TranslationProvider;

  constructor(defaultProvider: TranslationProvider = 'openai') {
    this.defaultProvider = defaultProvider;
  }

  /**
   * Get translation client for specified provider
   */
  private getClient(provider: TranslationProvider): TranslationClient {
    switch (provider) {
      case 'openai':
        if (!this.openaiClient) {
          this.openaiClient = createOpenAITranslation();
        }
        return this.openaiClient;

      case 'berget':
        if (!this.bergetClient) {
          this.bergetClient = createBergetTranslation();
        }
        return this.bergetClient;

      default:
        throw new Error(`Unknown translation provider: ${provider}`);
    }
  }

  /**
   * Get default model for a provider
   */
  getDefaultModel(provider: TranslationProvider): string {
    switch (provider) {
      case 'openai':
        return process.env.TRANSLATION_MODEL || 'gpt-4.1';
      case 'berget':
        return process.env.BERGET_TRANSLATION_MODEL || BERGET_MODELS.GPT_OSS;
      default:
        return 'gpt-4.1';
    }
  }

  /**
   * Get available models for a provider
   */
  getAvailableModels(provider: TranslationProvider): { id: string; name: string }[] {
    switch (provider) {
      case 'openai':
        return [
          { id: 'gpt-4.1', name: 'GPT-4.1' },
          { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
        ];
      case 'berget':
        return Object.entries(BERGET_MODEL_NAMES).map(([id, name]) => ({ id, name }));
      default:
        return [];
    }
  }

  /**
   * Translate all segments from a transcription
   */
  async translateSegments(
    segments: TranscriptionSegment[],
    options: TranslationOptions
  ): Promise<FullTranslationResult> {
    const {
      provider = this.defaultProvider,
      model,
      sourceLanguage,
      targetLanguage,
      context,
      batchSize = parseInt(process.env.TRANSLATION_BATCH_SIZE || '25', 10),
      onProgress,
    } = options;

    const client = this.getClient(provider);

    // Prepare segments for translation
    const inputSegments = segments.map((seg, index) => ({
      index,
      text: seg.Text,
    }));

    // Create batches
    const batches = createTranslationBatches(inputSegments, batchSize);
    const totalBatches = batches.length;

    // Report initial progress
    onProgress?.({
      status: 'processing',
      progress: 0,
      currentBatch: 0,
      totalBatches,
    });

    // Optionally generate context summary for better translations
    let enhancedContext = context;
    if (!context?.summary && segments.length > 10) {
      const fullText = segments.map((s) => s.Text).join(' ');
      const summary = await client.generateContextSummary(fullText, sourceLanguage);
      if (summary) {
        enhancedContext = { ...context, summary };
      }
    }

    // Translate batches sequentially
    const translatedSegments: { index: number; text: string }[] = [];
    let totalTokens = 0;
    let usedModel = model || this.getDefaultModel(provider);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      try {
        const result = await client.translateBatch(batch, {
          model,
          sourceLanguage,
          targetLanguage,
          context: enhancedContext,
        });

        translatedSegments.push(...result.segments);
        usedModel = result.model;

        if (result.tokensUsed) {
          totalTokens += result.tokensUsed.total;
        }

        // Report progress
        const progress = Math.round(((i + 1) / totalBatches) * 100);
        onProgress?.({
          status: 'processing',
          progress,
          currentBatch: i + 1,
          totalBatches,
        });
      } catch (error) {
        // Report error but continue with remaining batches
        console.error(`Batch ${i + 1} failed:`, error);
        onProgress?.({
          status: 'processing',
          progress: Math.round(((i + 1) / totalBatches) * 100),
          currentBatch: i + 1,
          totalBatches,
          error: `Batch ${i + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        // Re-throw to stop processing - caller can decide to retry
        throw error;
      }
    }

    // Sort by index to ensure correct order
    translatedSegments.sort((a, b) => a.index - b.index);

    // Report completion
    onProgress?.({
      status: 'completed',
      progress: 100,
      currentBatch: totalBatches,
      totalBatches,
    });

    return {
      segments: translatedSegments,
      provider,
      model: usedModel,
      totalTokensUsed: totalTokens || undefined,
    };
  }

  /**
   * Create TranslatedSegment records from translation results
   */
  createTranslatedSegmentRecords(
    transcriptionId: number,
    originalSegments: TranscriptionSegment[],
    translatedResults: { index: number; text: string }[],
    targetLanguage: string
  ): Omit<TranslatedSegment, 'Id' | 'CreatedAt' | 'UpdatedAt'>[] {
    // Create a map for quick lookup
    const translationMap = new Map(
      translatedResults.map((t) => [t.index, t.text])
    );

    return originalSegments.map((original, index) => ({
      TranscriptionId: transcriptionId,
      OriginalSegmentId: original.Id,
      SegmentIndex: index,
      TargetLanguage: targetLanguage,
      TranslatedText: translationMap.get(index) || original.Text, // Fallback to original
      StartTime: original.StartTime,
      EndTime: original.EndTime,
    }));
  }

  /**
   * Get supported languages for translation
   */
  getSupportedLanguages(): { code: string; name: string }[] {
    return Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({
      code,
      name,
    }));
  }

  /**
   * Check if provider is available
   */
  isProviderAvailable(provider: TranslationProvider): boolean {
    try {
      this.getClient(provider);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create translation service instance
 */
export function createTranslationService(): TranslationService {
  const defaultProvider =
    (process.env.TRANSLATION_PROVIDER as TranslationProvider) || 'openai';
  return new TranslationService(defaultProvider);
}

// Re-export utilities
export { getLanguageName, LANGUAGE_NAMES, createTranslationBatches };
export { BERGET_MODELS, BERGET_MODEL_NAMES };
export type { TranslationResult, OpenAITranslationOptions };
