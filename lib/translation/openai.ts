/**
 * OpenAI Translation Provider
 * Uses GPT-4.1 for high-quality subtitle translation
 */

import OpenAI from 'openai';
import {
  getTranslationSystemPrompt,
  getBatchTranslationPrompt,
  parseTranslationResponse,
} from './prompts';

export interface OpenAITranslationOptions {
  model?: string;
  sourceLanguage: string;
  targetLanguage: string;
  context?: {
    title?: string;
    summary?: string;
  };
  temperature?: number;
}

export interface TranslationResult {
  segments: { index: number; text: string }[];
  model: string;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * OpenAI Translation Client
 */
export class OpenAITranslation {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, baseUrl?: string, defaultModel: string = 'gpt-4.1') {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl || 'https://api.openai.com/v1',
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

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

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
      console.error('OpenAI translation error:', error);
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

      return response.choices[0]?.message?.content?.trim() || '';
    } catch (error) {
      console.error('Failed to generate context summary:', error);
      return ''; // Non-critical, continue without summary
    }
  }
}

/**
 * Create OpenAI translation client instance
 */
export function createOpenAITranslation(): OpenAITranslation {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.TRANSLATION_MODEL || 'gpt-4.1';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  return new OpenAITranslation(apiKey, undefined, model);
}
