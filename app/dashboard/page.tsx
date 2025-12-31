'use client';

/**
 * Dashboard Page
 * Cinematic Studio Design - Split layout with upload staging and projects focus
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { FileUploader } from '@/components/upload/FileUploader';
import { UserMenu } from '@/components/UserMenu';
import { formatDuration } from '@/lib/utils/format';
import type { File as FileType, Transcription } from '@/lib/types';

// Supported languages for transcription (Auto first, then Swedish/English, then alphabetical)
const LANGUAGES = [
  { code: '', name: 'Auto-detect', flag: '🌐' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  // Alphabetical
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'bg', name: 'Bulgarian', flag: '🇧🇬' },
  { code: 'ca', name: 'Catalan', flag: '🇪🇸' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'hr', name: 'Croatian', flag: '🇭🇷' },
  { code: 'cs', name: 'Czech', flag: '🇨🇿' },
  { code: 'da', name: 'Danish', flag: '🇩🇰' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'et', name: 'Estonian', flag: '🇪🇪' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'el', name: 'Greek', flag: '🇬🇷' },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'lv', name: 'Latvian', flag: '🇱🇻' },
  { code: 'lt', name: 'Lithuanian', flag: '🇱🇹' },
  { code: 'ms', name: 'Malay', flag: '🇲🇾' },
  { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'sr', name: 'Serbian', flag: '🇷🇸' },
  { code: 'sk', name: 'Slovak', flag: '🇸🇰' },
  { code: 'sl', name: 'Slovenian', flag: '🇸🇮' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'th', name: 'Thai', flag: '🇹🇭' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
] as const;

// Helper to get language name from code or name
function getLanguageName(codeOrName: string): string {
  if (!codeOrName) return 'Unknown';
  const lower = codeOrName.toLowerCase();
  // Try matching by code first
  const byCode = LANGUAGES.find(l => l.code.toLowerCase() === lower);
  if (byCode) return byCode.name;
  // Try matching by name
  const byName = LANGUAGES.find(l => l.name.toLowerCase() === lower);
  if (byName) return byName.name;
  return codeOrName;
}

// Helper to get language flag from code or name
function getLanguageFlag(codeOrName: string): string {
  if (!codeOrName) return '🌐';
  const lower = codeOrName.toLowerCase();
  // Try matching by code first
  const byCode = LANGUAGES.find(l => l.code.toLowerCase() === lower);
  if (byCode) return byCode.flag;
  // Try matching by name
  const byName = LANGUAGES.find(l => l.name.toLowerCase() === lower);
  if (byName) return byName.flag;
  return '🌐';
}

// Helper to get model display name from provider
function getModelDisplayName(provider: string): string {
  switch (provider?.toLowerCase()) {
    case 'berget':
      return 'KB Whisper';
    case 'groq':
      return 'Whisper v3';
    case 'openai':
      return 'OpenAI Whisper';
    default:
      return provider || 'Unknown';
  }
}

// Supported transcription models
const MODELS = [
  { id: 'berget:kb-whisper', name: 'KB Whisper', providerName: 'Berget AI', provider: 'berget', model: 'kb-whisper', flag: '🇸🇪' },
  { id: 'groq:whisper-large-v3', name: 'Whisper Large v3', providerName: 'Groq', provider: 'groq', model: 'whisper-large-v3', flag: '🇺🇸' },
  { id: 'groq:whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo', providerName: 'Groq', provider: 'groq', model: 'whisper-large-v3-turbo', flag: '🇺🇸' },
] as const;

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DashboardPage() {
  const [files, setFiles] = useState<FileType[]>([]);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [showPending, setShowPending] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const isFirstLoad = useRef(true);

  // Language selection modal state
  const [showLangModal, setShowLangModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileType | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedModel, setSelectedModel] = useState('berget:kb-whisper');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);

  // Edit title modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Transcription | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  // Translation languages per project (projectId -> array of language codes)
  const [projectTranslations, setProjectTranslations] = useState<Record<number, string[]>>({});

  const loadData = useCallback(async () => {
    try {
      // Only show loading spinner on first load, not during polling
      if (isFirstLoad.current) {
        setLoading(true);
      }
      setError(null);

      const [filesRes, transcriptionsRes] = await Promise.all([
        fetch('/api/files?limit=100'),
        fetch('/api/transcriptions?limit=100'),
      ]);

      // Handle unauthorized - redirect to login
      if (filesRes.status === 401 || transcriptionsRes.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (filesRes.ok) {
        const { data } = await filesRes.json();
        setFiles(data?.list || []);
      } else {
        await filesRes.json().catch(() => ({}));
        if (filesRes.status === 500) {
          setError('Database connection failed. Check your NocoDB configuration.');
        }
      }

      if (transcriptionsRes.ok) {
        const { data } = await transcriptionsRes.json();
        setTranscriptions(data?.list || []);
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
      isFirstLoad.current = false;
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll for processing transcriptions
  useEffect(() => {
    const processing = transcriptions.filter(t => t.Status === 'processing' || t.Status === 'pending');
    if (processing.length === 0) return;

    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [transcriptions, loadData]);

  // Load translations for completed projects
  useEffect(() => {
    const completedProjects = transcriptions.filter(t => t.Status === 'completed');
    if (completedProjects.length === 0) return;

    const loadTranslations = async () => {
      const translationMap: Record<number, string[]> = {};

      await Promise.all(
        completedProjects.map(async (project) => {
          try {
            const res = await fetch(`/api/translate/${project.Id}`);
            if (res.ok) {
              const { data } = await res.json();
              // Use availableLanguages array from the API response
              if (data?.availableLanguages && data.availableLanguages.length > 0) {
                translationMap[project.Id] = data.availableLanguages.map((t: { language: string }) => t.language);
              }
            }
          } catch {
            // Ignore errors for individual projects
          }
        })
      );

      setProjectTranslations(translationMap);
    };

    loadTranslations();
  }, [transcriptions]);

  // Get files that have transcriptions (projects)
  const fileIdsWithTranscriptions = new Set(transcriptions.map(t => t.FileId));

  // Projects = completed transcriptions
  const projects = transcriptions.filter(t => t.Status === 'completed');

  // Pending = files without transcriptions OR transcriptions still processing
  const pendingFiles = files.filter(f => !fileIdsWithTranscriptions.has(f.Id));
  const processingTranscriptions = transcriptions.filter(t => t.Status === 'processing' || t.Status === 'pending');
  const hasPending = pendingFiles.length > 0 || processingTranscriptions.length > 0;

  const handleUploadComplete = async () => {
    await loadData();
    // Auto-expand pending section when new file uploaded
    setShowPending(true);
  };

  // Open language selection modal
  const openTranscribeModal = (file: FileType) => {
    setSelectedFile(file);
    setSelectedLanguage('');
    setSelectedModel('berget:kb-whisper');
    setShowLangModal(true);
  };

  // Close modal
  const closeTranscribeModal = () => {
    setShowLangModal(false);
    setSelectedFile(null);
    setModelDropdownOpen(false);
    setLanguageDropdownOpen(false);
  };

  // Start transcription with selected language and model
  const handleTranscribe = async () => {
    if (!selectedFile) return;

    const file = selectedFile;
    const modelConfig = MODELS.find(m => m.id === selectedModel) || MODELS[0];
    closeTranscribeModal();

    setProcessingIds(prev => new Set(prev).add(file.Id));
    try {
      const res = await fetch('/api/transcriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: file.Id,
          sourceFileUrl: file.AudioUrl || file.StorageUrl,
          title: file.Filename,
          userId: '1',
          provider: modelConfig.provider,
          model: modelConfig.model,
          language: selectedLanguage || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to start transcription');
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(file.Id);
        return next;
      });
    }
  };

  const handleDeleteFile = async (id: number) => {
    if (!confirm('Delete this file?')) return;
    try {
      const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
      const result = await res.json();

      if (!res.ok || !result.success) {
        console.error('Delete file failed:', result);
        alert(`Failed to delete: ${result.error || 'Unknown error'}`);
        return;
      }

      // Optimistically remove from state immediately
      setFiles(prev => prev.filter(f => f.Id !== id));
    } catch (err) {
      console.error('Delete file error:', err);
      alert('Failed to delete file. Please try again.');
    }
  };

  const handleDeleteTranscription = async (id: number) => {
    if (!confirm('Delete this project?')) return;

    setDeletingIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/transcriptions/${id}`, { method: 'DELETE' });
      const result = await res.json();

      if (!res.ok || !result.success) {
        console.error('Delete failed:', result);
        alert(`Failed to delete: ${result.error || 'Unknown error'}`);
        return;
      }

      // Optimistically remove from state immediately
      setTranscriptions(prev => prev.filter(t => t.Id !== id));
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete project. Please try again.');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Open edit title modal
  const openEditModal = (project: Transcription) => {
    setEditingProject(project);
    // Remove file extension from title for editing
    setEditTitle(project.Title?.replace(/\.[^/.]+$/, '') || '');
    setShowEditModal(true);
  };

  // Close edit modal
  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingProject(null);
    setEditTitle('');
  };

  // Save title
  const handleSaveTitle = async () => {
    if (!editingProject || !editTitle.trim()) return;

    setSavingTitle(true);
    try {
      const res = await fetch(`/api/transcriptions/${editingProject.Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Title: editTitle.trim() }),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || 'Failed to update title');
      }

      // Update local state
      setTranscriptions(prev =>
        prev.map(t =>
          t.Id === editingProject.Id ? { ...t, Title: editTitle.trim() } : t
        )
      );
      closeEditModal();
    } catch (err) {
      console.error('Save title error:', err);
      alert(err instanceof Error ? err.message : 'Failed to save title');
    } finally {
      setSavingTitle(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white overflow-hidden">
      {/* Subtle grain texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.015] z-50"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Main Layout */}
      <div className="flex min-h-screen">
        {/* LEFT PANEL - Upload Staging Area */}
        <aside className="w-[420px] shrink-0 border-r border-white/[0.06] bg-[#0d0d0e] flex flex-col">
          {/* Logo - fixed height to match right header */}
          <div className="h-[72px] px-6 flex items-center border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'system-ui' }}>
                  SubzCreator
                </h1>
                <p className="text-[11px] text-white/40 tracking-wide uppercase">Studio</p>
              </div>
            </div>
          </div>

          {/* Upload Section */}
          <div className="p-5 flex flex-col">
            <div className="mb-4">
              <h2 className="text-sm font-medium text-white/70 mb-1">Upload Media</h2>
              <p className="text-xs text-white/40">Drop video or audio files to begin</p>
            </div>

            <FileUploader
              onUploadComplete={handleUploadComplete}
              maxFiles={10}
              maxSizeMB={1024}
            />
          </div>

          {/* Quick Stats - Separate section */}
          <div className="mt-auto p-5 pt-0">
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.03] rounded-lg">
                <span className="text-white/90 font-medium">{projects.length}</span>
                <span className="text-white/40">Projects</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.03] rounded-lg">
                <span className="text-amber-400 font-medium">{hasPending ? pendingFiles.length + processingTranscriptions.length : 0}</span>
                <span className="text-white/40">Pending</span>
              </div>
            </div>
          </div>

          {/* Version */}
          <div className="p-4 border-t border-white/[0.06]">
            <p className="text-[10px] text-white/20 text-center">v1.0.0</p>
          </div>
        </aside>

        {/* RIGHT PANEL - Projects */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-[72px] shrink-0 px-8 flex items-center border-b border-white/[0.06] bg-[#0a0a0b]/80 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center justify-between w-full">
              <div>
                <h2 className="text-xl font-semibold text-white/90">
                  Your Projects
                </h2>
                <p className="text-sm text-white/40 mt-0.5">
                  {projects.length === 0 ? 'Upload a file to create your first project' : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {hasPending && (
                  <button
                    onClick={() => setShowPending(!showPending)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      showPending
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-white/[0.05] text-white/60 border border-white/[0.08] hover:bg-white/[0.08]'
                    }`}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                    </span>
                    {pendingFiles.length + processingTranscriptions.length} Pending
                    <svg
                      className={`w-3.5 h-3.5 transition-transform ${showPending ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
                <UserMenu />
              </div>
            </div>
          </header>

          {/* Error Banner */}
          {error && (
            <div className="mx-8 mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-red-400">{error}</p>
                  <p className="text-xs text-red-400/60 mt-1">Check your .env configuration</p>
                </div>
              </div>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            {/* Pending Section (Collapsible) */}
            {showPending && hasPending && (
              <div className="px-8 py-5 bg-amber-500/[0.03] border-b border-amber-500/10 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-3">
                  {/* Files waiting for transcription */}
                  {pendingFiles.map((file, index) => (
                    <div
                      key={file.Id}
                      className="flex items-center gap-4 p-3 bg-[#0d0d0e] rounded-xl border border-white/[0.06] group"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        file.FileType === 'audio' ? 'bg-violet-500/20' : 'bg-amber-500/20'
                      }`}>
                        {file.FileType === 'audio' ? (
                          <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white/80 truncate">{file.Filename}</p>
                        <p className="text-xs text-white/40">
                          {file.Duration > 0 && formatDuration(file.Duration)}
                          {file.Duration > 0 && ' • '}
                          Ready to transcribe
                        </p>
                      </div>
                      <button
                        onClick={() => openTranscribeModal(file)}
                        disabled={processingIds.has(file.Id)}
                        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-xs font-semibold rounded-lg hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20"
                      >
                        {processingIds.has(file.Id) ? 'Starting...' : 'Transcribe'}
                      </button>
                      <button
                        onClick={() => handleDeleteFile(file.Id)}
                        className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {/* Processing transcriptions */}
                  {processingTranscriptions.map((t, index) => (
                    <div
                      key={t.Id}
                      className="flex items-center gap-4 p-3 bg-[#0d0d0e] rounded-xl border border-amber-500/20"
                      style={{ animationDelay: `${(pendingFiles.length + index) * 50}ms` }}
                    >
                      <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white/80 truncate">{t.Title}</p>
                        <p className="text-xs text-amber-400">Processing transcription...</p>
                      </div>
                      <div className="px-3 py-1 bg-amber-500/10 rounded-full">
                        <p className="text-[10px] text-amber-400 uppercase tracking-wider font-medium">
                          {t.Status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Projects Grid */}
            <div className="p-8">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-10 h-10 border-2 border-white/10 border-t-amber-400 rounded-full animate-spin" />
                  <p className="mt-4 text-sm text-white/40">Loading projects...</p>
                </div>
              ) : projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white/60 mb-2">
                    No projects yet
                  </h3>
                  <p className="text-sm text-white/30 max-w-xs">
                    Upload a video or audio file on the left, then transcribe it to create your first project.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {projects.map((project, index) => {
                    const file = files.find(f => f.Id === project.FileId);
                    return (
                      <Link
                        key={project.Id}
                        href={`/transcription/${project.Id}`}
                        className={`group relative bg-[#111113] rounded-2xl border border-white/[0.06] overflow-hidden hover:border-white/[0.12] hover:bg-[#131315] transition-all duration-300 ${
                          !initialLoadDone ? 'animate-fadeSlideIn' : ''
                        }`}
                        style={!initialLoadDone ? {
                          animationDelay: `${index * 50}ms`,
                        } : undefined}
                      >
                        {/* Thumbnail/Preview Area */}
                        <div className="relative h-36 bg-gradient-to-br from-white/[0.02] to-transparent overflow-hidden">
                          {/* Thumbnail image (if available) */}
                          {file?.ThumbnailUrl ? (
                            <img
                              src={file.ThumbnailUrl}
                              alt={project.Title || 'Video thumbnail'}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            /* Decorative waveform fallback */
                            <div className="absolute inset-0 flex items-center justify-center opacity-20">
                              <svg className="w-full h-12" viewBox="0 0 200 40" preserveAspectRatio="none">
                                <path
                                  d="M0,20 Q10,5 20,20 T40,20 T60,20 T80,20 T100,20 T120,20 T140,20 T160,20 T180,20 T200,20"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  className={file?.FileType === 'audio' ? 'text-violet-400' : 'text-amber-400'}
                                />
                              </svg>
                            </div>
                          )}

                          {/* Gradient overlay for readability */}
                          <div className="absolute inset-0 bg-gradient-to-t from-[#111113] via-[#111113]/20 to-transparent" />

                          {/* Content type indicator with language flags */}
                          <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
                            <div className="px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider shadow-lg bg-amber-500 text-black">
                              Subtitle
                            </div>
                            {/* Language flags row - original + translations */}
                            <div className="flex items-center gap-1">
                              {/* Original language flag */}
                              {project.Language && (
                                <span className="text-lg drop-shadow-lg" title={`Original: ${getLanguageName(project.Language)}`}>
                                  {getLanguageFlag(project.Language)}
                                </span>
                              )}
                              {/* Translation flags */}
                              {projectTranslations[project.Id]?.map((lang) => (
                                <span key={lang} className="text-lg drop-shadow-lg" title={`Translation: ${getLanguageName(lang)}`}>
                                  {getLanguageFlag(lang)}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Duration badge */}
                          {project.Duration > 0 && (
                            <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-[11px] text-white/80 font-mono">
                              {formatDuration(project.Duration)}
                            </div>
                          )}

                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="px-4 py-1.5 bg-white text-black text-xs font-semibold rounded-full transform scale-90 group-hover:scale-100 transition-transform">
                              Open Project
                            </span>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-4">
                          <h3 className="font-medium text-white/90 truncate group-hover:text-white transition-colors">
                            {project.Title?.replace(/\.[^/.]+$/, '') || 'Untitled'}
                          </h3>

                          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-2 text-xs text-white/60">
                            {project.Language && (
                              <span className="uppercase">{getLanguageName(project.Language)}</span>
                            )}
                            {project.AsrProvider && (
                              <>
                                <span className="text-white/30">•</span>
                                <span>{getModelDisplayName(project.AsrProvider)}</span>
                              </>
                            )}
                            {project.Confidence > 0 && (
                              <>
                                <span className="text-white/30">•</span>
                                <span>{(project.Confidence * 100).toFixed(0)}%</span>
                              </>
                            )}
                            <span className="text-white/30">•</span>
                            <span>{formatRelativeTime(project.CreatedAt)}</span>
                          </div>

                          {/* Preview text */}
                          {project.TranscriptText && (
                            <p className="mt-3 text-xs text-white/50 line-clamp-2 leading-relaxed">
                              {project.TranscriptText}
                            </p>
                          )}
                        </div>

                        {/* Action buttons (appear on hover) */}
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Edit button */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openEditModal(project);
                            }}
                            className="p-1.5 rounded-lg bg-black/70 text-white/70 hover:bg-white/20 hover:text-white transition-all shadow-lg"
                            title="Edit title"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>

                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteTranscription(project.Id);
                            }}
                            disabled={deletingIds.has(project.Id)}
                            className={`p-1.5 rounded-lg transition-all shadow-lg ${
                              deletingIds.has(project.Id)
                                ? 'bg-red-500 text-white'
                                : 'bg-black/70 text-white/70 hover:bg-red-500 hover:text-white'
                            }`}
                            title="Delete project"
                          >
                            {deletingIds.has(project.Id) ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Language Selection Modal */}
      {showLangModal && selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={closeTranscribeModal}
          />

          {/* Modal */}
          <div className="relative bg-[#151517] rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-visible border border-white/[0.08] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/[0.06]">
              <h3 className="text-lg font-semibold text-white">
                Start Transcription
              </h3>
              <p className="text-sm text-white/40 mt-1 truncate">{selectedFile.Filename}</p>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-5">
              {/* Model Selection - Custom Dropdown */}
              <div className="relative">
                <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                  Model
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setModelDropdownOpen(!modelDropdownOpen);
                    setLanguageDropdownOpen(false);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white text-left flex items-center justify-between hover:bg-white/[0.05] transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-lg">{MODELS.find(m => m.id === selectedModel)?.flag}</span>
                    <span>
                      <span className="font-medium">{MODELS.find(m => m.id === selectedModel)?.name}</span>
                      <span className="text-white/40 ml-2">— {MODELS.find(m => m.id === selectedModel)?.providerName}</span>
                    </span>
                  </span>
                  <svg className={`w-5 h-5 text-white/40 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {modelDropdownOpen && (
                  <div className="absolute z-50 w-full mt-2 py-2 bg-[#1a1a1c] border border-white/[0.08] rounded-xl shadow-xl max-h-64 overflow-y-auto">
                    {MODELS.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          setSelectedModel(model.id);
                          setModelDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/[0.05] transition-colors ${
                          selectedModel === model.id ? 'bg-amber-500/10 text-amber-400' : 'text-white'
                        }`}
                      >
                        <span className="text-lg">{model.flag}</span>
                        <span className="flex-1">
                          <span className="font-medium">{model.name}</span>
                          <span className={`ml-2 ${selectedModel === model.id ? 'text-amber-400/60' : 'text-white/40'}`}>— {model.providerName}</span>
                        </span>
                        {selectedModel === model.id && (
                          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Language Selection - Custom Dropdown */}
              <div className="relative">
                <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                  Language
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setLanguageDropdownOpen(!languageDropdownOpen);
                    setModelDropdownOpen(false);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white text-left flex items-center justify-between hover:bg-white/[0.05] transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-lg">{LANGUAGES.find(l => l.code === selectedLanguage)?.flag}</span>
                    <span className="font-medium">{LANGUAGES.find(l => l.code === selectedLanguage)?.name}</span>
                  </span>
                  <svg className={`w-5 h-5 text-white/40 transition-transform ${languageDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {languageDropdownOpen && (
                  <div className="absolute z-50 w-full mt-2 py-2 bg-[#1a1a1c] border border-white/[0.08] rounded-xl shadow-xl max-h-64 overflow-y-auto">
                    {LANGUAGES.map((lang, index) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          setSelectedLanguage(lang.code);
                          setLanguageDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-white/[0.05] transition-colors ${
                          selectedLanguage === lang.code ? 'bg-amber-500/10 text-amber-400' : 'text-white'
                        } ${index === 2 ? 'border-b border-white/[0.06] mb-1 pb-3' : ''}`}
                      >
                        <span className="text-lg">{lang.flag}</span>
                        <span className="flex-1 font-medium">{lang.name}</span>
                        {selectedLanguage === lang.code && (
                          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-white/30 mt-2">
                  Specifying the language improves accuracy and speed
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-end gap-3">
              <button
                onClick={closeTranscribeModal}
                className="px-4 py-2 text-sm font-medium text-white/50 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTranscribe}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black rounded-xl text-sm font-semibold hover:from-amber-400 hover:to-orange-400 transition-all shadow-lg shadow-amber-500/20"
              >
                Start Transcription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Title Modal */}
      {showEditModal && editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={closeEditModal}
          />

          {/* Modal */}
          <div className="relative bg-[#151517] rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden border border-white/[0.08] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/[0.06]">
              <h3 className="text-lg font-semibold text-white">
                Edit Project Title
              </h3>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !savingTitle) {
                    handleSaveTitle();
                  }
                }}
                placeholder="Enter project title"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
              />
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-end gap-3">
              <button
                onClick={closeEditModal}
                disabled={savingTitle}
                className="px-4 py-2 text-sm font-medium text-white/50 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTitle}
                disabled={savingTitle || !editTitle.trim()}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black rounded-xl text-sm font-semibold hover:from-amber-400 hover:to-orange-400 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {savingTitle ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animation */}
      <style jsx>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        :global(.animate-fadeSlideIn) {
          animation: fadeSlideIn 0.4s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
