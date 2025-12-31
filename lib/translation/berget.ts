/**
 * Berget AI Translation Provider
 * Uses Berget's OpenAI-compatible API for subtitle translation
 *
 * Available models:
 * - openai/gpt-oss-120b (default) - Reasoning model with high quality
 * - mistralai/Mistral-Small-3.2-24B-Instruct-2506 - Fast and efficient
 */

import OpenAI from 'openai';
import {
  getTranslationSystemPrompt,
  getBatchTranslationPrompt,
  parseTranslationResponse,
} from './prompts';
import type { OpenAITranslationOptions, TranslationResult } from './openai';

// Berget AI models
export const BERGET_MODELS = {
  // Default reasoning model
  GPT_OSS: 'openai/gpt-oss-120b',
  // Alternative fast model
  MISTRAL_SMALL: 'mistralai/Mistral-Small-3.2-24B-Instruct-2506',
} as const;

export type BergetModel = typeof BERGET_MODELS[keyof typeof BERGET_MODELS];

// Model display names for UI
export const BERGET_MODEL_NAMES: Record<string, string> = {
  'openai/gpt-oss-120b': 'GPT-OSS 120B (Reasoning)',
  'mistralai/Mistral-Small-3.2-24B-Instruct-2506': 'Mistral Small 3.2',
};

/**
 * Strip thinking tags from reasoning model responses
 * Some models like GPT-OSS may include <think>...</think> reasoning blocks
 */
function stripThinkingTags(content: string): string {
  // Remove <think>...</think> blocks (case insensitive, multiline)
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // Also handle |think| or [think] variants just in case
  cleaned = cleaned.replace(/\|think\|[\s\S]*?\|\/think\|/gi, '');
  cleaned = cleaned.replace(/\[think\][\s\S]*?\[\/think\]/gi, '');

  // Remove any leading/trailing whitespace
  return cleaned.trim();
}

/**
 * Berget AI Translation Client
 */
export class BergetTranslation {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = BERGET_MODELS.GPT_OSS) {
    if (!apiKey) {
      throw new Error('Berget API key is required');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.BERGET_BASE_URL || 'https://api.berget.ai/v1',
    });

    this.defaultModel = defaultModel;
  }

  /**
   * Translate a batch of segments
   */
  async translateBatch(
    segments: { index: number; text: string }[],
    options: OpenAITranslationOptions
  ): Promise<TranslationResult> {
    const {
      model = this.defaultModel,
      sourceLanguage,
      targetLanguage,
      context,
      temperature = 0.3,
    } = options;

    const systemPrompt = getTranslationSystemPrompt(
      sourceLanguage,
      targetLanguage,
      context
    );
    const userPrompt = getBatchTranslationPrompt(segments);

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        response_format: { type: 'json_object' },
      });

      let content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from Berget AI');
      }

      // Strip any thinking tags from reasoning models
      content = stripThinkingTags(content);

      const translatedSegments = parseTranslationResponse(content);

      // Validate that all indices are present
      const inputIndices = new Set(segments.map((s) => s.index));
      const outputIndices = new Set(translatedSegments.map((s) => s.index));

      for (const idx of inputIndices) {
        if (!outputIndices.has(idx)) {
          console.warn(`Missing translation for segment index ${idx}`);
        }
      }

      return {
        segments: translatedSegments,
        model,
        tokensUsed: response.usage
          ? {
              prompt: response.usage.prompt_tokens,
              completion: response.usage.completion_tokens,
              total: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      console.error('Berget AI translation error:', error);
      throw new Error(
        `Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate a context summary from full transcript
   * This helps the LLM understand the overall content
   */
  async generateContextSummary(
    fullText: string,
    sourceLanguage: string
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: `You are a content analyzer. Provide a brief 1-2 sentence summary of the following transcript in English. Focus on the main topic and type of content (e.g., interview, tutorial, presentation, conversation). Be concise.`,
          },
          {
            role: 'user',
            content: `Language: ${sourceLanguage}\n\nTranscript:\n${fullText.slice(0, 3000)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
      });

      let content = response.choices[0]?.message?.content?.trim() || '';

      // Strip any thinking tags
      content = stripThinkingTags(content);

      return content;
    } catch (error) {
      console.error('Failed to generate context summary:', error);
      return ''; // Non-critical, continue without summary
    }
  }
}

/**
 * Create Berget AI translation client instance
 */
export function createBergetTranslation(): BergetTranslation {
  const apiKey = process.env.BERGET_API_KEY;
  const model = process.env.BERGET_TRANSLATION_MODEL || BERGET_MODELS.GPT_OSS;

  if (!apiKey) {
    throw new Error('BERGET_API_KEY environment variable is not set');
  }

  return new BergetTranslation(apiKey, model);
}
