import DOMPurify from 'dompurify';
import { invoke } from '@tauri-apps/api/core';
import { isAbsolutePath, isExternalUrl, resolveFileRef } from './mediaUrl';
import { MARKDOWN_PURIFY } from './markdownExtensions';
import { renderMarkdownDocument } from './markdownRender';

export type ExportKind = 'markdown' | 'html' | 'text';

export function detectExportKind(extension: string): ExportKind {
  const ext = (extension || '').toLowerCase();
  if (ext === 'md' || ext === 'markdown' || ext === 'mdown' || ext === 'mkd') return 'markdown';
  if (ext === 'html' || ext === 'htm') return 'html';
  return 'text';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mimeFromPath(path: string): string {
  const ext = path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    avif: 'image/avif',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  };
  return map[ext] || 'application/octet-stream';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Extract img src values from an HTML fragment. */
function collectImageSrcs(html: string): string[] {
  const srcs: string[] = [];
  const re = /<img\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const src = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (src) srcs.push(src);
  }
  return srcs;
}

/**
 * Rewrite local / relative image sources to data: URIs so print/export
 * works without relying on Tauri asset protocol inside an iframe.
 */
export async function embedLocalImages(
  html: string,
  baseFile?: string
): Promise<string> {
  if (!html.includes('<img')) return html;

  const srcs = [...new Set(collectImageSrcs(html))];
  if (srcs.length === 0) return html;

  const replacements = new Map<string, string>();

  await Promise.all(
    srcs.map(async (src) => {
      if (src.startsWith('data:')) return;
      // Keep remote http(s) as-is (browser may load them)
      if (/^https?:/i.test(src)) return;
      // blob / mailto etc. — leave alone
      if (/^(blob:|mailto:|tel:)/i.test(src)) return;

      // asset:/tauri: or absolute/relative filesystem paths → embed
      let fsPath = src;
      // Strip convertFileSrc-style asset URLs are hard to reverse; prefer original path forms
      if (/^(asset:|https?:\/\/asset\.localhost|https?:\/\/tauri\.localhost)/i.test(src)) {
        // Cannot reliably reverse; skip
        return;
      }

      if (!isExternalUrl(fsPath)) {
        if (!isAbsolutePath(fsPath)) {
          if (!baseFile) return;
          fsPath = resolveFileRef(baseFile, fsPath);
        }
      } else {
        return;
      }

      try {
        const bytes = await invoke<number[]>('read_file_bytes', { path: fsPath });
        // Cap embed size ~8MB per image to avoid huge print docs
        if (bytes.length > 8 * 1024 * 1024) return;
        const mime = mimeFromPath(fsPath);
        const dataUri = `data:${mime};base64,${bytesToBase64(new Uint8Array(bytes))}`;
        replacements.set(src, dataUri);
      } catch {
        // Missing image: leave original src (will show broken icon)
      }
    })
  );

  if (replacements.size === 0) return html;

  return html.replace(
    /<img\b([^>]*?)>/gi,
    (full, attrs: string) => {
      const srcMatch = attrs.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (!srcMatch) return full;
      const original = (srcMatch[2] ?? srcMatch[3] ?? srcMatch[4] ?? '').trim();
      const next = replacements.get(original);
      if (!next) return full;
      const nextAttrs = attrs.replace(
        /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
        `src="${next.replace(/"/g, '&quot;')}"`
      );
      return `<img${nextAttrs}>`;
    }
  );
}

const SANITIZE_OPTS = {
  ADD_TAGS: [...MARKDOWN_PURIFY.ADD_TAGS],
  ADD_ATTR: [...MARKDOWN_PURIFY.ADD_ATTR, 'colspan', 'rowspan'],
};

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_OPTS) as unknown as string;
}

function wrapHtmlDocument(title: string, body: string, kind: ExportKind): string {
  const plainStyles =
    kind === 'text'
      ? `
    pre.export-plain {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font: 13px/1.55 Consolas, "Cascadia Mono", "Courier New", monospace;
      color: #20242a;
      background: #f6f8fa;
      padding: 20px 18px;
      border-radius: 10px;
      border: 1px solid #e9edf1;
    }`
      : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0 auto;
      max-width: 860px;
      padding: 40px 24px 80px;
      font: 16px/1.75 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #20242a;
      background: #fff;
    }
    h1,h2,h3 { line-height: 1.3; }
    pre { background: #f6f8fa; padding: 12px 14px; border-radius: 10px; overflow: auto; }
    code { font-family: Consolas, "Cascadia Mono", monospace; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #dce3e8; padding: 8px 10px; }
    th { background: #f2f5f4; }
    img { max-width: 100%; height: auto; }
    blockquote { border-left: 4px solid #f1953f; margin: 0; padding: 4px 12px; color: #5e6673; }
    ${plainStyles}
    @media print {
      body { max-width: none; padding: 12mm; }
      pre.export-plain { border: none; background: transparent; padding: 0; }
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Build a printable/exportable HTML document from editor content.
 * - markdown → rendered HTML (+ local images embedded as data URIs)
 * - html/htm → sanitized HTML body
 * - other text → escaped plain text in <pre> (avoids blank pages from angle-bracket tags)
 */
export async function contentToHtmlDocument(
  title: string,
  content: string,
  options: { extension: string; filePath?: string } = { extension: '' }
): Promise<string> {
  const kind = detectExportKind(options.extension);
  let bodyHtml: string;

  if (kind === 'markdown') {
    const raw = await renderMarkdownDocument(content, { filePath: options.filePath });
    bodyHtml = await embedLocalImages(raw, options.filePath);
  } else if (kind === 'html') {
    bodyHtml = await embedLocalImages(sanitizeHtml(content), options.filePath);
  } else {
    // Plain / code: never run through markdown parser (would strip <stdio.h> etc.)
    bodyHtml = `<pre class="export-plain">${escapeHtml(content)}</pre>`;
  }

  return wrapHtmlDocument(title, bodyHtml, kind);
}

/** @deprecated Prefer contentToHtmlDocument — kept for callers that only need sync md without images. */
export async function markdownToHtmlDocument(title: string, markdown: string): Promise<string> {
  const body = await renderMarkdownDocument(markdown);
  return wrapHtmlDocument(title, body, 'markdown');
}

function waitForImages(doc: Document, timeoutMs = 8000): Promise<void> {
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let remaining = images.length;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    const onOne = () => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearTimeout(timer);
        finish();
      }
    };
    for (const img of images) {
      if (img.complete) {
        onOne();
      } else {
        img.addEventListener('load', onOne, { once: true });
        img.addEventListener('error', onOne, { once: true });
      }
    }
  });
}

/**
 * Open the system print dialog for an HTML document.
 * Uses a hidden iframe instead of window.open — avoids popup blockers and
 * Tauri/WebView2 returning null when `noopener` is set on window.open.
 */
export function printHtmlDocument(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'print-frame');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none;';

    let settled = false;
    const cleanup = () => {
      if (iframe.parentNode) iframe.remove();
    };

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      document.body.appendChild(iframe);
      const win = iframe.contentWindow;
      const doc = win?.document;
      if (!win || !doc) {
        fail(new Error('无法创建打印视图'));
        return;
      }

      const onAfterPrint = () => {
        win.removeEventListener('afterprint', onAfterPrint);
        cleanup();
      };
      win.addEventListener('afterprint', onAfterPrint);
      window.setTimeout(() => {
        win.removeEventListener('afterprint', onAfterPrint);
        cleanup();
      }, 60_000);

      doc.open();
      doc.write(html);
      doc.close();

      void (async () => {
        try {
          await waitForImages(doc, 8000);
          // Brief layout settle after images
          await new Promise((r) => window.setTimeout(r, 100));
          win.focus();
          win.print();
          succeed();
        } catch (err) {
          fail(err);
        }
      })();
    } catch (err) {
      fail(err);
    }
  });
}

export const SAMPLE_TABLE = `| 列1 | 列2 | 列3 |
| --- | --- | --- |
| A | B | C |
| D | E | F |
`;
