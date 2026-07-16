import { convertFileSrc } from '@tauri-apps/api/core';

/** Remote / special schemes that should not be rewritten. */
export function isExternalUrl(src: string): boolean {
  return /^(https?:|data:|blob:|asset:|tauri:|mailto:|tel:)/i.test(src.trim());
}

/** Absolute filesystem path (POSIX or Windows). */
export function isAbsolutePath(src: string): boolean {
  const s = src.trim();
  return /^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('\\\\') || s.startsWith('/');
}

/**
 * Resolve a relative media reference against the directory of `baseFile`.
 * Returns an absolute filesystem path when possible.
 */
export function resolveFileRef(baseFile: string, ref: string): string {
  const raw = ref.trim();
  if (!raw || isExternalUrl(raw) || isAbsolutePath(raw)) {
    return raw;
  }

  const useBackslash = baseFile.includes('\\');
  const sep = useBackslash ? '\\' : '/';
  const baseDir = baseFile.replace(/[\\/][^\\/]+$/, '');
  const stack = baseDir.split(/[\\/]/).filter((p, i) => p !== '' || i === 0);
  // Keep Windows drive segment (e.g. "C:") even if empty segments were filtered oddly
  if (/^[a-zA-Z]:$/.test(stack[0] ?? '') === false && /^[a-zA-Z]:/.test(baseDir)) {
    const drive = baseDir.slice(0, 2);
    if (!stack[0]?.startsWith(drive)) {
      stack.unshift(drive);
    }
  }

  for (const seg of raw.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    stack.push(seg);
  }

  // Windows: "C:" + "\foo" — join carefully
  if (/^[a-zA-Z]:$/.test(stack[0] ?? '')) {
    return `${stack[0]}${sep}${stack.slice(1).join(sep)}`;
  }
  return stack.join(sep);
}

/**
 * Convert a markdown/HTML image src into a webview-displayable URL.
 * Relative paths are resolved against the open file and converted via Tauri.
 * Original src is unchanged for serialization — caller should keep a data-original-src.
 */
export function toDisplaySrc(baseFile: string | undefined, src: string): string {
  const trimmed = src.trim();
  if (!trimmed || isExternalUrl(trimmed)) return trimmed;
  if (!baseFile) return trimmed;

  try {
    const abs = isAbsolutePath(trimmed) ? trimmed : resolveFileRef(baseFile, trimmed);
    return convertFileSrc(abs);
  } catch {
    return trimmed;
  }
}

/** Rewrite <img src> in an HTML string for display; keep original in data-original-src. */
export function rewriteHtmlImageSources(html: string, baseFile: string | undefined): string {
  if (!baseFile || !html.includes('<img')) return html;

  return html.replace(
    /<img\b([^>]*?)>/gi,
    (full, attrs: string) => {
      const srcMatch = attrs.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (!srcMatch) return full;
      const original = srcMatch[2] ?? srcMatch[3] ?? srcMatch[4] ?? '';
      if (!original || isExternalUrl(original)) return full;

      const display = toDisplaySrc(baseFile, original);
      if (display === original) return full;

      let nextAttrs = attrs;
      if (/\bdata-original-src\s*=/.test(nextAttrs)) {
        // already rewritten
        return full;
      }
      nextAttrs = nextAttrs.replace(
        /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
        `src="${display.replace(/"/g, '&quot;')}" data-original-src="${original.replace(/"/g, '&quot;')}"`
      );
      return `<img${nextAttrs}>`;
    }
  );
}
