/**
 * Translation Prompts
 * System prompts and utilities for LLM-based subtitle translation
 */

// Language name mapping
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  sv: 'Swedish',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  tr: 'Turkish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  hu: 'Hungarian',
  id: 'Indonesian',
  ms: 'Malay',
  ro: 'Romanian',
  sk: 'Slovak',
  th: 'Thai',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
};

export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] || code.toUpperCase();
}

/**
 * System prompt for subtitle translation
 */
export function getTranslationSystemPrompt(
  sourceLanguage: string,
  targetLanguage: string,
  context?: { title?: string; summary?: string }
): string {
  const sourceName = getLanguageName(sourceLanguage);
  const targetName = getLanguageName(targetLanguage);

  let contextSection = '';
  if (context?.title) {
    contextSection = `\nContext: "${context.title}"`;
    if (context.summary) {
      contextSection += ` - ${context.summary}`;
    }
  }

  return `You are a professional subtitle translator specializing in media localization. Translate subtitles from ${sourceName} to ${targetName}.${contextSection}

CRITICAL RULES:
1. Translate ONLY the text content, preserving the exact meaning and tone
2. Keep translations concise - subtitles should be readable (aim for max 42 characters per line)
3. Preserve any line breaks (\\n) from the original text
4. Maintain natural speech patterns appropriate for ${targetName}
5. Return ONLY valid JSON - no explanations or additional text
6. Keep the exact same index numbers from the input
7. If text contains "[...]" or unclear audio markers, preserve them
8. Adapt idioms and cultural references naturally for the target audience

INPUT FORMAT: {"segments": [{"index": 0, "text": "Original subtitle"}, ...]}
OUTPUT FORMAT: {"segments": [{"index": 0, "text": "Translated subtitle"}, ...]}

IMPORTANT: Your response must be valid JSON only. Do not include any text before or after the JSON object.`;
}

/**
 * User prompt for batch translation
 */
export function getBatchTranslationPrompt(
  segments: { index: number; text: string }[]
): string {
  return JSON.stringify({ segments }, null, 0);
}

/**
 * Parse LLM response to extract translated segments
 */
export function parseTranslationResponse(
  response: string
): { index: number; text: string }[] {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Handle potential markdown code blocks
  if (jsonStr.startsWith('```')) {
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      jsonStr = match[1].trim();
    }
  }

  // Try to find JSON object in the response
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (!parsed.segments || !Array.isArray(parsed.segments)) {
      throw new Error('Response missing segments array');
    }

    // Validate each segment has required fields
    return parsed.segments.map((seg: any) => {
      if (typeof seg.index !== 'number') {
        throw new Error(`Invalid segment index: ${JSON.stringify(seg)}`);
      }
      if (typeof seg.text !== 'string') {
        throw new Error(`Invalid segment text: ${JSON.stringify(seg)}`);
      }
      return {
        index: seg.index,
        text: seg.text.trim(),
      };
    });
  } catch (error) {
    console.error('Failed to parse translation response:', response);
    throw new Error(
      `Failed to parse LLM response: ${error instanceof Error ? error.message : 'Invalid JSON'}`
    );
  }
}

/**
 * Create batches of segments for translation
 */
export function createTranslationBatches(
  segments: { index: number; text: string }[],
  batchSize: number = 25,
  maxCharsPerBatch: number = 4000
): { index: number; text: string }[][] {
  const batches: { index: number; text: string }[][] = [];
  let currentBatch: { index: number; text: string }[] = [];
  let currentChars = 0;

  for (const segment of segments) {
    const segmentChars = segment.text.length;

    // Start new batch if limits exceeded
    if (
      currentBatch.length >= batchSize ||
      currentChars + segmentChars > maxCharsPerBatch
    ) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push(segment);
    currentChars += segmentChars;
  }

  // Don't forget the last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
