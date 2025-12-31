/**
 * Subtitle Export Utilities
 * Generate various subtitle formats from transcription segments
 */

import type { TranscriptionSegment } from '@/lib/types';

export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'txt' | 'json';

/**
 * Format time for SRT (HH:MM:SS,mmm)
 */
function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Format time for VTT (HH:MM:SS.mmm)
 */
function formatVTTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Format time for ASS (H:MM:SS.cc)
 */
function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

/**
 * Generate SRT format
 */
export function generateSRT(segments: TranscriptionSegment[]): string {
  return segments
    .map((segment, index) => {
      const start = formatSRTTime(segment.StartTime);
      const end = formatSRTTime(segment.EndTime);
      return `${index + 1}\n${start} --> ${end}\n${segment.Text.trim()}\n`;
    })
    .join('\n');
}

/**
 * Generate WebVTT format
 */
export function generateVTT(segments: TranscriptionSegment[]): string {
  const header = 'WEBVTT\n\n';
  const cues = segments
    .map((segment, index) => {
      const start = formatVTTTime(segment.StartTime);
      const end = formatVTTTime(segment.EndTime);
      return `${index + 1}\n${start} --> ${end}\n${segment.Text.trim()}\n`;
    })
    .join('\n');
  return header + cues;
}

/**
 * Convert hex color to ASS format (&HAABBGGRR)
 * @param hexColor - Hex color like #FFFFFF or #FF0000
 * @param opacity - Opacity value 0-100 (100 = fully opaque, 0 = transparent)
 */
function hexToASS(hexColor: string, opacity: number = 100): string {
  // Remove # if present
  const hex = hexColor.replace('#', '').toUpperCase();
  const r = hex.substring(0, 2);
  const g = hex.substring(2, 4);
  const b = hex.substring(4, 6);
  // ASS alpha: 00 = fully opaque, FF = fully transparent
  // So we convert opacity (100=opaque) to alpha (00=opaque)
  const alpha = Math.round((100 - opacity) * 2.55);
  const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase();
  return `&H${alphaHex}${b}${g}${r}`;
}

export interface ASSStyleOptions {
  title?: string;
  fontName?: string;
  fontSize?: number;
  fontColor?: string;        // Hex color like #FFFFFF
  showBackground?: boolean;
  backgroundColor?: string;  // Hex color like #000000
  backgroundOpacity?: number; // 0-100
  paddingX?: number;
  paddingY?: number;
  // Legacy options (ASS format)
  primaryColor?: string;
  outlineColor?: string;
  backColor?: string;
}

/**
 * Generate ASS/SSA format with styling
 */
export function generateASS(
  segments: TranscriptionSegment[],
  options: ASSStyleOptions = {}
): string {
  const {
    title = 'Subtitles',
    fontName = 'Arial',
    fontSize = 48,
  } = options;

  // Handle both legacy ASS colors and new hex colors
  let primaryColor = options.primaryColor || '&H00FFFFFF';
  let outlineColor = options.outlineColor || '&H00000000';
  let backColor = options.backColor || '&H80000000';

  // If new-style hex colors are provided, convert them
  if (options.fontColor) {
    primaryColor = hexToASS(options.fontColor, 100); // 100 = fully opaque
    console.log(`[ASS] Font color: ${options.fontColor} -> ${primaryColor}`);
  }

  // Handle background
  // IMPORTANT: For BorderStyle=3 (opaque box), the box color is controlled by OutlineColour, NOT BackColour!
  // This is a quirk of the ASS format that many renderers follow
  if (options.showBackground === false) {
    // No background - transparent outline
    outlineColor = '&HFF000000'; // Transparent
    backColor = '&HFF000000';
    console.log('[ASS] Background disabled, using transparent');
  } else if (options.backgroundColor) {
    // Use provided background color with opacity
    // backgroundOpacity is 0-100 where 80 means 80% opaque
    const bgOpacity = options.backgroundOpacity ?? 80;
    const bgColorASS = hexToASS(options.backgroundColor, bgOpacity);
    // For BorderStyle=3, set BOTH OutlineColour and BackColour to the background color
    // Different renderers may use one or the other
    outlineColor = bgColorASS;
    backColor = bgColorASS;
    console.log(`[ASS] Background color: ${options.backgroundColor} @ ${bgOpacity}% -> ${bgColorASS}`);
  } else {
    // Default semi-transparent black background
    outlineColor = '&H80000000';
    backColor = '&H80000000';
    console.log('[ASS] Using default background color:', backColor);
  }

  // MarginV is distance from bottom of video to subtitle area
  // Default to 50 pixels for comfortable reading distance from edge
  // Note: paddingY from UI is internal text padding, not margin from edge
  const marginV = 50;

  // BorderStyle: 1 = outline + shadow, 3 = opaque box
  const borderStyle = options.showBackground !== false ? 3 : 1;
  // For BorderStyle 3, Outline controls the box padding around text
  // Scale padding as percentage of font size for proportional appearance
  // User paddingY (2-8) maps to 10-25% of font size for generous padding
  const userPadding = options.paddingY ?? 5;
  const minPercent = 0.10; // 10% minimum padding
  const maxPercent = 0.25; // 25% maximum padding
  const paddingPercent = minPercent + ((userPadding - 2) / 6) * (maxPercent - minPercent);
  const scaledPadding = Math.round(fontSize * paddingPercent);
  const outlineSize = borderStyle === 3 ? Math.max(scaledPadding, 6) : 2;
  // Shadow: 0 for background box (no shadow needed), 2 for outline style
  const shadowSize = borderStyle === 3 ? 0 : 2;

  console.log(`[ASS] Style: BorderStyle=${borderStyle}, Outline=${outlineSize}, Shadow=${shadowSize}, MarginV=${marginV}`);
  console.log(`[ASS] Colors: Primary=${primaryColor}, Outline=${outlineColor}, Back=${backColor}`);

  const header = `[Script Info]
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},0,0,0,0,100,100,0,0,${borderStyle},${outlineSize},${shadowSize},2,10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Calculate line spacing for multi-line subtitles
  // Line height = fontSize * 1.4 gives comfortable reading spacing
  const lineHeight = Math.round(fontSize * 1.4);

  const events = segments
    .flatMap((segment) => {
      const start = formatASSTime(segment.StartTime);
      const end = formatASSTime(segment.EndTime);
      const text = segment.Text.trim();

      // Check if this is a multi-line subtitle
      if (text.includes('\n')) {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        if (lines.length === 2) {
          // Two-line subtitle: render as separate dialogue events with different vertical positions
          // Line 1 (top) has higher MarginV, Line 2 (bottom) has default MarginV
          const line2MarginV = marginV;
          const line1MarginV = marginV + lineHeight;

          return [
            `Dialogue: 0,${start},${end},Default,,0,0,${line1MarginV},,${lines[0]}`,
            `Dialogue: 0,${start},${end},Default,,0,0,${line2MarginV},,${lines[1]}`,
          ];
        }

        // More than 2 lines: stack them from bottom up
        return lines.map((line, index) => {
          const lineMarginV = marginV + (lines.length - 1 - index) * lineHeight;
          return `Dialogue: 0,${start},${end},Default,,0,0,${lineMarginV},,${line}`;
        });
      }

      // Single line subtitle
      return [`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`];
    })
    .join('\n');

  return header + events + '\n';
}

/**
 * Generate plain text transcript
 */
export function generateTXT(segments: TranscriptionSegment[], includeTimestamps = false): string {
  if (includeTimestamps) {
    return segments
      .map((segment) => {
        const start = formatSRTTime(segment.StartTime).replace(',', '.');
        return `[${start}] ${segment.Text.trim()}`;
      })
      .join('\n');
  }
  return segments.map((segment) => segment.Text.trim()).join(' ');
}

/**
 * Generate JSON format
 */
export function generateJSON(segments: TranscriptionSegment[]): string {
  const data = segments.map((segment, index) => ({
    index: index + 1,
    startTime: segment.StartTime,
    endTime: segment.EndTime,
    text: segment.Text.trim(),
    confidence: segment.Confidence,
  }));
  return JSON.stringify(data, null, 2);
}

/**
 * Generate subtitles in specified format
 */
export function generateSubtitles(
  segments: TranscriptionSegment[],
  format: SubtitleFormat,
  options?: {
    title?: string;
    includeTimestamps?: boolean;
  }
): string {
  switch (format) {
    case 'srt':
      return generateSRT(segments);
    case 'vtt':
      return generateVTT(segments);
    case 'ass':
      return generateASS(segments, { title: options?.title });
    case 'txt':
      return generateTXT(segments, options?.includeTimestamps);
    case 'json':
      return generateJSON(segments);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Get MIME type for subtitle format
 */
export function getSubtitleMimeType(format: SubtitleFormat): string {
  switch (format) {
    case 'srt':
      return 'application/x-subrip';
    case 'vtt':
      return 'text/vtt';
    case 'ass':
      return 'text/x-ssa';
    case 'txt':
      return 'text/plain';
    case 'json':
      return 'application/json';
    default:
      return 'text/plain';
  }
}

/**
 * Get file extension for subtitle format
 */
export function getSubtitleExtension(format: SubtitleFormat): string {
  return format;
}
