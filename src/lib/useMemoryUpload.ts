/**
 * useMemoryUpload — Frontend-Hook für Direct-Upload zu IDrive E2.
 *
 * Flow:
 *   1. Frontend ruft POST /storage/upload-url auf, übergibt contentType+category
 *   2. Worker liefert Presigned PUT URL zurück
 *   3. Frontend macht PUT direkt an IDrive E2 (KEIN Proxying durch Worker → schnell)
 *   4. Bei Success: Worker-API erhält key + metadata, speichert in DB
 *
 * Vorteile:
 *  - Worker-Bandbreite wird nicht belastet (direkter App-Upload → IDrive)
 *  - Progress-Events nativ via XHR/Fetch + ReadableStream
 *  - Resumable Upload via tus.io kann später als Wrapper draufkommen
 */

import { useCallback, useState } from 'react';

export type MemoryCategory = 'audio' | 'image' | 'video' | 'document';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  key: string;
  getUrl: string;
  contentType: string;
  size: number;
}

interface UploadUrlResponse {
  uploadUrl: string;
  key: string;
  getUrl: string;
  expiresAt: number;
}

export function useMemoryUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, category: MemoryCategory): Promise<UploadResult | null> => {
      setUploading(true);
      setError(null);
      setProgress({ loaded: 0, total: file.size, percentage: 0 });

      try {
        // Schritt 1: Presigned URL holen
        const urlRes = await fetch('/storage/upload-url', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentType: file.type || 'application/octet-stream',
            filename: file.name,
            size: file.size,
            category,
          }),
        });

        if (!urlRes.ok) {
          const errBody = await urlRes.json().catch(() => ({ error: 'Unknown' }));
          throw new Error((errBody as { error?: string }).error || `Upload-URL failed (${urlRes.status})`);
        }

        const { uploadUrl, key, getUrl } = (await urlRes.json()) as UploadUrlResponse;

        // Schritt 2: Direct-Upload mit Progress-Tracking via XHR
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setProgress({ loaded: e.loaded, total: e.total, percentage: pct });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`PUT failed: ${xhr.status} ${xhr.statusText}`));
          };
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.onabort = () => reject(new Error('Upload aborted'));

          xhr.send(file);
        });

        setUploading(false);
        setProgress({ loaded: file.size, total: file.size, percentage: 100 });

        return {
          key,
          getUrl,
          contentType: file.type,
          size: file.size,
        };
      } catch (err) {
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
    setUploading(false);
    setProgress(null);
    setError(null);
  }, []);

  return { upload, uploading, progress, error, reset };
}
