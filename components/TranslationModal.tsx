'use client';

/**
 * Translation Modal Component
 * Interface for translating subtitles to different languages using LLM
 */

import { useState, useEffect } from 'react';

// Translation providers (Berget first as default)
const PROVIDERS = [
  {
    id: 'berget',
    name: 'Berget AI',
    flag: '🇸🇪',
    description: 'Swedish AI - EU data residency',
    models: [
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', description: 'Reasoning model (Recommended)' },
      { id: 'mistralai/Mistral-Small-3.2-24B-Instruct-2506', name: 'Mistral Small', description: 'Fast and efficient' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    flag: '🇺🇸',
    description: 'GPT-4.1 - Fast and reliable',
    models: [
      { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Best quality' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Faster, lower cost' },
    ],
  },
];

// Supported languages for translation
const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'da', name: 'Danish', flag: '🇩🇰' },
  { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
  { code: 'cs', name: 'Czech', flag: '🇨🇿' },
  { code: 'el', name: 'Greek', flag: '🇬🇷' },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
  { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'th', name: 'Thai', flag: '🇹🇭' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
];

interface ExistingTranslation {
  language: string;
  segmentCount: number;
}

interface TranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  transcriptionId: number;
  sourceLanguage: string;
  existingTranslations: ExistingTranslation[];
  onTranslationComplete: () => void;
  onDeleteTranslation: (language: string) => Promise<void>;
}

export default function TranslationModal({
  isOpen,
  onClose,
  transcriptionId,
  sourceLanguage,
  existingTranslations,
  onTranslationComplete,
  onDeleteTranslation,
}: TranslationModalProps) {
  const [mode, setMode] = useState<'select' | 'translating' | 'manage'>('select');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(PROVIDERS[0].id);
  const [selectedModel, setSelectedModel] = useState(PROVIDERS[0].models[0].id);
  const [translating, setTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);

  // Get current provider and model info
  const currentProvider = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];
  const currentModel = currentProvider.models.find((m) => m.id === selectedModel) || currentProvider.models[0];

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(existingTranslations.length > 0 ? 'manage' : 'select');
      setSelectedLanguage('');
      setError(null);
      setProgress(0);
      setProgressMessage('');
    }
  }, [isOpen, existingTranslations.length]);

  // Update model when provider changes
  useEffect(() => {
    const provider = PROVIDERS.find((p) => p.id === selectedProvider);
    if (provider && !provider.models.some((m) => m.id === selectedModel)) {
      setSelectedModel(provider.models[0].id);
    }
  }, [selectedProvider, selectedModel]);

  // Filter out source language and already translated languages
  const availableLanguages = LANGUAGES.filter(
    (lang) =>
      lang.code !== sourceLanguage.toLowerCase() &&
      !existingTranslations.some((t) => t.language === lang.code)
  );

  const handleStartTranslation = async () => {
    if (!selectedLanguage) return;

    setMode('translating');
    setTranslating(true);
    setError(null);
    setProgress(0);
    setProgressMessage('Starting translation...');

    try {
      // Use streaming API for real-time progress updates
      const response = await fetch('/api/translate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptionId,
          targetLanguage: selectedLanguage,
          provider: selectedProvider,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Translation failed');
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/^event: (\w+)/);
          const dataMatch = line.match(/data: (.+)$/m);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            if (eventType === 'progress') {
              setProgress(data.progress);
              setProgressMessage(data.message);
            } else if (eventType === 'complete') {
              setProgress(100);
              setProgressMessage('Translation complete!');
              setTimeout(() => {
                onTranslationComplete();
                onClose();
              }, 1500);
            } else if (eventType === 'error') {
              throw new Error(data.error || 'Translation failed');
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
      setMode('select');
    } finally {
      setTranslating(false);
    }
  };

  const handleDeleteTranslation = async (language: string) => {
    setDeleting(language);
    try {
      await onDeleteTranslation(language);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete translation');
    } finally {
      setDeleting(null);
    }
  };

  const getLanguageInfo = (code: string) => {
    return LANGUAGES.find((l) => l.code === code) || { code, name: code.toUpperCase(), flag: '🌐' };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-elevated rounded-2xl shadow-2xl border border-border-subtle overflow-visible w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface">
          <div className="flex items-center gap-3">
            {mode !== 'select' && mode !== 'manage' && (
              <button
                onClick={() => setMode(existingTranslations.length > 0 ? 'manage' : 'select')}
                className="p-1.5 hover:bg-overlay rounded-lg transition-colors text-text-muted hover:text-text-primary"
                disabled={translating}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div className="p-2 bg-overlay rounded-lg">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-text-primary">
              {mode === 'select' && 'Translate Subtitles'}
              {mode === 'manage' && 'Translations'}
              {mode === 'translating' && 'Translating...'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-overlay rounded-lg transition-colors text-text-muted hover:text-text-primary"
            disabled={translating}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Translation Progress */}
          {mode === 'translating' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 border-4 border-border-subtle border-t-accent rounded-full animate-spin mx-auto" />
              <p className="mt-6 text-text-primary font-medium">{progressMessage}</p>
              <div className="mt-4 w-full bg-overlay rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-text-muted">This may take a few minutes for longer videos</p>
            </div>
          )}

          {/* Manage Existing Translations */}
          {mode === 'manage' && !translating && (
            <div className="space-y-4">
              {/* Existing translations */}
              {existingTranslations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-text-muted mb-3">Existing translations:</p>
                  {existingTranslations.map((translation) => {
                    const langInfo = getLanguageInfo(translation.language);
                    return (
                      <div
                        key={translation.language}
                        className="flex items-center justify-between p-4 bg-surface border border-border-subtle rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{langInfo.flag}</span>
                          <div>
                            <p className="font-medium text-text-primary">{langInfo.name}</p>
                            <p className="text-xs text-text-muted">{translation.segmentCount} segments</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteTranslation(translation.language)}
                          disabled={deleting === translation.language}
                          className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          title="Delete translation"
                        >
                          {deleting === translation.language ? (
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add new translation button */}
              {availableLanguages.length > 0 && (
                <button
                  onClick={() => setMode('select')}
                  className="w-full p-4 bg-surface hover:bg-overlay border border-border-subtle hover:border-accent/50 rounded-xl text-left transition-all group flex items-center gap-3"
                >
                  <div className="p-2 bg-overlay rounded-lg group-hover:bg-accent/10">
                    <svg className="w-5 h-5 text-text-secondary group-hover:text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="font-medium text-text-primary group-hover:text-accent">Add Translation</span>
                </button>
              )}
            </div>
          )}

          {/* Select Language */}
          {mode === 'select' && !translating && (
            <div className="space-y-5">
              <p className="text-sm text-text-muted">
                Select a target language to translate your subtitles using AI.
              </p>

              {/* Language Dropdown */}
              <div className="relative">
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                  Target Language
                </label>
                <button
                  type="button"
                  onClick={() => setLanguageDropdownOpen(!languageDropdownOpen)}
                  className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-surface text-text-primary text-left flex items-center justify-between hover:bg-overlay transition-all focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <span className="flex items-center gap-3">
                    {selectedLanguage ? (
                      <>
                        <span className="text-lg">{getLanguageInfo(selectedLanguage).flag}</span>
                        <span className="font-medium">{getLanguageInfo(selectedLanguage).name}</span>
                      </>
                    ) : (
                      <span className="text-text-muted">Select a language...</span>
                    )}
                  </span>
                  <svg
                    className={`w-5 h-5 text-text-muted transition-transform ${languageDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {languageDropdownOpen && (
                  <div className="absolute z-50 w-full mt-2 py-2 bg-elevated border border-border-subtle rounded-xl shadow-xl max-h-64 overflow-y-auto">
                    {availableLanguages.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          setSelectedLanguage(lang.code);
                          setLanguageDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-overlay transition-colors ${
                          selectedLanguage === lang.code ? 'bg-accent/10 text-accent' : 'text-text-primary'
                        }`}
                      >
                        <span className="text-lg">{lang.flag}</span>
                        <span className="flex-1 font-medium">{lang.name}</span>
                        {selectedLanguage === lang.code && (
                          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Provider & Model Selection */}
              <div className="relative">
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                  AI Provider & Model
                </label>
                <button
                  type="button"
                  onClick={() => setProviderDropdownOpen(!providerDropdownOpen)}
                  className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-surface text-text-primary text-left flex items-center justify-between hover:bg-overlay transition-all focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-xl">{currentProvider.flag}</span>
                    <div>
                      <p className="font-medium">{currentProvider.name} - {currentModel.name}</p>
                      <p className="text-xs text-text-muted">{currentModel.description}</p>
                    </div>
                  </span>
                  <svg
                    className={`w-5 h-5 text-text-muted transition-transform ${providerDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {providerDropdownOpen && (
                  <div className="absolute z-50 w-full mt-2 py-2 bg-elevated border border-border-subtle rounded-xl shadow-xl max-h-80 overflow-y-auto">
                    {PROVIDERS.map((provider) => (
                      <div key={provider.id}>
                        {/* Provider header */}
                        <div className="px-4 py-2 bg-surface/50">
                          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                            <span className="text-base">{provider.flag}</span>
                            {provider.name}
                          </p>
                          <p className="text-xs text-text-faint ml-6">{provider.description}</p>
                        </div>
                        {/* Models for this provider */}
                        {provider.models.map((model) => {
                          const isSelected = selectedProvider === provider.id && selectedModel === model.id;
                          return (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                setSelectedProvider(provider.id);
                                setSelectedModel(model.id);
                                setProviderDropdownOpen(false);
                              }}
                              className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-overlay transition-colors ${
                                isSelected ? 'bg-accent/10 text-accent' : 'text-text-primary'
                              }`}
                            >
                              <div className="flex-1">
                                <p className="font-medium">{model.name}</p>
                                <p className="text-xs text-text-muted">{model.description}</p>
                              </div>
                              {isSelected && (
                                <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Start button */}
              <button
                onClick={handleStartTranslation}
                disabled={!selectedLanguage}
                className="w-full py-3 bg-accent hover:bg-accent-hover disabled:bg-overlay disabled:text-text-muted text-black font-semibold rounded-xl transition-all disabled:cursor-not-allowed"
              >
                Start Translation
              </button>

              {/* Back button if there are existing translations */}
              {existingTranslations.length > 0 && (
                <button
                  onClick={() => setMode('manage')}
                  className="w-full py-2 text-text-muted hover:text-text-primary transition-colors text-sm"
                >
                  Back to translations
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
