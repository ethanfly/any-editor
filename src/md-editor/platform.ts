/**
 * Tauri bridge that satisfies horseMD editor modules expecting `window.api`.
 * Desktop Electron APIs are mapped to Tauri plugins / no-ops where needed.
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { open as openUrl } from '@tauri-apps/plugin-shell';

export type PlatformApi = {
  platform: string;
  capabilities?: Record<string, boolean>;
  openExternal?: (url: string) => Promise<void> | void;
  openFileUrl?: (url: string) => Promise<void> | void;
  copyText?: (text: string) => Promise<boolean>;
  saveImage?: (
    docPath: string,
    name: string,
    bytes: Uint8Array
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
  savePaste?: (
    name: string,
    bytes: Uint8Array
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;
  uploadImage?: (
    cmd: string,
    name: string,
    bytes: Uint8Array
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;
};

declare global {
  interface Window {
    api?: PlatformApi;
  }
}

function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('linux')) return 'linux';
  return 'win32';
}

/** Install a minimal window.api if missing. Safe to call multiple times. */
export function ensureMdEditorPlatform(options?: {
  saveImage?: PlatformApi['saveImage'];
}): PlatformApi {
  const existing = window.api;
  if (existing?.platform && existing.openExternal) {
    if (options?.saveImage) existing.saveImage = options.saveImage;
    return existing;
  }

  const api: PlatformApi = {
    platform: detectPlatform(),
    capabilities: {
      folderWorkspace: true,
      watch: true,
      windowControls: true,
      pdfExport: false,
      imageHostExec: false,
      nativeMenus: false,
      externalShell: true,
      revealInFolder: true,
      splitView: true,
    },
    async openExternal(url: string) {
      try {
        await openUrl(url);
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    async openFileUrl(url: string) {
      // Prefer opening via shell; file:// may not be allowed — best effort.
      try {
        await openUrl(url);
      } catch {
        /* ignore */
      }
    },
    async copyText(text: string) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
    saveImage: options?.saveImage,
  };

  window.api = api;
  return api;
}

/** Convert absolute filesystem path → webview display URL (Tauri asset protocol). */
export function toAssetUrl(absPath: string): string {
  try {
    return convertFileSrc(absPath);
  } catch {
    return absPath;
  }
}
