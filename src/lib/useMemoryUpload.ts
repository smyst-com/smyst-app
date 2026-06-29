/**
 * useMemoryUpload — Frontend-Hook für Direct-Upload zu IDrive E2.
 *
 * Flow:
 *   1. Frontend ruft POST /storage/upload-url auf, übergibt contentType+category
 *   2. Worker liefert Presigned PUT URL zurück
 *   3. Frontend macht PUT direkt an IDrive E2 (KEIN Proxying durch Worker → schnell)
 *   4. Bei Success: Frontend ruft POST /storage/upload-complete auf
 *   5. API markiert kleine Upload-Metadaten als uploaded
 *
 * Vorteile:
 *  - Worker-Bandbreite wird nicht belastet (direkter App-Upload → IDrive)
 *  - Progress-Events nativ via XHR/Fetch + ReadableStream
 *  - Resumable Upload via tus.io kann später als Wrapper draufkommen
 */

import { useCallback, useRef, useState } from 'react';

export type MemoryCategory =
  | 'audio'
  | 'image'
  | 'video'
  | 'document'
  | 'profile_image'
  | 'backup'
  | 'twin_data'
  | 'static_asset'
  | 'app_build'
  | 'release_file'
  | 'audit_log'
  | 'error_report'
  | 'admin_export'
  | 'rag_document'
  | 'embedding_file'
  | 'search_index_backup'
  | 'prompt_file'
  | 'model_file'
  | 'training_data'
  | 'thumbnail'
  | 'subtitle'
  | 'translation_file'
  | 'legal_document'
  | 'qa_artifact'
  | 'maintenance_asset'
  | 'cache_file'
  | 'public_cdn_file'
  | 'private_signed_file';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  uploadId: string;
  key: string;
  getUrl: string;
  contentType: string;
  size: number;
}

const CLIENT_CATEGORY_LIMITS: Record<MemoryCategory, number> = {
  audio: 25 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  document: 20 * 1024 * 1024,
  profile_image: 2 * 1024 * 1024,
  backup: 25 * 1024 * 1024,
  twin_data: 10 * 1024 * 1024,
  static_asset: 10 * 1024 * 1024,
  app_build: 50 * 1024 * 1024,
  release_file: 50 * 1024 * 1024,
  audit_log: 10 * 1024 * 1024,
  error_report: 20 * 1024 * 1024,
  admin_export: 25 * 1024 * 1024,
  rag_document: 20 * 1024 * 1024,
  embedding_file: 50 * 1024 * 1024,
  search_index_backup: 50 * 1024 * 1024,
  prompt_file: 5 * 1024 * 1024,
  model_file: 50 * 1024 * 1024,
  training_data: 50 * 1024 * 1024,
  thumbnail: 2 * 1024 * 1024,
  subtitle: 2 * 1024 * 1024,
  translation_file: 5 * 1024 * 1024,
  legal_document: 10 * 1024 * 1024,
  qa_artifact: 50 * 1024 * 1024,
  maintenance_asset: 10 * 1024 * 1024,
  cache_file: 10 * 1024 * 1024,
  public_cdn_file: 20 * 1024 * 1024,
  private_signed_file: 50 * 1024 * 1024,
};

const CLIENT_ALLOWED_PREFIXES: Record<MemoryCategory, string[]> = {
  audio: ['audio/'],
  image: ['image/'],
  video: ['video/'],
  document: [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.',
  ],
  profile_image: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  backup: ['application/json', 'application/zip', 'application/gzip', 'application/x-tar', 'text/plain'],
  twin_data: ['application/json', 'text/plain', 'text/markdown'],
  static_asset: ['image/', 'text/css', 'text/html', 'application/javascript', 'text/javascript', 'application/json', 'application/wasm'],
  app_build: ['application/zip', 'application/gzip', 'application/x-tar', 'application/octet-stream', 'application/vnd.android.package-archive', 'application/x-apple-ios-app'],
  release_file: ['application/json', 'application/zip', 'application/gzip', 'application/x-tar', 'application/octet-stream', 'text/plain'],
  audit_log: ['application/json', 'text/plain', 'text/csv', 'application/gzip'],
  error_report: ['application/json', 'text/plain', 'text/markdown', 'application/zip'],
  admin_export: ['application/json', 'text/csv', 'application/zip', 'application/gzip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  rag_document: ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  embedding_file: ['application/json', 'application/octet-stream', 'application/gzip', 'application/zip'],
  search_index_backup: ['application/json', 'application/octet-stream', 'application/gzip', 'application/zip'],
  prompt_file: ['application/json', 'text/plain', 'text/markdown'],
  model_file: ['application/octet-stream', 'application/zip', 'application/gzip', 'application/x-tar', 'application/json'],
  training_data: ['application/json', 'text/plain', 'text/markdown', 'text/csv', 'application/zip', 'application/gzip'],
  thumbnail: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  subtitle: ['text/vtt', 'application/x-subrip', 'text/plain'],
  translation_file: ['application/json', 'text/plain', 'text/markdown', 'text/csv'],
  legal_document: ['application/pdf', 'text/plain', 'text/markdown', 'text/html', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  qa_artifact: ['image/', 'video/mp4', 'video/webm', 'application/pdf', 'application/json', 'text/plain', 'application/zip'],
  maintenance_asset: ['text/html', 'text/css', 'application/javascript', 'text/javascript', 'application/json', 'image/svg+xml', 'image/png', 'image/webp'],
  cache_file: ['application/json', 'text/plain', 'text/html', 'text/css', 'application/javascript', 'text/javascript'],
  public_cdn_file: ['image/', 'text/css', 'text/html', 'application/javascript', 'text/javascript', 'application/json', 'application/wasm', 'application/pdf'],
  private_signed_file: ['application/pdf', 'application/json', 'text/plain', 'text/markdown', 'text/csv', 'application/zip', 'application/gzip', 'image/', 'video/mp4', 'audio/mpeg'],
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'video/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  apk: 'application/vnd.android.package-archive',
  ipa: 'application/x-apple-ios-app',
  css: 'text/css',
  html: 'text/html',
  htm: 'text/html',
  js: 'application/javascript',
  wasm: 'application/wasm',
  vtt: 'text/vtt',
  srt: 'application/x-subrip',
  bin: 'application/octet-stream',
};

const DIRECT_PUT_ATTEMPTS = 2;

interface UploadUrlResponse {
  uploadId: string;
  uploadUrl: string;
  key: string;
  getUrl: string;
  expiresAt: number;
  contentType: string;
  maxBytes: number;
  category: MemoryCategory;
  supportsChunkUpload: false;
  supportsResume: false;
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const maybe = body as { error?: string | { code?: string; message?: string } };
    if (typeof maybe.error === 'string') return maybe.error;
    if (maybe.error?.code === 'storage_write_limited') {
      return 'Upload-Speichern ist gerade wegen eines temporären Speicherlimits pausiert. Bitte versuche es später erneut.';
    }
    if (maybe.error?.message) return maybe.error.message;
  }
  return fallback;
}

function isAllowedClientType(file: File, category: MemoryCategory): boolean {
  const type = inferContentType(file);
  return CLIENT_ALLOWED_PREFIXES[category].some((allowed) => type === allowed || type.startsWith(allowed));
}

function inferContentType(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return file.type || MIME_BY_EXTENSION[ext] || 'application/octet-stream';
}

export function useMemoryUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeXhr = useRef<XMLHttpRequest | null>(null);

  const upload = useCallback(
    async (file: File, category: MemoryCategory, opts: { twinId?: string } = {}): Promise<UploadResult | null> => {
      setUploading(true);
      setError(null);
      setProgress({ loaded: 0, total: file.size, percentage: 0 });

      try {
        if (file.size <= 0) throw new Error('Datei ist leer.');
        if (file.size > CLIENT_CATEGORY_LIMITS[category]) {
          throw new Error('Datei ist fuer diese Kategorie zu gross.');
        }
        if (!isAllowedClientType(file, category)) {
          throw new Error('Dateityp passt nicht zur gewählten Kategorie.');
        }

        // Schritt 1: Presigned URL holen
        const urlRes = await fetch('/storage/upload-url', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
          body: JSON.stringify({
            contentType: inferContentType(file),
            filename: file.name,
            size: file.size,
            category,
            twinId: opts.twinId,
          }),
        });

        if (!urlRes.ok) {
          const errBody = await urlRes.json().catch(() => ({ error: 'Unknown' }));
          throw new Error(errorMessage(errBody, `Upload-URL failed (${urlRes.status})`));
        }

        const { uploadId, uploadUrl, key, getUrl, contentType } = (await urlRes.json()) as UploadUrlResponse;

        // Schritt 2: Direct-Upload mit Progress-Tracking via XHR
        for (let attempt = 1; attempt <= DIRECT_PUT_ATTEMPTS; attempt += 1) {
          try {
            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              activeXhr.current = xhr;
              xhr.open('PUT', uploadUrl);
              xhr.timeout = 15 * 60 * 1000;
              xhr.setRequestHeader('Content-Type', contentType);

              xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                  const pct = Math.round((e.loaded / e.total) * 100);
                  setProgress({ loaded: e.loaded, total: e.total, percentage: pct });
                }
              };

              xhr.onload = () => {
                activeXhr.current = null;
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else reject(new Error(`PUT failed: ${xhr.status} ${xhr.statusText}`));
              };
              xhr.onerror = () => {
                activeXhr.current = null;
                reject(new Error('Network error during upload'));
              };
              xhr.ontimeout = () => {
                activeXhr.current = null;
                reject(new Error('Upload timed out'));
              };
              xhr.onabort = () => {
                activeXhr.current = null;
                reject(new Error('Upload aborted'));
              };

              xhr.send(file);
            });
            break;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message === 'Upload aborted' || attempt === DIRECT_PUT_ATTEMPTS) throw err;
            await new Promise((resolve) => window.setTimeout(resolve, 700 * attempt));
          }
        }

        const completeRes = await fetch('/storage/upload-complete', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Smyst-CSRF': '1' },
          body: JSON.stringify({ uploadId, key, size: file.size }),
        });
        if (!completeRes.ok) {
          const errBody = await completeRes.json().catch(() => ({ error: 'Unknown' }));
          throw new Error(errorMessage(errBody, `Upload complete failed (${completeRes.status})`));
        }

        setUploading(false);
        setProgress({ loaded: file.size, total: file.size, percentage: 100 });

        return {
          uploadId,
          key,
          getUrl,
          contentType,
          size: file.size,
        };
      } catch (err) {
        activeXhr.current = null;
        setUploading(false);
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        console.error('[memory-upload]', msg);
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    activeXhr.current?.abort();
    activeXhr.current = null;
    setUploading(false);
    setProgress(null);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    activeXhr.current?.abort();
    activeXhr.current = null;
    setUploading(false);
    setError('Upload abgebrochen.');
  }, []);

  return { upload, uploading, progress, error, reset, cancel };
}
