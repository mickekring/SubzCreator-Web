'use client';

/**
 * Export Modal Component
 * Professional export interface with subtitle file options and burnt-in video preview
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface SubtitleStyle {
  fontSize: number;
  fontColor: string;
  showBackground: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  paddingX: number;
  paddingY: number;
}

interface BurnExportOptions {
  style: SubtitleStyle;
  resolution: '720p' | '1080p' | '4k';
}

interface TranslationOption {
  language: string;
  segmentCount: number;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl?: string;
  isVideo: boolean;
  currentSegmentText?: string;
  onExportSubtitle: (format: string, language?: string) => Promise<void>;
  onExportBurnedVideo: (options: BurnExportOptions, language?: string) => Promise<void>;
  exporting: boolean;
  exportProgress: string;
  sourceLanguage?: string;
  availableTranslations?: TranslationOption[];
  translatedPreviewText?: string; // Preview text for currently selected language
  onExportLanguageChange?: (language: string | null) => void; // Called when language changes in export modal
}

const DEFAULT_STYLE: SubtitleStyle = {
  fontSize: 48,
  fontColor: '#FFFFFF',
  showBackground: true,
  backgroundColor: '#000000',
  backgroundOpacity: 80,
  paddingX: 10,
  paddingY: 5, // Limited to 2-8 to avoid line overlap in multi-line subtitles
};

// Language name mapping
const LANGUAGE_NAMES: Record<string, { name: string; flag: string }> = {
  en: { name: 'English', flag: '🇬🇧' },
  sv: { name: 'Swedish', flag: '🇸🇪' },
  de: { name: 'German', flag: '🇩🇪' },
  fr: { name: 'French', flag: '🇫🇷' },
  es: { name: 'Spanish', flag: '🇪🇸' },
  it: { name: 'Italian', flag: '🇮🇹' },
  pt: { name: 'Portuguese', flag: '🇵🇹' },
  nl: { name: 'Dutch', flag: '🇳🇱' },
  pl: { name: 'Polish', flag: '🇵🇱' },
  ru: { name: 'Russian', flag: '🇷🇺' },
  zh: { name: 'Chinese', flag: '🇨🇳' },
  ja: { name: 'Japanese', flag: '🇯🇵' },
  ko: { name: 'Korean', flag: '🇰🇷' },
  ar: { name: 'Arabic', flag: '🇸🇦' },
  hi: { name: 'Hindi', flag: '🇮🇳' },
  tr: { name: 'Turkish', flag: '🇹🇷' },
  da: { name: 'Danish', flag: '🇩🇰' },
  no: { name: 'Norwegian', flag: '🇳🇴' },
  fi: { name: 'Finnish', flag: '🇫🇮' },
  cs: { name: 'Czech', flag: '🇨🇿' },
  el: { name: 'Greek', flag: '🇬🇷' },
  he: { name: 'Hebrew', flag: '🇮🇱' },
  hu: { name: 'Hungarian', flag: '🇭🇺' },
  id: { name: 'Indonesian', flag: '🇮🇩' },
  th: { name: 'Thai', flag: '🇹🇭' },
  uk: { name: 'Ukrainian', flag: '🇺🇦' },
  vi: { name: 'Vietnamese', flag: '🇻🇳' },
};

function getLanguageInfo(code: string): { name: string; flag: string } {
  return LANGUAGE_NAMES[code.toLowerCase()] || { name: code.toUpperCase(), flag: '🌐' };
}

export default function ExportModal({
  isOpen,
  onClose,
  videoUrl,
  isVideo,
  currentSegmentText,
  onExportSubtitle,
  onExportBurnedVideo,
  exporting,
  exportProgress,
  sourceLanguage,
  availableTranslations = [],
  translatedPreviewText,
  onExportLanguageChange,
}: ExportModalProps) {
  const [mode, setMode] = useState<'select' | 'subtitle' | 'burnin'>('select');
  const [style, setStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);
  const [resolution, setResolution] = useState<'720p' | '1080p' | '4k'>('1080p');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewText, setPreviewText] = useState('Sample subtitle text for preview');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(''); // '' means original

  // Notify parent when language changes so it can load the translated segments
  useEffect(() => {
    if (onExportLanguageChange) {
      onExportLanguageChange(selectedLanguage || null);
    }
  }, [selectedLanguage, onExportLanguageChange]);

  // Update preview text when segment changes or translated preview text arrives
  useEffect(() => {
    if (selectedLanguage && translatedPreviewText) {
      setPreviewText(translatedPreviewText);
    } else if (currentSegmentText) {
      setPreviewText(currentSegmentText);
    }
  }, [currentSegmentText, selectedLanguage, translatedPreviewText]);

  // Reset mode when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode('select');
    }
  }, [isOpen]);

  const handleStyleChange = useCallback((key: keyof SubtitleStyle, value: number | string | boolean) => {
    setStyle(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleExportBurnIn = useCallback(() => {
    onExportBurnedVideo({ style, resolution }, selectedLanguage || undefined);
  }, [onExportBurnedVideo, style, resolution, selectedLanguage]);

  if (!isOpen) return null;

  // Generate background color with opacity
  const bgColorWithOpacity = style.showBackground
    ? `${style.backgroundColor}${Math.round(style.backgroundOpacity * 2.55).toString(16).padStart(2, '0')}`
    : 'transparent';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className={`bg-elevated rounded-2xl shadow-2xl border border-border-subtle overflow-hidden transition-all duration-300 ${
          mode === 'burnin' ? 'w-full max-w-5xl' : 'w-full max-w-lg'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface">
          <div className="flex items-center gap-3">
            {mode !== 'select' && (
              <button
                onClick={() => setMode('select')}
                className="p-1.5 hover:bg-overlay rounded-lg transition-colors text-text-muted hover:text-text-primary"
                disabled={exporting}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-semibold text-text-primary">
              {mode === 'select' && 'Export'}
              {mode === 'subtitle' && 'Export Subtitle File'}
              {mode === 'burnin' && 'Export with Burnt-in Subtitles'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-overlay rounded-lg transition-colors text-text-muted hover:text-text-primary"
            disabled={exporting}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {exporting ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-3 border-border-subtle border-t-accent rounded-full animate-spin mx-auto" />
              <p className="mt-4 text-text-secondary">{exportProgress}</p>
              <p className="mt-2 text-sm text-text-muted">This may take several minutes for longer videos</p>
            </div>
          ) : (
            <>
              {/* Mode Selection */}
              {mode === 'select' && (
                <div className="space-y-4">
                  {/* Subtitle Files Option */}
                  <button
                    onClick={() => setMode('subtitle')}
                    className="w-full p-5 bg-surface hover:bg-overlay border border-border-subtle hover:border-accent/50 rounded-xl text-left transition-all group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-overlay rounded-lg group-hover:bg-accent/10 transition-colors">
                        <svg className="w-6 h-6 text-text-secondary group-hover:text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-text-primary group-hover:text-accent transition-colors">
                          Subtitle Files
                        </h3>
                        <p className="text-sm text-text-muted mt-1">
                          Export as SRT, VTT, ASS, or TXT for use with any video player
                        </p>
                      </div>
                      <svg className="w-5 h-5 text-text-muted group-hover:text-accent transition-colors mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>

                  {/* Burnt-in Video Option */}
                  {isVideo && videoUrl && (
                    <button
                      onClick={() => setMode('burnin')}
                      className="w-full p-5 bg-surface hover:bg-overlay border border-border-subtle hover:border-secondary/50 rounded-xl text-left transition-all group"
                    >
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-overlay rounded-lg group-hover:bg-secondary/10 transition-colors">
                          <svg className="w-6 h-6 text-text-secondary group-hover:text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-text-primary group-hover:text-secondary transition-colors">
                            Burnt-in Video
                          </h3>
                          <p className="text-sm text-text-muted mt-1">
                            Export video with subtitles permanently embedded. Customize font, colors, and style.
                          </p>
                        </div>
                        <svg className="w-5 h-5 text-text-muted group-hover:text-secondary transition-colors mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  )}

                  {!isVideo && (
                    <p className="text-sm text-text-muted text-center py-2">
                      Burnt-in export is only available for video files
                    </p>
                  )}
                </div>
              )}

              {/* Subtitle File Formats */}
              {mode === 'subtitle' && (
                <div className="space-y-4">
                  {/* Language Selector - only show if translations exist */}
                  {availableTranslations.length > 0 && (
                    <div className="p-4 bg-surface border border-border-subtle rounded-xl">
                      <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
                        Export Language
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {/* Original language option */}
                        <button
                          onClick={() => setSelectedLanguage('')}
                          className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                            selectedLanguage === ''
                              ? 'bg-accent text-black'
                              : 'bg-overlay text-text-primary hover:bg-border-subtle'
                          }`}
                        >
                          <span>{sourceLanguage ? getLanguageInfo(sourceLanguage).flag : '🌐'}</span>
                          <span>{sourceLanguage ? getLanguageInfo(sourceLanguage).name : 'Original'}</span>
                        </button>
                        {/* Translation options */}
                        {availableTranslations.map((t) => {
                          const langInfo = getLanguageInfo(t.language);
                          return (
                            <button
                              key={t.language}
                              onClick={() => setSelectedLanguage(t.language)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                                selectedLanguage === t.language
                                  ? 'bg-accent text-black'
                                  : 'bg-overlay text-text-primary hover:bg-border-subtle'
                              }`}
                            >
                              <span>{langInfo.flag}</span>
                              <span>{langInfo.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <p className="text-sm text-text-muted">
                    Choose a format compatible with your video player or editing software
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { format: 'srt', name: 'SRT', desc: 'SubRip - Most compatible' },
                      { format: 'vtt', name: 'VTT', desc: 'WebVTT - For web players' },
                      { format: 'ass', name: 'ASS', desc: 'Advanced SubStation Alpha' },
                      { format: 'txt', name: 'TXT', desc: 'Plain text transcript' },
                    ].map(({ format, name, desc }) => (
                      <button
                        key={format}
                        onClick={() => onExportSubtitle(format, selectedLanguage || undefined)}
                        className="p-4 bg-surface hover:bg-overlay border border-border-subtle hover:border-accent/50 rounded-xl text-left transition-all group"
                      >
                        <div className="font-mono text-lg font-bold text-accent group-hover:text-accent-hover">
                          .{format}
                        </div>
                        <div className="font-medium text-text-primary mt-1">{name}</div>
                        <div className="text-xs text-text-muted mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Burnt-in Video Editor */}
              {mode === 'burnin' && (
                <div className="space-y-4">
                  {/* Language Selector for burn-in - only show if translations exist */}
                  {availableTranslations.length > 0 && (
                    <div className="p-4 bg-surface border border-border-subtle rounded-xl">
                      <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
                        Subtitle Language
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {/* Original language option */}
                        <button
                          onClick={() => setSelectedLanguage('')}
                          className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                            selectedLanguage === ''
                              ? 'bg-accent text-black'
                              : 'bg-overlay text-text-primary hover:bg-border-subtle'
                          }`}
                        >
                          <span>{sourceLanguage ? getLanguageInfo(sourceLanguage).flag : '🌐'}</span>
                          <span>{sourceLanguage ? getLanguageInfo(sourceLanguage).name : 'Original'}</span>
                        </button>
                        {/* Translation options */}
                        {availableTranslations.map((t) => {
                          const langInfo = getLanguageInfo(t.language);
                          return (
                            <button
                              key={t.language}
                              onClick={() => setSelectedLanguage(t.language)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                                selectedLanguage === t.language
                                  ? 'bg-accent text-black'
                                  : 'bg-overlay text-text-primary hover:bg-border-subtle'
                              }`}
                            >
                              <span>{langInfo.flag}</span>
                              <span>{langInfo.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-6">
                  {/* Video Preview */}
                  <div className="flex-1 min-w-0">
                    <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                      <video
                        ref={videoRef}
                        src={videoUrl}
                        className="w-full h-full object-contain"
                        muted
                        loop
                        autoPlay
                        playsInline
                      />
                      {/* Subtitle Preview Overlay */}
                      <div className="absolute bottom-6 left-0 right-0 text-center px-4 pointer-events-none">
                        <span
                          className="inline-block rounded whitespace-pre-line"
                          style={{
                            fontSize: `${style.fontSize / 3}px`, // Scale down for preview
                            color: style.fontColor,
                            backgroundColor: bgColorWithOpacity,
                            padding: `${style.paddingY / 2}px ${style.paddingX / 2}px`,
                            lineHeight: 1.4,
                          }}
                        >
                          {previewText}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-text-muted mt-2 text-center">
                      Live preview - adjust settings on the right
                    </p>
                  </div>

                  {/* Controls Panel */}
                  <div className="w-72 space-y-5">
                    {/* Font Size */}
                    <div>
                      <label className="flex items-center justify-between text-sm text-text-secondary mb-2">
                        <span>Font Size</span>
                        <span className="font-mono text-text-muted">{style.fontSize}px</span>
                      </label>
                      <input
                        type="range"
                        min={24}
                        max={96}
                        value={style.fontSize}
                        onChange={(e) => handleStyleChange('fontSize', parseInt(e.target.value))}
                        className="w-full h-2 bg-overlay rounded-full appearance-none cursor-pointer accent-accent"
                      />
                      <div className="flex justify-between text-xs text-text-muted mt-1">
                        <span>Small</span>
                        <span>Large</span>
                      </div>
                    </div>

                    {/* Font Color */}
                    <div>
                      <label className="block text-sm text-text-secondary mb-2">Font Color</label>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <input
                            type="color"
                            value={style.fontColor}
                            onChange={(e) => handleStyleChange('fontColor', e.target.value)}
                            className="w-12 h-10 rounded-lg cursor-pointer border-2 border-border-subtle bg-transparent"
                          />
                        </div>
                        <div className="flex gap-2">
                          {['#FFFFFF', '#FFFF00', '#00FF00', '#00FFFF'].map(color => (
                            <button
                              key={color}
                              onClick={() => handleStyleChange('fontColor', color)}
                              className={`w-8 h-8 rounded-lg border-2 transition-all ${
                                style.fontColor === color ? 'border-accent scale-110' : 'border-border-subtle hover:border-border-default'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Background Toggle */}
                    <div>
                      <label className="flex items-center justify-between text-sm text-text-secondary mb-2">
                        <span>Background</span>
                        <button
                          onClick={() => handleStyleChange('showBackground', !style.showBackground)}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            style.showBackground ? 'bg-accent' : 'bg-overlay'
                          }`}
                        >
                          <span
                            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                              style.showBackground ? 'left-6' : 'left-1'
                            }`}
                          />
                        </button>
                      </label>
                    </div>

                    {/* Background Color & Opacity (only when background enabled) */}
                    {style.showBackground && (
                      <>
                        <div>
                          <label className="block text-sm text-text-secondary mb-2">Background Color</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={style.backgroundColor}
                              onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                              className="w-12 h-10 rounded-lg cursor-pointer border-2 border-border-subtle bg-transparent"
                            />
                            <div className="flex gap-2">
                              {['#000000', '#1a1a2e', '#16213e', '#0f3460'].map(color => (
                                <button
                                  key={color}
                                  onClick={() => handleStyleChange('backgroundColor', color)}
                                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                                    style.backgroundColor === color ? 'border-accent scale-110' : 'border-border-subtle hover:border-border-default'
                                  }`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-sm text-text-secondary mb-2">
                            <span>Background Opacity</span>
                            <span className="font-mono text-text-muted">{style.backgroundOpacity}%</span>
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={style.backgroundOpacity}
                            onChange={(e) => handleStyleChange('backgroundOpacity', parseInt(e.target.value))}
                            className="w-full h-2 bg-overlay rounded-full appearance-none cursor-pointer accent-accent"
                          />
                        </div>

                        <div>
                          <label className="flex items-center justify-between text-sm text-text-secondary mb-2">
                            <span>Box Padding</span>
                            <span className="font-mono text-text-muted">{style.paddingY}px</span>
                          </label>
                          <input
                            type="range"
                            min={2}
                            max={8}
                            value={style.paddingY}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              handleStyleChange('paddingY', val);
                              handleStyleChange('paddingX', val * 2);
                            }}
                            className="w-full h-2 bg-overlay rounded-full appearance-none cursor-pointer accent-accent"
                          />
                          <p className="text-xs text-text-muted mt-1">Limited to avoid line overlap</p>
                        </div>
                      </>
                    )}

                    {/* Resolution */}
                    <div>
                      <label className="block text-sm text-text-secondary mb-2">Output Resolution</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: '720p', label: '720p', desc: 'Smaller file' },
                          { value: '1080p', label: '1080p', desc: 'Recommended' },
                          { value: '4k', label: 'Original', desc: 'Best quality' },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setResolution(opt.value as '720p' | '1080p' | '4k')}
                            className={`p-2 rounded-lg border-2 text-center transition-all ${
                              resolution === opt.value
                                ? 'border-accent bg-accent/10'
                                : 'border-border-subtle hover:border-border-default'
                            }`}
                          >
                            <div className={`text-sm font-medium ${resolution === opt.value ? 'text-accent' : 'text-text-primary'}`}>
                              {opt.label}
                            </div>
                            <div className="text-xs text-text-muted">{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Export Button */}
                    <button
                      onClick={handleExportBurnIn}
                      className="w-full py-3 bg-accent hover:bg-accent-hover text-black font-semibold rounded-xl transition-colors mt-4"
                    >
                      Export Video
                    </button>
                  </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
