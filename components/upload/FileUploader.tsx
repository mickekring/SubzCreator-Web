'use client';

/**
 * File Uploader Component
 * Studio Dark Design - Drag-and-drop upload with FFmpeg processing status
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils/cn';

export interface UploadedFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  statusText?: string;
  error?: string;
  fileId?: number;
  publicUrl?: string;
}

interface FileUploaderProps {
  onUploadComplete?: (files: UploadedFile[]) => void;
  onUploadStart?: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  acceptedTypes?: string[];
  className?: string;
}

const ACCEPTED_AUDIO = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/aiff', 'audio/ogg', 'audio/flac'];
const ACCEPTED_VIDEO = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
const DEFAULT_ACCEPTED = [...ACCEPTED_AUDIO, ...ACCEPTED_VIDEO];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function FileUploader({
  onUploadComplete,
  onUploadStart,
  maxFiles = 10,
  maxSizeMB = 5120, // 5GB max for video files
  acceptedTypes = DEFAULT_ACCEPTED,
  className,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const pollingRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const uploadsRef = useRef<UploadedFile[]>([]);

  useEffect(() => {
    uploadsRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    return () => {
      pollingRef.current.forEach((timer) => clearInterval(timer));
    };
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    },
    [maxFiles, maxSizeMB, acceptedTypes]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      handleFiles(files);
      e.target.value = '';
    },
    [maxFiles, maxSizeMB, acceptedTypes]
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length > maxFiles) return;

      const validFiles: File[] = [];
      const maxSizeBytes = maxSizeMB * 1024 * 1024;

      for (const file of files) {
        if (!acceptedTypes.includes(file.type)) continue;
        if (file.size > maxSizeBytes) continue;
        validFiles.push(file);
      }

      if (validFiles.length === 0) return;

      onUploadStart?.(validFiles);

      const startIndex = uploadedFiles.length;
      const newUploads: UploadedFile[] = validFiles.map((file) => ({
        file,
        progress: 0,
        status: 'pending',
        statusText: 'Waiting...',
      }));

      setUploadedFiles((prev) => [...prev, ...newUploads]);

      // Upload all files in parallel so each shows its own progress
      await Promise.all(
        validFiles.map(async (file, i) => {
          const uploadIndex = startIndex + i;
          try {
            await uploadFile(file, uploadIndex);
          } catch (error) {
            console.error('Upload error:', error);
            updateFileStatus(uploadIndex, {
              status: 'error',
              error: error instanceof Error ? error.message : 'Upload failed',
            });
          }
        })
      );
    },
    [maxFiles, maxSizeMB, acceptedTypes, uploadedFiles.length, onUploadStart]
  );

  const uploadFile = async (file: File, index: number) => {
    updateFileStatus(index, { status: 'uploading', progress: 5, statusText: 'Uploading...' });

    const formData = new FormData();
    formData.append('file', file);

    const uploadResponse = await fetch('/api/upload/process', {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      throw new Error(errorData.error || 'Failed to upload file');
    }

    const { data } = await uploadResponse.json();
    const fileId = data.fileId;

    updateFileStatus(index, {
      status: 'processing',
      progress: 15,
      statusText: 'Processing video...',
      fileId,
    });

    startPolling(fileId, index);
  };

  const startPolling = (fileId: number, index: number) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/files/${fileId}/status`);
        if (!response.ok) return;

        const { data } = await response.json();

        if (data.status === 'ready') {
          clearInterval(pollInterval);
          pollingRef.current.delete(fileId);

          const currentFile = uploadsRef.current[index];

          updateFileStatus(index, {
            status: 'completed',
            progress: 100,
            statusText: 'Ready',
            publicUrl: data.storageUrl,
          });

          if (currentFile && onUploadComplete) {
            setTimeout(() => {
              onUploadComplete([{
                ...currentFile,
                status: 'completed',
                progress: 100,
                publicUrl: data.storageUrl
              }]);
            }, 0);
          }
        } else if (data.status === 'error') {
          clearInterval(pollInterval);
          pollingRef.current.delete(fileId);

          updateFileStatus(index, {
            status: 'error',
            error: data.error || 'Processing failed',
          });
        } else {
          const progress = data.progress || 15;
          let statusText = 'Processing...';

          if (progress < 30) statusText = 'Uploading original...';
          else if (progress < 60) statusText = 'Converting video...';
          else if (progress < 80) statusText = 'Extracting audio...';
          else statusText = 'Finalizing...';

          updateFileStatus(index, {
            progress,
            statusText,
          });
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);

    pollingRef.current.set(fileId, pollInterval);
  };

  const updateFileStatus = (index: number, updates: Partial<UploadedFile>) => {
    setUploadedFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const removeFile = (index: number) => {
    const file = uploadedFiles[index];
    if (file?.fileId) {
      const timer = pollingRef.current.get(file.fileId);
      if (timer) {
        clearInterval(timer);
        pollingRef.current.delete(file.fileId);
      }
    }
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCompleted = () => {
    setUploadedFiles((prev) => prev.filter((f) => f.status !== 'completed'));
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'relative rounded-2xl border-2 border-dashed transition-all bg-surface',
          isDragging
            ? 'border-accent bg-accent-subtle scale-[1.01]'
            : 'border-border-default hover:border-border-strong hover:bg-elevated'
        )}
      >
        <input
          type="file"
          id="file-upload"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={handleFileSelect}
          className="sr-only"
        />

        <label
          htmlFor="file-upload"
          className="flex flex-col items-center justify-center px-8 py-12 cursor-pointer"
        >
          <div className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors',
            isDragging ? 'bg-accent' : 'bg-overlay'
          )}>
            <svg
              className={cn('w-7 h-7 transition-colors', isDragging ? 'text-black' : 'text-text-muted')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>

          <p className={cn(
            'text-base font-medium mb-1 transition-colors',
            isDragging ? 'text-accent' : 'text-text-secondary'
          )}>
            {isDragging ? 'Drop files here' : 'Drop files or click to upload'}
          </p>
          <p className="text-sm text-text-muted">
            MP3, WAV, M4A, MP4, MOV up to {maxSizeMB >= 1024 ? `${maxSizeMB / 1024}GB` : `${maxSizeMB}MB`}
          </p>
        </label>
      </div>

      {/* Upload Progress */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-text-secondary">
              Uploads ({uploadedFiles.filter(f => f.status === 'completed').length}/{uploadedFiles.length})
            </span>
            {uploadedFiles.some(f => f.status === 'completed') && (
              <button
                onClick={clearCompleted}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Clear completed
              </button>
            )}
          </div>

          <div className="space-y-2">
            {uploadedFiles.map((upload, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-border-subtle"
              >
                {/* File type icon */}
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                  upload.file.type.startsWith('audio') ? 'bg-secondary-subtle' : 'bg-accent-subtle'
                )}>
                  {upload.status === 'processing' ? (
                    <svg className="w-5 h-5 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : upload.file.type.startsWith('audio') ? (
                    <svg className="w-5 h-5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary truncate max-w-[140px]" title={upload.file.name}>
                      {upload.file.name}
                    </p>
                    <span className="text-xs text-text-muted shrink-0">
                      {formatBytes(upload.file.size)}
                    </span>
                  </div>

                  {(upload.status === 'uploading' || upload.status === 'processing') && (
                    <div className="mt-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-overlay rounded-full h-1.5 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              upload.status === 'processing' ? 'bg-warning' : 'bg-accent'
                            )}
                            style={{ width: `${upload.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-text-muted w-8">{upload.progress}%</span>
                      </div>
                      {upload.statusText && (
                        <p className="text-xs text-text-muted mt-1">{upload.statusText}</p>
                      )}
                    </div>
                  )}

                  {upload.status === 'completed' && (
                    <p className="text-xs text-success mt-1 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Ready for transcription
                    </p>
                  )}

                  {upload.status === 'error' && (
                    <p className="text-xs text-error mt-1 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {upload.error || 'Upload failed'}
                    </p>
                  )}
                </div>

                {/* Remove button */}
                <button
                  onClick={() => removeFile(index)}
                  className="p-1.5 text-text-muted hover:text-error hover:bg-error-subtle rounded-lg transition-colors"
                  aria-label="Remove file"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
