'use client';

/**
 * Transcription Editor Page
 * Studio Dark Design - Interactive subtitle editor with video player
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDuration } from '@/lib/utils/format';
import { balanceSegmentText } from '@/lib/utils/segments';
import ExportModal from '@/components/ExportModal';
import TranslationModal from '@/components/TranslationModal';
import { UserMenu } from '@/components/UserMenu';
import type { Transcription, TranscriptionSegment, TranslatedSegment, File as FileType } from '@/lib/types';

// Language code to name and flag mapping
const LANGUAGES: Record<string, { name: string; flag: string }> = {
  'sv': { name: 'Swedish', flag: '🇸🇪' },
  'en': { name: 'English', flag: '🇬🇧' },
  'es': { name: 'Spanish', flag: '🇪🇸' },
  'fr': { name: 'French', flag: '🇫🇷' },
  'de': { name: 'German', flag: '🇩🇪' },
  'it': { name: 'Italian', flag: '🇮🇹' },
  'pt': { name: 'Portuguese', flag: '🇵🇹' },
  'nl': { name: 'Dutch', flag: '🇳🇱' },
  'pl': { name: 'Polish', flag: '🇵🇱' },
  'ru': { name: 'Russian', flag: '🇷🇺' },
  'zh': { name: 'Chinese', flag: '🇨🇳' },
  'ja': { name: 'Japanese', flag: '🇯🇵' },
  'ko': { name: 'Korean', flag: '🇰🇷' },
  'ar': { name: 'Arabic', flag: '🇸🇦' },
  'hi': { name: 'Hindi', flag: '🇮🇳' },
  'tr': { name: 'Turkish', flag: '🇹🇷' },
  'da': { name: 'Danish', flag: '🇩🇰' },
  'no': { name: 'Norwegian', flag: '🇳🇴' },
  'fi': { name: 'Finnish', flag: '🇫🇮' },
  'cs': { name: 'Czech', flag: '🇨🇿' },
  'el': { name: 'Greek', flag: '🇬🇷' },
  'he': { name: 'Hebrew', flag: '🇮🇱' },
  'hu': { name: 'Hungarian', flag: '🇭🇺' },
  'id': { name: 'Indonesian', flag: '🇮🇩' },
  'th': { name: 'Thai', flag: '🇹🇭' },
  'uk': { name: 'Ukrainian', flag: '🇺🇦' },
  'vi': { name: 'Vietnamese', flag: '🇻🇳' },
};

// Helper to get language info from code
function getLanguageInfo(code: string): { name: string; flag: string } {
  if (!code) return { name: 'Unknown', flag: '🌐' };
  const normalizedCode = code.toLowerCase();
  return LANGUAGES[normalizedCode] || { name: code.toUpperCase(), flag: '🌐' };
}

// Helper to get language name from code (backwards compatibility)
function getLanguageName(code: string): string {
  return getLanguageInfo(code).name;
}

interface SubtitleStyle {
  fontSize: number;
  fontColor: string;
  showBackground: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  paddingX: number;
  paddingY: number;
}

interface TranscriptionWithSegments extends Transcription {
  segments: TranscriptionSegment[];
}

export default function TranscriptionEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [transcription, setTranscription] = useState<TranscriptionWithSegments | null>(null);
  const [file, setFile] = useState<FileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSegment, setCurrentSegment] = useState<TranscriptionSegment | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const hasInitialSeeked = useRef(false);

  // Export state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

  // Translation state
  const [showTranslationModal, setShowTranslationModal] = useState(false);
  const [translations, setTranslations] = useState<{ language: string; segmentCount: number }[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [translatedSegments, setTranslatedSegments] = useState<TranslatedSegment[]>([]);
  const [loadingTranslation, setLoadingTranslation] = useState(false);
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);

  // Export modal language state (separate from editor language)
  const [exportSelectedLanguage, setExportSelectedLanguage] = useState<string | null>(null);
  const [exportTranslatedSegments, setExportTranslatedSegments] = useState<TranslatedSegment[]>([]);

  // Editing state
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Time editing state
  const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
  const [editingTimeField, setEditingTimeField] = useState<'start' | 'end' | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState('');
  const [savingTime, setSavingTime] = useState(false);
  const timeInputRef = useRef<HTMLInputElement>(null);

  // Load transcription data
  useEffect(() => {
    if (!id) return;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const transRes = await fetch(`/api/transcriptions/${id}`);
        if (!transRes.ok) {
          throw new Error('Transcription not found');
        }
        const { data: transData } = await transRes.json();
        setTranscription(transData);

        if (transData.FileId) {
          const fileRes = await fetch(`/api/files/${transData.FileId}`);
          if (fileRes.ok) {
            const { data: fileData } = await fileRes.json();
            setFile(fileData);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load transcription');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  // Load translations
  const loadTranslations = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/translate/${id}`);
      if (res.ok) {
        const { data } = await res.json();
        setTranslations(data?.availableLanguages || []);
      }
    } catch (err) {
      console.error('Failed to load translations:', err);
    }
  }, [id]);

  useEffect(() => {
    if (id && transcription) {
      loadTranslations();
    }
  }, [id, transcription, loadTranslations]);

  // Handle delete translation
  const handleDeleteTranslation = async (language: string) => {
    if (!id) return;
    const res = await fetch(`/api/translate/${id}?language=${language}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || 'Failed to delete translation');
    }
    // If we were viewing the deleted translation, switch back to original
    if (selectedLanguage === language) {
      setSelectedLanguage(null);
      setTranslatedSegments([]);
    }
    await loadTranslations();
  };

  // Load translated segments for a language
  const loadTranslatedSegments = useCallback(async (language: string) => {
    if (!id) return;
    setLoadingTranslation(true);
    try {
      const res = await fetch(`/api/translate/${id}?language=${language}`);
      if (res.ok) {
        const { data } = await res.json();
        setTranslatedSegments(data?.segments || []);
      }
    } catch (err) {
      console.error('Failed to load translated segments:', err);
    } finally {
      setLoadingTranslation(false);
    }
  }, [id]);

  // Handle language change (editor)
  const handleLanguageChange = useCallback(async (language: string | null) => {
    setSelectedLanguage(language);
    if (language) {
      await loadTranslatedSegments(language);
    } else {
      setTranslatedSegments([]);
    }
  }, [loadTranslatedSegments]);

  // Handle language change in export modal
  const handleExportLanguageChange = useCallback(async (language: string | null) => {
    setExportSelectedLanguage(language);
    if (language) {
      // Check if we already have segments for this language loaded (in editor or export cache)
      if (selectedLanguage === language && translatedSegments.length > 0) {
        setExportTranslatedSegments(translatedSegments);
      } else {
        // Fetch segments for this language
        try {
          const res = await fetch(`/api/translate/${id}?language=${language}`);
          if (res.ok) {
            const { data } = await res.json();
            setExportTranslatedSegments(data?.segments || []);
          }
        } catch (err) {
          console.error('Failed to load translated segments for export:', err);
          setExportTranslatedSegments([]);
        }
      }
    } else {
      setExportTranslatedSegments([]);
    }
  }, [id, selectedLanguage, translatedSegments]);

  // Compute preview text for export modal based on current time and selected export language
  const exportPreviewText = useMemo(() => {
    if (exportSelectedLanguage && exportTranslatedSegments.length > 0) {
      const seg = exportTranslatedSegments.find(
        s => currentTime >= s.StartTime && currentTime < s.EndTime
      );
      return seg?.TranslatedText;
    }
    return undefined;
  }, [exportSelectedLanguage, exportTranslatedSegments, currentTime]);

  // Auto-balance segments that don't have line breaks
  // This runs once after loading to format long segments into two lines
  useEffect(() => {
    if (!transcription?.segments || transcription.segments.length === 0) return;

    // Check if any segments need balancing (over 45 chars without \n)
    const needsBalancing = transcription.segments.some(
      seg => seg.Text.length > 45 && !seg.Text.includes('\n')
    );

    if (needsBalancing) {
      // Balance segments client-side for immediate display
      setTranscription(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          segments: prev.segments.map(seg => ({
            ...seg,
            Text: balanceSegmentText(seg.Text, 42),
          })),
        };
      });
    }
  }, [transcription?.segments?.length]); // Only run when segments first load

  // Update current segment based on video time
  useEffect(() => {
    if (!transcription?.segments) return;

    const segment = transcription.segments.find(
      (seg) => currentTime >= seg.StartTime && currentTime < seg.EndTime
    );
    setCurrentSegment(segment || null);
  }, [currentTime, transcription?.segments]);

  // Seek to first segment's start time when entering the page
  // This prevents showing a black screen if video starts before first subtitle
  useEffect(() => {
    if (
      hasInitialSeeked.current ||
      !videoRef.current ||
      !transcription?.segments?.length ||
      duration === 0
    ) {
      return;
    }

    const firstSegment = transcription.segments[0];
    if (firstSegment && firstSegment.StartTime > 0) {
      // Seek to first subtitle start time (with small offset to ensure we're in the segment)
      videoRef.current.currentTime = firstSegment.StartTime + 0.01;
      setCurrentTime(firstSegment.StartTime + 0.01);
      setCurrentSegment(firstSegment);
    }
    hasInitialSeeked.current = true;
  }, [duration, transcription?.segments]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleSegmentClick = useCallback((segment: TranscriptionSegment) => {
    // Add tiny offset to avoid boundary issues where EndTime of previous segment
    // equals StartTime of this segment (0.01s = 10ms offset)
    handleSeek(segment.StartTime + 0.01);
    // Also set segment directly to avoid any timing race
    setCurrentSegment(segment);
  }, [handleSeek]);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  }, []);

  // Keyboard shortcuts (disabled when editing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when editing
      if (editingSegmentId !== null) return;

      // Check if we're in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Tab') {
        e.preventDefault();
        handlePlayPause();
      }
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        handlePlayPause();
      }
      if (e.key === 'ArrowLeft') {
        handleSeek(Math.max(0, currentTime - 5));
      }
      if (e.key === 'ArrowRight') {
        handleSeek(Math.min(duration, currentTime + 5));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleSeek, currentTime, duration, editingSegmentId]);

  // Format time as HH:MM:SS.ms
  const formatTimestamp = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Parse time string (HH:MM:SS.ms) to seconds
  const parseTimestamp = (timeStr: string): number | null => {
    // Support formats: HH:MM:SS.ms, MM:SS.ms, SS.ms, or just seconds
    const patterns = [
      /^(\d{1,2}):(\d{2}):(\d{2})\.(\d{1,2})$/,  // HH:MM:SS.ms
      /^(\d{1,2}):(\d{2}):(\d{2})$/,              // HH:MM:SS
      /^(\d{1,2}):(\d{2})\.(\d{1,2})$/,           // MM:SS.ms
      /^(\d{1,2}):(\d{2})$/,                       // MM:SS
      /^(\d+)\.(\d{1,2})$/,                        // SS.ms
      /^(\d+)$/,                                   // SS
    ];

    for (let i = 0; i < patterns.length; i++) {
      const match = timeStr.trim().match(patterns[i]);
      if (match) {
        let hours = 0, minutes = 0, seconds = 0, ms = 0;

        switch (i) {
          case 0: // HH:MM:SS.ms
            hours = parseInt(match[1], 10);
            minutes = parseInt(match[2], 10);
            seconds = parseInt(match[3], 10);
            ms = parseInt(match[4].padEnd(2, '0'), 10);
            break;
          case 1: // HH:MM:SS
            hours = parseInt(match[1], 10);
            minutes = parseInt(match[2], 10);
            seconds = parseInt(match[3], 10);
            break;
          case 2: // MM:SS.ms
            minutes = parseInt(match[1], 10);
            seconds = parseInt(match[2], 10);
            ms = parseInt(match[3].padEnd(2, '0'), 10);
            break;
          case 3: // MM:SS
            minutes = parseInt(match[1], 10);
            seconds = parseInt(match[2], 10);
            break;
          case 4: // SS.ms
            seconds = parseInt(match[1], 10);
            ms = parseInt(match[2].padEnd(2, '0'), 10);
            break;
          case 5: // SS
            seconds = parseInt(match[1], 10);
            break;
        }

        // Validate ranges
        if (minutes >= 60 || seconds >= 60 || ms >= 100) {
          return null;
        }

        return hours * 3600 + minutes * 60 + seconds + ms / 100;
      }
    }
    return null;
  };

  // Calculate CPS for a segment
  const calculateCPS = (segment: TranscriptionSegment): number => {
    const dur = segment.EndTime - segment.StartTime;
    if (dur <= 0) return 0;
    return segment.Text.length / dur;
  };

  // Get CPS color class
  const getCPSColor = (cps: number): string => {
    if (cps <= 15) return 'text-success';
    if (cps <= 20) return 'text-warning';
    return 'text-error';
  };

  // Save segment text (original or translated)
  const saveSegment = useCallback(async (segmentId: number, newText: string) => {
    if (!transcription) return;

    // Check if we're editing a translated segment or original
    if (selectedLanguage && translatedSegments.length > 0) {
      const segment = translatedSegments.find(s => s.Id === segmentId);
      if (!segment || segment.TranslatedText === newText) {
        setEditingSegmentId(null);
        return;
      }

      setSaving(true);
      try {
        const response = await fetch(`/api/translated-segments/${segmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ TranslatedText: newText }),
        });

        if (!response.ok) {
          throw new Error('Failed to save');
        }

        // Update local state
        setTranslatedSegments(prev =>
          prev.map(s =>
            s.Id === segmentId ? { ...s, TranslatedText: newText } : s
          )
        );
      } catch (err) {
        console.error('Save error:', err);
        setEditingText(segment.TranslatedText);
      } finally {
        setSaving(false);
        setEditingSegmentId(null);
      }
    } else {
      // Original segment
      const segment = transcription.segments.find(s => s.Id === segmentId);
      if (!segment || segment.Text === newText) {
        setEditingSegmentId(null);
        return;
      }

      setSaving(true);
      try {
        const response = await fetch(`/api/segments/${segmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Text: newText }),
        });

        if (!response.ok) {
          throw new Error('Failed to save');
        }

        // Update local state
        setTranscription(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            segments: prev.segments.map(s =>
              s.Id === segmentId ? { ...s, Text: newText } : s
            ),
          };
        });
      } catch (err) {
        console.error('Save error:', err);
        setEditingText(segment.Text);
      } finally {
        setSaving(false);
        setEditingSegmentId(null);
      }
    }
  }, [transcription, selectedLanguage, translatedSegments]);

  // Start editing a segment (works for both original and translated)
  const startEditing = useCallback((segmentId: number, text: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Save previous segment if editing
    if (editingSegmentId !== null && editingSegmentId !== segmentId) {
      saveSegment(editingSegmentId, editingText);
    }

    setEditingSegmentId(segmentId);
    setEditingText(text);

    // Focus textarea after state update
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }, 0);
  }, [editingSegmentId, editingText, saveSegment]);

  // Handle blur (save on click outside)
  const handleTextareaBlur = useCallback(() => {
    if (editingSegmentId !== null) {
      saveSegment(editingSegmentId, editingText);
    }
  }, [editingSegmentId, editingText, saveSegment]);

  // Handle keyboard in textarea
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Cancel editing, revert to original
      if (selectedLanguage && translatedSegments.length > 0) {
        const segment = translatedSegments.find(s => s.Id === editingSegmentId);
        if (segment) {
          setEditingText(segment.TranslatedText);
        }
      } else {
        const segment = transcription?.segments.find(s => s.Id === editingSegmentId);
        if (segment) {
          setEditingText(segment.Text);
        }
      }
      setEditingSegmentId(null);
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingSegmentId !== null) {
        saveSegment(editingSegmentId, editingText);
      }
    }
    // Prevent video controls from triggering
    e.stopPropagation();
  }, [editingSegmentId, editingText, saveSegment, transcription?.segments, selectedLanguage, translatedSegments]);

  // Start editing a time value
  const startEditingTime = useCallback((segmentId: number, field: 'start' | 'end', currentValue: number, e: React.MouseEvent) => {
    e.stopPropagation();

    // Save previous time edit if any
    if (editingTimeId !== null && (editingTimeId !== segmentId || editingTimeField !== field)) {
      // Don't save, just cancel
      setEditingTimeId(null);
      setEditingTimeField(null);
    }

    setEditingTimeId(segmentId);
    setEditingTimeField(field);
    setEditingTimeValue(formatTimestamp(currentValue));

    // Focus input after state update
    setTimeout(() => {
      timeInputRef.current?.focus();
      timeInputRef.current?.select();
    }, 0);
  }, [editingTimeId, editingTimeField, formatTimestamp]);

  // Save time value
  const saveTime = useCallback(async (segmentId: number, field: 'start' | 'end', newTimeStr: string) => {
    const newTime = parseTimestamp(newTimeStr);

    if (newTime === null) {
      // Invalid format, cancel editing
      setEditingTimeId(null);
      setEditingTimeField(null);
      return;
    }

    // Find the segment to validate
    let segment: TranscriptionSegment | TranslatedSegment | undefined;
    if (selectedLanguage && translatedSegments.length > 0) {
      segment = translatedSegments.find(s => s.Id === segmentId);
    } else {
      segment = transcription?.segments.find(s => s.Id === segmentId);
    }

    if (!segment) {
      setEditingTimeId(null);
      setEditingTimeField(null);
      return;
    }

    // Validate: start must be before end
    const currentStart = segment.StartTime;
    const currentEnd = segment.EndTime;
    const proposedStart = field === 'start' ? newTime : currentStart;
    const proposedEnd = field === 'end' ? newTime : currentEnd;

    if (proposedStart >= proposedEnd) {
      // Invalid: start must be before end
      setEditingTimeId(null);
      setEditingTimeField(null);
      return;
    }

    // Check if value actually changed
    const originalValue = field === 'start' ? currentStart : currentEnd;
    if (Math.abs(newTime - originalValue) < 0.01) {
      setEditingTimeId(null);
      setEditingTimeField(null);
      return;
    }

    setSavingTime(true);
    try {
      const updateData = field === 'start'
        ? { StartTime: newTime }
        : { EndTime: newTime };

      // Use appropriate API endpoint based on whether we're editing translated or original
      const apiEndpoint = selectedLanguage && translatedSegments.length > 0
        ? `/api/translated-segments/${segmentId}`
        : `/api/segments/${segmentId}`;

      const response = await fetch(apiEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error('Failed to save time');
      }

      // Update local state
      if (selectedLanguage && translatedSegments.length > 0) {
        setTranslatedSegments(prev =>
          prev.map(s =>
            s.Id === segmentId
              ? { ...s, [field === 'start' ? 'StartTime' : 'EndTime']: newTime }
              : s
          )
        );
      } else {
        setTranscription(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            segments: prev.segments.map(s =>
              s.Id === segmentId
                ? { ...s, [field === 'start' ? 'StartTime' : 'EndTime']: newTime }
                : s
            ),
          };
        });
      }
    } catch (err) {
      console.error('Save time error:', err);
    } finally {
      setSavingTime(false);
      setEditingTimeId(null);
      setEditingTimeField(null);
    }
  }, [transcription, selectedLanguage, translatedSegments, parseTimestamp]);

  // Handle time input blur
  const handleTimeBlur = useCallback(() => {
    if (editingTimeId !== null && editingTimeField !== null) {
      saveTime(editingTimeId, editingTimeField, editingTimeValue);
    }
  }, [editingTimeId, editingTimeField, editingTimeValue, saveTime]);

  // Handle time input keyboard
  const handleTimeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingTimeId(null);
      setEditingTimeField(null);
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editingTimeId !== null && editingTimeField !== null) {
        saveTime(editingTimeId, editingTimeField, editingTimeValue);
      }
    }
    // Prevent video controls from triggering
    e.stopPropagation();
  }, [editingTimeId, editingTimeField, editingTimeValue, saveTime]);

  // Export subtitle file
  const handleExportSubtitle = async (format: string, language?: string) => {
    if (!id) return;

    setExporting(true);
    const langLabel = language ? ` (${language.toUpperCase()})` : '';
    setExportProgress(`Generating ${format.toUpperCase()}${langLabel} file...`);

    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptionId: parseInt(id),
          format,
          includeTimestamps: true,
          language, // Include language for translated exports
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || `export.${format}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setShowExportModal(false);
    } catch (err) {
      console.error('Export error:', err);
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
      setExportProgress('');
    }
  };

  // Export video with burnt-in subtitles
  const handleExportBurnedVideo = async (options: { style: SubtitleStyle; resolution: '720p' | '1080p' | '4k' }, language?: string) => {
    if (!id) return;

    const { style, resolution } = options;

    setExporting(true);
    setExportProgress(`Preparing ${resolution} video with subtitles... This may take several minutes.`);

    try {
      const response = await fetch('/api/export/burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptionId: parseInt(id),
          resolution,
          language: language || undefined,
          style: {
            fontSize: style.fontSize,
            fontColor: style.fontColor,
            showBackground: style.showBackground,
            backgroundColor: style.backgroundColor,
            backgroundOpacity: style.backgroundOpacity,
            paddingX: style.paddingX,
            paddingY: style.paddingY,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || `video_subtitled.mp4`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setShowExportModal(false);
    } catch (err) {
      console.error('Export error:', err);
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
      setExportProgress('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-border-subtle border-t-accent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-text-muted">Loading transcription...</p>
        </div>
      </div>
    );
  }

  if (error || !transcription) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="text-center">
          <p className="text-error mb-4">{error || 'Transcription not found'}</p>
          <Link href="/dashboard" className="text-secondary hover:text-secondary-hover underline">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const videoUrl = file?.PreviewUrl || file?.StorageUrl || file?.AudioUrl;
  const isVideo = file?.FileType === 'video';

  return (
    <div className="min-h-screen bg-base text-text-primary">
      {/* Header */}
      <header className="bg-surface border-b border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between max-w-[1920px] mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 hover:bg-overlay rounded-lg transition-colors text-text-muted hover:text-text-primary"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold truncate max-w-md text-text-primary">{transcription.Title}</h1>
              <div className="flex items-center gap-3 text-sm text-text-muted">
                <span className="uppercase text-secondary">{getLanguageName(transcription.Language)}</span>
                <span>{transcription.segments?.length || 0} segments</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            {translations.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLanguageDropdownOpen(!languageDropdownOpen)}
                  disabled={loadingTranslation}
                  className="h-9 px-3 pr-8 text-sm bg-surface border border-border-default text-text-primary font-medium hover:bg-overlay hover:border-text-muted rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 flex items-center gap-2"
                >
                  {selectedLanguage ? (
                    <>
                      <span>{getLanguageInfo(selectedLanguage).flag}</span>
                      <span>{getLanguageInfo(selectedLanguage).name}</span>
                    </>
                  ) : (
                    <>
                      <span>{getLanguageInfo(transcription.Language).flag}</span>
                      <span>Original ({getLanguageInfo(transcription.Language).name})</span>
                    </>
                  )}
                  <svg
                    className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted transition-transform ${languageDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {languageDropdownOpen && (
                  <>
                    {/* Backdrop to close dropdown */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setLanguageDropdownOpen(false)}
                    />
                    {/* Dropdown menu */}
                    <div className="absolute right-0 top-full mt-1 z-20 py-1 bg-elevated border border-border-subtle rounded-xl shadow-xl min-w-[200px] overflow-hidden">
                      {/* Original language option */}
                      <button
                        onClick={() => {
                          handleLanguageChange(null);
                          setLanguageDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-overlay transition-colors ${
                          !selectedLanguage ? 'bg-accent/10 text-accent' : 'text-text-primary'
                        }`}
                      >
                        <span className="text-lg">{getLanguageInfo(transcription.Language).flag}</span>
                        <span className="flex-1 font-medium">Original ({getLanguageInfo(transcription.Language).name})</span>
                        {!selectedLanguage && (
                          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      {/* Divider */}
                      <div className="border-t border-border-subtle my-1" />

                      {/* Translation options */}
                      {translations.map((t) => {
                        const langInfo = getLanguageInfo(t.language);
                        const isSelected = selectedLanguage === t.language;
                        return (
                          <button
                            key={t.language}
                            onClick={() => {
                              handleLanguageChange(t.language);
                              setLanguageDropdownOpen(false);
                            }}
                            className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-overlay transition-colors ${
                              isSelected ? 'bg-accent/10 text-accent' : 'text-text-primary'
                            }`}
                          >
                            <span className="text-lg">{langInfo.flag}</span>
                            <span className="flex-1 font-medium">{langInfo.name}</span>
                            <span className="text-xs text-text-muted">{t.segmentCount}</span>
                            {isSelected && (
                              <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => setShowTranslationModal(true)}
              className="h-9 px-3 text-sm bg-surface border border-border-default text-text-primary font-medium hover:bg-overlay hover:border-text-muted rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              Translate
              {translations.length > 0 && (
                <span className="px-1.5 py-0.5 bg-accent/20 text-accent text-xs rounded-full font-medium">
                  {translations.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="h-9 px-4 text-sm bg-accent text-black font-medium hover:bg-accent-hover rounded-lg transition-colors"
            >
              Export
            </button>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        videoUrl={videoUrl}
        isVideo={isVideo}
        currentSegmentText={currentSegment?.Text}
        onExportSubtitle={handleExportSubtitle}
        onExportBurnedVideo={handleExportBurnedVideo}
        exporting={exporting}
        exportProgress={exportProgress}
        sourceLanguage={transcription.Language}
        availableTranslations={translations}
        translatedPreviewText={exportPreviewText}
        onExportLanguageChange={handleExportLanguageChange}
      />

      {/* Translation Modal */}
      <TranslationModal
        isOpen={showTranslationModal}
        onClose={() => setShowTranslationModal(false)}
        transcriptionId={parseInt(id, 10)}
        sourceLanguage={transcription.Language || 'auto'}
        existingTranslations={translations}
        onTranslationComplete={loadTranslations}
        onDeleteTranslation={handleDeleteTranslation}
      />

      {/* Main Content */}
      <div className="flex h-[calc(100vh-64px)]">
        {/* Left Panel - Segments List */}
        <div className="w-1/2 border-r border-border-subtle overflow-hidden flex flex-col">
          {/* Segment List Header */}
          <div className="px-4 py-3 bg-surface border-b border-border-subtle flex items-center gap-4 text-sm text-text-muted">
            <span className="w-12">#</span>
            <span className="w-28">Time</span>
            <span className="w-12">Chars</span>
            <span className="w-16">CPS</span>
            <span className="flex-1">Text</span>
          </div>

          {/* Segments */}
          <div className="flex-1 overflow-y-auto bg-base">
            {loadingTranslation ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-border-subtle border-t-accent rounded-full animate-spin" />
                <span className="ml-3 text-text-muted">Loading translation...</span>
              </div>
            ) : selectedLanguage && translatedSegments.length > 0 ? (
              /* Translated Segments */
              translatedSegments.map((segment, index) => {
                const isEditing = editingSegmentId === segment.Id;
                const displayText = isEditing ? editingText : segment.TranslatedText;
                const segmentDuration = segment.EndTime - segment.StartTime;
                const cps = segmentDuration > 0 ? displayText.length / segmentDuration : 0;
                const isActive = currentTime >= segment.StartTime && currentTime < segment.EndTime;
                const charCount = displayText.length;
                const isEditingStartTime = editingTimeId === segment.Id && editingTimeField === 'start';
                const isEditingEndTime = editingTimeId === segment.Id && editingTimeField === 'end';

                return (
                  <div
                    key={segment.Id}
                    onClick={() => !isEditing && !isEditingStartTime && !isEditingEndTime && handleSeek(segment.StartTime + 0.01)}
                    className={`px-4 py-3 border-b border-border-subtle/50 transition-colors ${
                      isEditing || isEditingStartTime || isEditingEndTime
                        ? 'bg-elevated border-l-2 border-l-secondary'
                        : isActive
                        ? 'bg-accent-subtle border-l-2 border-l-accent cursor-pointer hover:bg-surface'
                        : 'cursor-pointer hover:bg-surface'
                    }`}
                  >
                    <div className="flex items-start gap-4 text-sm">
                      <span className="w-12 text-text-faint font-mono pt-1">
                        {String(index + 1).padStart(3, '0')}
                      </span>
                      <div className="w-28 pt-1">
                        {/* Start Time - Editable */}
                        {isEditingStartTime ? (
                          <input
                            ref={timeInputRef}
                            type="text"
                            value={editingTimeValue}
                            onChange={(e) => setEditingTimeValue(e.target.value)}
                            onBlur={handleTimeBlur}
                            onKeyDown={handleTimeKeyDown}
                            className="w-full font-mono text-sm bg-surface border border-secondary rounded px-1 py-0.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary"
                            disabled={savingTime}
                          />
                        ) : (
                          <div
                            onClick={(e) => startEditingTime(segment.Id, 'start', segment.StartTime, e)}
                            className="font-mono text-text-secondary hover:text-accent hover:bg-overlay/50 rounded px-1 -mx-1 cursor-text transition-colors"
                            title="Click to edit start time"
                          >
                            {formatTimestamp(segment.StartTime)}
                          </div>
                        )}
                        {/* End Time - Editable */}
                        {isEditingEndTime ? (
                          <input
                            ref={timeInputRef}
                            type="text"
                            value={editingTimeValue}
                            onChange={(e) => setEditingTimeValue(e.target.value)}
                            onBlur={handleTimeBlur}
                            onKeyDown={handleTimeKeyDown}
                            className="w-full font-mono text-xs bg-surface border border-secondary rounded px-1 py-0.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary mt-0.5"
                            disabled={savingTime}
                          />
                        ) : (
                          <div
                            onClick={(e) => startEditingTime(segment.Id, 'end', segment.EndTime, e)}
                            className="font-mono text-text-faint text-xs hover:text-accent hover:bg-overlay/50 rounded px-1 -mx-1 cursor-text transition-colors"
                            title="Click to edit end time"
                          >
                            {formatTimestamp(segment.EndTime)}
                          </div>
                        )}
                      </div>
                      <span className="w-12 text-text-muted pt-1">{charCount}c</span>
                      <span className={`w-16 font-mono pt-1 ${getCPSColor(cps)}`}>
                        {cps.toFixed(0)}c/s
                      </span>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="relative">
                            <textarea
                              ref={textareaRef}
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onBlur={handleTextareaBlur}
                              onKeyDown={handleTextareaKeyDown}
                              className="w-full bg-surface border border-border-default rounded-lg px-3 py-2 text-text-primary leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-secondary focus:border-transparent"
                              rows={Math.max(2, Math.ceil(editingText.length / 60))}
                              disabled={saving}
                            />
                            {saving && (
                              <div className="absolute right-2 top-2">
                                <div className="w-4 h-4 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                              <span>Enter to save</span>
                              <span>Esc to cancel</span>
                              <span>Shift+Enter for new line</span>
                            </div>
                          </div>
                        ) : (
                          <p
                            onClick={(e) => startEditing(segment.Id, segment.TranslatedText, e)}
                            className="text-text-primary leading-relaxed hover:bg-overlay/50 rounded px-2 py-1 -mx-2 -my-1 cursor-text whitespace-pre-line"
                          >
                            {segment.TranslatedText}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              /* Original Segments */
              transcription.segments?.map((segment, index) => {
                const isEditing = editingSegmentId === segment.Id;
                const displayText = isEditing ? editingText : segment.Text;
                const cps = calculateCPS({ ...segment, Text: displayText });
                const isActive = currentSegment?.Id === segment.Id;
                const charCount = displayText.length;
                const isEditingStartTime = editingTimeId === segment.Id && editingTimeField === 'start';
                const isEditingEndTime = editingTimeId === segment.Id && editingTimeField === 'end';

                return (
                  <div
                    key={segment.Id}
                    onClick={() => !isEditing && !isEditingStartTime && !isEditingEndTime && handleSegmentClick(segment)}
                    className={`px-4 py-3 border-b border-border-subtle/50 transition-colors ${
                      isEditing || isEditingStartTime || isEditingEndTime
                        ? 'bg-elevated border-l-2 border-l-secondary'
                        : isActive
                        ? 'bg-accent-subtle border-l-2 border-l-accent cursor-pointer hover:bg-surface'
                        : 'cursor-pointer hover:bg-surface'
                    }`}
                  >
                    <div className="flex items-start gap-4 text-sm">
                      <span className="w-12 text-text-faint font-mono pt-1">
                        {String(index + 1).padStart(3, '0')}
                      </span>
                      <div className="w-28 pt-1">
                        {/* Start Time - Editable */}
                        {isEditingStartTime ? (
                          <input
                            ref={timeInputRef}
                            type="text"
                            value={editingTimeValue}
                            onChange={(e) => setEditingTimeValue(e.target.value)}
                            onBlur={handleTimeBlur}
                            onKeyDown={handleTimeKeyDown}
                            className="w-full font-mono text-sm bg-surface border border-secondary rounded px-1 py-0.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary"
                            disabled={savingTime}
                          />
                        ) : (
                          <div
                            onClick={(e) => startEditingTime(segment.Id, 'start', segment.StartTime, e)}
                            className="font-mono text-text-secondary hover:text-accent hover:bg-overlay/50 rounded px-1 -mx-1 cursor-text transition-colors"
                            title="Click to edit start time"
                          >
                            {formatTimestamp(segment.StartTime)}
                          </div>
                        )}
                        {/* End Time - Editable */}
                        {isEditingEndTime ? (
                          <input
                            ref={timeInputRef}
                            type="text"
                            value={editingTimeValue}
                            onChange={(e) => setEditingTimeValue(e.target.value)}
                            onBlur={handleTimeBlur}
                            onKeyDown={handleTimeKeyDown}
                            className="w-full font-mono text-xs bg-surface border border-secondary rounded px-1 py-0.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary mt-0.5"
                            disabled={savingTime}
                          />
                        ) : (
                          <div
                            onClick={(e) => startEditingTime(segment.Id, 'end', segment.EndTime, e)}
                            className="font-mono text-text-faint text-xs hover:text-accent hover:bg-overlay/50 rounded px-1 -mx-1 cursor-text transition-colors"
                            title="Click to edit end time"
                          >
                            {formatTimestamp(segment.EndTime)}
                          </div>
                        )}
                      </div>
                      <span className="w-12 text-text-muted pt-1">{charCount}c</span>
                      <span className={`w-16 font-mono pt-1 ${getCPSColor(cps)}`}>
                        {cps.toFixed(0)}c/s
                      </span>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="relative">
                            <textarea
                              ref={textareaRef}
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onBlur={handleTextareaBlur}
                              onKeyDown={handleTextareaKeyDown}
                              className="w-full bg-surface border border-border-default rounded-lg px-3 py-2 text-text-primary leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-secondary focus:border-transparent"
                              rows={Math.max(2, Math.ceil(editingText.length / 60))}
                              disabled={saving}
                            />
                            {saving && (
                              <div className="absolute right-2 top-2">
                                <div className="w-4 h-4 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                              <span>Enter to save</span>
                              <span>Esc to cancel</span>
                              <span>Shift+Enter for new line</span>
                            </div>
                          </div>
                        ) : (
                          <p
                            onClick={(e) => startEditing(segment.Id, segment.Text, e)}
                            className="text-text-primary leading-relaxed hover:bg-overlay/50 rounded px-2 py-1 -mx-2 -my-1 cursor-text whitespace-pre-line"
                          >
                            {segment.Text}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel - Video Player */}
        <div className="w-1/2 flex flex-col bg-black overflow-y-auto">
          {/* Video Container */}
          <div className="relative flex justify-center overflow-hidden">
            {videoUrl ? (
              <>
                {isVideo ? (
                  <div className="relative w-full">
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="w-full"
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                    />
                    {/* Subtitle Overlay */}
                    {(() => {
                      // Find the current subtitle text to display
                      let subtitleText: string | null = null;
                      if (selectedLanguage && translatedSegments.length > 0) {
                        const translatedSeg = translatedSegments.find(
                          seg => currentTime >= seg.StartTime && currentTime < seg.EndTime
                        );
                        subtitleText = translatedSeg?.TranslatedText || null;
                      } else if (currentSegment) {
                        subtitleText = currentSegment.Text;
                      }

                      return subtitleText ? (
                        <div className="absolute bottom-4 left-0 right-0 text-center px-4 pointer-events-none">
                          <p className="inline-block bg-black/80 text-white px-4 py-2 text-lg leading-relaxed max-w-[90%] rounded shadow-lg whitespace-pre-line">
                            {subtitleText}
                          </p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <div className="w-full h-64 flex items-center justify-center bg-surface rounded-lg">
                    <audio
                      ref={videoRef as any}
                      src={videoUrl}
                      className="w-full max-w-md"
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      controls
                    />
                    {(() => {
                      // Find the current subtitle text to display
                      let subtitleText: string | null = null;
                      if (selectedLanguage && translatedSegments.length > 0) {
                        const translatedSeg = translatedSegments.find(
                          seg => currentTime >= seg.StartTime && currentTime < seg.EndTime
                        );
                        subtitleText = translatedSeg?.TranslatedText || null;
                      } else if (currentSegment) {
                        subtitleText = currentSegment.Text;
                      }

                      return subtitleText ? (
                        <div className="absolute bottom-20 left-4 right-4 text-center pointer-events-none">
                          <p className="inline-block bg-overlay text-white px-4 py-2 text-lg leading-relaxed max-w-[90%] rounded whitespace-pre-line">
                            {subtitleText}
                          </p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </>
            ) : (
              <div className="text-text-muted">No media available</div>
            )}
          </div>

          {/* Video Controls */}
          <div className="bg-surface border-t border-border-subtle p-4">
            {/* Progress Bar */}
            <div className="mb-4">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="w-full h-1 bg-border-subtle rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>{formatTimestamp(currentTime)}</span>
                <span>{formatTimestamp(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              {/* Skip Back */}
              <button
                onClick={() => handleSeek(Math.max(0, currentTime - 5))}
                className="p-2 hover:bg-overlay rounded-lg transition-colors text-text-muted hover:text-text-primary"
                title="Back 5s"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                </svg>
              </button>

              {/* Play/Pause */}
              <button
                onClick={handlePlayPause}
                className="p-3 bg-accent hover:bg-accent-hover text-black rounded-full transition-colors"
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </button>

              {/* Skip Forward */}
              <button
                onClick={() => handleSeek(Math.min(duration, currentTime + 5))}
                className="p-2 hover:bg-overlay rounded-lg transition-colors text-text-muted hover:text-text-primary"
                title="Forward 5s"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                </svg>
              </button>

              {/* Playback Speed */}
              <select
                value={playbackRate}
                onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                className="ml-4 px-3 py-1.5 bg-overlay border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value={0.5}>0.5x</option>
                <option value={0.75}>0.75x</option>
                <option value={1}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2.0x</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
