/**
 * Segment Utilities
 * Functions for processing and splitting transcription segments
 */

export interface RawSegment {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
}

export interface SplitOptions {
  maxCharsPerLine?: number;  // Default: 42
  maxLines?: number;         // Default: 2
  minSegmentDuration?: number; // Minimum duration in seconds, default: 1
}

const DEFAULT_OPTIONS: Required<SplitOptions> = {
  maxCharsPerLine: 42,
  maxLines: 2,
  minSegmentDuration: 1,
};

/**
 * Split a long segment into multiple shorter segments
 * Tries to split at natural break points (punctuation, spaces)
 */
export function splitSegment(segment: RawSegment, options: SplitOptions = {}): RawSegment[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const maxChars = opts.maxCharsPerLine * opts.maxLines;

  const text = segment.text.trim();

  // If segment is short enough, return as-is
  if (text.length <= maxChars) {
    return [{ ...segment, text }];
  }

  const duration = segment.endTime - segment.startTime;
  // Guard against division by zero - use a default rate if duration is 0
  const charsPerSecond = duration > 0 ? text.length / duration : 15;

  // Split text into chunks
  const chunks = splitTextIntoChunks(text, maxChars);

  // Calculate timing for each chunk
  const result: RawSegment[] = [];
  let currentTime = segment.startTime;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkDuration = Math.max(
      opts.minSegmentDuration,
      chunk.length / charsPerSecond
    );

    const endTime = i === chunks.length - 1
      ? segment.endTime  // Last chunk uses original end time
      : Math.min(currentTime + chunkDuration, segment.endTime);

    result.push({
      id: segment.id * 1000 + i, // Create unique IDs for split segments
      startTime: currentTime,
      endTime: endTime,
      text: chunk,
      confidence: segment.confidence,
    });

    currentTime = endTime;
  }

  return result;
}

/**
 * Split text into chunks at natural break points
 * Tries to create balanced chunks when possible
 */
function splitTextIntoChunks(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    // Find the best split point with balancing
    let splitIndex = findBalancedSplitPoint(remaining, maxChars);

    if (splitIndex <= 0) {
      // No good split point found, force split at maxChars
      splitIndex = maxChars;
    }

    const chunk = remaining.substring(0, splitIndex).trim();
    chunks.push(chunk);
    remaining = remaining.substring(splitIndex).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Find a balanced split point that creates roughly equal halves
 * while still respecting natural break points
 */
function findBalancedSplitPoint(text: string, maxChars: number): number {
  // If the remaining text after this chunk would fit in one more chunk,
  // try to balance them
  if (text.length <= maxChars * 2) {
    // Try to split roughly in the middle
    const targetSplit = Math.floor(text.length / 2);
    const searchRange = Math.min(20, Math.floor(text.length / 4)); // Search ±20 chars or ±25% of length

    // Look for a space near the midpoint
    let bestSplit = -1;
    let bestDistance = Infinity;

    for (let i = Math.max(0, targetSplit - searchRange); i <= Math.min(text.length - 1, targetSplit + searchRange); i++) {
      if (text[i] === ' ') {
        const distance = Math.abs(i - targetSplit);
        // Prefer split points at punctuation
        const isPunctuation = i > 0 && /[,;:.!?]/.test(text[i - 1]);
        const adjustedDistance = isPunctuation ? distance - 5 : distance;

        if (adjustedDistance < bestDistance) {
          bestDistance = adjustedDistance;
          bestSplit = i;
        }
      }
    }

    if (bestSplit > 0) {
      return bestSplit;
    }
  }

  // Fall back to finding the best split point within maxChars
  return findBestSplitPoint(text, maxChars);
}

/**
 * Find the best point to split text
 * Prioritizes: sentence end > clause break > word boundary
 */
function findBestSplitPoint(text: string, maxChars: number): number {
  const searchRange = text.substring(0, maxChars);

  // Priority 1: Split at sentence end (. ! ?)
  const sentenceEnds = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
  for (const end of sentenceEnds) {
    const index = searchRange.lastIndexOf(end);
    if (index > maxChars * 0.3) { // Only if we're at least 30% through
      return index + end.length - 1; // Include the punctuation
    }
  }

  // Priority 2: Split at clause break (, ; : -)
  const clauseBreaks = [', ', '; ', ': ', ' - ', ' – '];
  for (const br of clauseBreaks) {
    const index = searchRange.lastIndexOf(br);
    if (index > maxChars * 0.4) { // Only if we're at least 40% through
      return index + br.length - 1;
    }
  }

  // Priority 3: Split at word boundary
  const lastSpace = searchRange.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.5) {
    return lastSpace;
  }

  // Priority 4: Split at any space
  if (lastSpace > 0) {
    return lastSpace;
  }

  // No good split point found
  return -1;
}

/**
 * Process an array of segments, splitting any that are too long
 */
export function splitLongSegments(segments: RawSegment[], options: SplitOptions = {}): RawSegment[] {
  const result: RawSegment[] = [];

  for (const segment of segments) {
    const split = splitSegment(segment, options);
    result.push(...split);
  }

  // Re-number segments sequentially
  return result.map((seg, index) => ({
    ...seg,
    id: index,
  }));
}

/**
 * Format segment text with line breaks for subtitle display
 * Inserts line breaks at natural points to create balanced 2-line subtitles
 * For segments over ~45 chars, creates two balanced lines
 */
export function formatSubtitleText(text: string, maxCharsPerLine: number = 42): string {
  const trimmed = text.trim();

  // Single line if short enough
  if (trimmed.length <= maxCharsPerLine) {
    return trimmed;
  }

  // For text that needs two lines, find the best balanced split point
  const targetSplit = Math.floor(trimmed.length / 2);
  const searchRange = Math.min(25, Math.floor(trimmed.length / 3));

  let bestSplit = -1;
  let bestScore = Infinity;

  // Search for the best split point near the middle
  for (let i = Math.max(10, targetSplit - searchRange); i <= Math.min(trimmed.length - 10, targetSplit + searchRange); i++) {
    if (trimmed[i] === ' ') {
      const line1Len = i;
      const line2Len = trimmed.length - i - 1;

      // Skip if either line would be too long
      if (line1Len > maxCharsPerLine || line2Len > maxCharsPerLine) continue;

      // Calculate balance score (lower is better)
      const imbalance = Math.abs(line1Len - line2Len);

      // Bonus for splitting after punctuation
      const prevChar = trimmed[i - 1];
      const punctuationBonus = /[,;:.!?–-]/.test(prevChar) ? -10 : 0;

      const score = imbalance + punctuationBonus;

      if (score < bestScore) {
        bestScore = score;
        bestSplit = i;
      }
    }
  }

  if (bestSplit > 0) {
    const line1 = trimmed.substring(0, bestSplit).trim();
    const line2 = trimmed.substring(bestSplit + 1).trim();
    return `${line1}\n${line2}`;
  }

  // Fallback: just return as-is if no good split found
  return trimmed;
}

/**
 * Balance an existing segment's text into two lines if needed
 */
export function balanceSegmentText(text: string, maxCharsPerLine: number = 42): string {
  // Remove any existing line breaks and re-balance
  const cleaned = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  return formatSubtitleText(cleaned, maxCharsPerLine);
}
