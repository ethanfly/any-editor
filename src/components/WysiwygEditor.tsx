import React, { useRef, useEffect, useCallback, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
import { rewriteHtmlImageSources, toDisplaySrc } from '../utils/mediaUrl';
import './WysiwygEditor.css';

interface WysiwygEditorProps {
  content: string;
  filePath?: string;
  onContentChange: (markdown: string) => void;
  scrollToLine?: { line: number; token: number } | null;
  onPasteImage?: (file: File) => Promise<string | null>;
}

/* ============================================================
 *  CARET / CURSOR HELPERS
 * ============================================================ */

function getCaretPosition(element: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

function setCaretPosition(element: HTMLElement, position: number) {
  const range = document.createRange();
  const sel = window.getSelection();
  if (!sel) return;
  let charCount = 0;
  let found = false;
  const traverse = (node: Node): boolean => {
    if (found) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (charCount + text.length >= position) {
        range.setStart(node, position - charCount);
        range.collapse(true);
        found = true;
        return true;
      }
      charCount += text.length;
    } else {
      for (const child of Array.from(node.childNodes)) {
        if (traverse(child)) return true;
      }
    }
    return false;
  };
  traverse(element);
  if (!found) {
    range.selectNodeContents(element);
    range.collapse(position <= 0);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function getCurrentLineElement(editor: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.anchorNode;
  while (node && node !== editor) {
    if (node instanceof HTMLElement) {
      if (
        node.classList.contains('md-line') ||
        node.classList.contains('md-blockquote') ||
        node.classList.contains('md-code-block')
      ) {
        return node;
      }
    }
    node = node.parentNode;
  }
  if (editor.children.length > 0) return editor.children[0] as HTMLElement;
  return null;
}

/* ============================================================
 *  HTML ESCAPE
 * ============================================================ */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, '&#39;');
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(https?:|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(trimmed)) return true;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  return true;
}


/** Sanitize HTML for safe WYSIWYG rendering (Markdown inline/block HTML). */
function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel', 'class', 'id', 'open', 'colspan', 'rowspan', 'align', 'style', 'width', 'height', 'data-original-src'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcdoc'],
    ALLOW_DATA_ATTR: true,
  });
}

function looksLikeHtmlLine(line: string): boolean {
  return /^<\/?[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?\/?>/.test(line.trim());
}

/**
 * Process a plain-text segment with Markdown inline syntax (no raw HTML tags).
 */
function parsePlainInlineMarkdown(text: string): string {
  let working = expandHtmlInline(text);

  const codeSpans: string[] = [];
  working = working.replace(/`([^`\n]+?)`/g, (_match, code: string) => {
    const idx = codeSpans.push(`<code class="md-code">${escapeHtml(code)}</code>`) - 1;
    return `CODE${idx}`;
  });

  working = decodeEscapes(working);
  working = escapeHtml(working);

  working = working.replace(/`([^`\n]+?)`/g, (_match, code: string) => {
    const idx = codeSpans.push(`<code class="md-code">${escapeHtml(code)}</code>`) - 1;
    return `CODE${idx}`;
  });

  working = working
    .replace(/!\[([^\]]*?)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      (_m, alt: string, url: string, title?: string) => {
        if (!isSafeUrl(url)) return escapeHtml(`![${alt}](${url})`);
        return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}"${title ? ` title="${escapeAttr(title)}"` : ''} class="md-image">`;
      })
    .replace(/!\[([^\]]*?)\]\(([^)]+?)\)/g, (_m, alt: string, url: string) => {
      if (!isSafeUrl(url)) return escapeHtml(`![${alt}](${url})`);
      return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" class="md-image">`;
    })
    .replace(/\[([^\]]+?)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      (_m, label: string, url: string, title?: string) => {
        if (!isSafeUrl(url)) return escapeHtml(`[${label}](${url})`);
        return `<a href="${escapeAttr(url)}"${title ? ` title="${escapeAttr(title)}"` : ''} class="md-link" rel="noopener noreferrer">${label}</a>`;
      })
    .replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (_m, label: string, url: string) => {
      if (!isSafeUrl(url)) return escapeHtml(`[${label}](${url})`);
      return `<a href="${escapeAttr(url)}" class="md-link" rel="noopener noreferrer">${label}</a>`;
    });

  working = working
    .replace(/&lt;(https?:\/\/[^\s<>]+)&gt;/g, '<a href="$1" class="md-link" rel="noopener noreferrer">$1</a>')
    .replace(/&lt;([\w.+-]+@[\w-]+(\.[\w-]+)+)&gt;/g, '<a href="mailto:$1" class="md-link">$1</a>');

  working = working
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong class="md-bold">$1</strong>')
    .replace(/__([^_\n]+?)__/g, '<strong class="md-bold">$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em class="md-italic">$1</em>')
    .replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<em class="md-italic">$1</em>')
    .replace(/~~([^~\n]+?)~~/g, '<del class="md-strike">$1</del>')
    .replace(/==([^=\n]+?)==/g, '<mark class="md-highlight">$1</mark>')
    .replace(/\^([^^\n]+?)\^/g, '<sup class="md-superscript">$1</sup>')
    .replace(/(?<!~)~([^~\n]+?)~(?!~)/g, '<sub class="md-subscript">$1</sub>');

  working = working.replace(/CODE(\d+)/g, (_m, idx: string) => codeSpans[Number(idx)] ?? '');
  working = working.split(BR_SENTINEL).join('<br>');
  return working;
}


/* ============================================================
 *  INLINE MARKDOWN PARSER
 * ============================================================ */

const BR_SENTINEL = 'BR';

const HTML_INLINE_TAGS: Array<{
  open: RegExp;
  close: RegExp;
  openRepl: string | ((attrs: string) => string);
  closeRepl: string;
}> = [
  { open: /<br\s*\/?>/gi, close: /<\/br>/gi, openRepl: BR_SENTINEL, closeRepl: '' },
  { open: /<sub(\s[^>]*)?>/gi, close: /<\/sub>/gi, openRepl: '~', closeRepl: '~' },
  { open: /<sup(\s[^>]*)?>/gi, close: /<\/sup>/gi, openRepl: '^', closeRepl: '^' },
  { open: /<b(\s[^>]*)?>/gi, close: /<\/b>/gi, openRepl: '**', closeRepl: '**' },
  { open: /<strong(\s[^>]*)?>/gi, close: /<\/strong>/gi, openRepl: '**', closeRepl: '**' },
  { open: /<i(\s[^>]*)?>/gi, close: /<\/i>/gi, openRepl: '*', closeRepl: '*' },
  { open: /<em(\s[^>]*)?>/gi, close: /<\/em>/gi, openRepl: '*', closeRepl: '*' },
  { open: /<del(\s[^>]*)?>/gi, close: /<\/del>/gi, openRepl: '~~', closeRepl: '~~' },
  { open: /<s(\s[^>]*)?>/gi, close: /<\/s>/gi, openRepl: '~~', closeRepl: '~~' },
  { open: /<strike(\s[^>]*)?>/gi, close: /<\/strike>/gi, openRepl: '~~', closeRepl: '~~' },
  { open: /<mark(\s[^>]*)?>/gi, close: /<\/mark>/gi, openRepl: '==', closeRepl: '==' },
  { open: /<code(\s[^>]*)?>/gi, close: /<\/code>/gi, openRepl: '`', closeRepl: '`' },
  { open: /<kbd(\s[^>]*)?>/gi, close: /<\/kbd>/gi, openRepl: '`', closeRepl: '`' },
];

function expandHtmlInline(text: string): string {
  let result = text;
  for (const tag of HTML_INLINE_TAGS) {
    result = result.replace(tag.open, (_m, attrs) =>
      typeof tag.openRepl === 'function' ? tag.openRepl(attrs || '') : tag.openRepl
    );
    result = result.replace(tag.close, tag.closeRepl);
  }
  return result;
}

function decodeEscapes(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!>~^=|:])/g, '$1');
}

function parseInlineMarkdown(text: string): string {
  // Split into HTML tags and plain text so HTML keeps its rendered effect
  // while Markdown syntax still works on surrounding text.
  const parts = text.split(/(<\/?[a-zA-Z][^>]*>)/g);
  let out = '';
  let htmlBuffer = '';
  let depth = 0;

  const flushHtml = () => {
    if (!htmlBuffer) return;
    out += sanitizeRichHtml(htmlBuffer);
    htmlBuffer = '';
    depth = 0;
  };

  for (const part of parts) {
    if (!part) continue;

    if (/^<\/?[a-zA-Z][^>]*>$/.test(part)) {
      const isClosing = /^<\//.test(part);
      const isSelfClosing = /\/>$/.test(part) || /^<(br|hr|img|input|meta|link|wbr|source|area|col|embed|param|track)\b/i.test(part);

      if (depth === 0 && !isClosing) {
        // starting a new HTML island
        htmlBuffer = part;
        depth = isSelfClosing ? 0 : 1;
        if (depth === 0) flushHtml();
        continue;
      }

      htmlBuffer += part;
      if (isClosing) {
        depth = Math.max(0, depth - 1);
        if (depth === 0) flushHtml();
      } else if (!isSelfClosing) {
        depth += 1;
      } else if (depth === 0) {
        flushHtml();
      }
      continue;
    }

    if (depth > 0) {
      htmlBuffer += part;
    } else {
      out += parsePlainInlineMarkdown(part);
    }
  }

  flushHtml();
  return out;
}

/* ============================================================
 *  BLOCK TYPE DETECTION
 * ============================================================ */

interface BlockType {
  type: string;
  prefix: string;
  content: string;
  level?: number;
  checked?: boolean;
  num?: string;
}

function detectBlockType(text: string): BlockType | null {
  const hMatch = text.match(/^(#{1,6})$/);
  if (hMatch) return { type: 'heading', prefix: hMatch[1], content: '', level: hMatch[1].length };

  const ulMatch = text.match(/^([-*])$/);
  if (ulMatch) return { type: 'ul', prefix: ulMatch[1], content: '' };

  const olMatch = text.match(/^(\d+)\.$/);
  if (olMatch) return { type: 'ol', prefix: olMatch[1] + '.', content: '', num: olMatch[1] };

  const taskMatch = text.match(/^- \[([ xX])\]$/);
  if (taskMatch)
    return { type: 'task', prefix: '- [' + taskMatch[1] + ']', content: '', checked: taskMatch[1].toLowerCase() === 'x' };

  if (text === '>') return { type: 'blockquote', prefix: '>', content: '' };
  if (/^(---|\*\*\*|___)$/.test(text)) return { type: 'hr', prefix: text, content: '' };
  if (text === '```') return { type: 'code', prefix: '```', content: '' };
  return null;
}

/* ============================================================
 *  HTML ELEMENT GENERATOR
 * ============================================================ */

function createLineElement(blockType: BlockType, content: string = ''): HTMLElement {
  const div = document.createElement('div');
  div.className = 'md-line';
  switch (blockType.type) {
    case 'heading':
      div.setAttribute('data-type', `h${blockType.level}`);
      div.innerHTML = content ? parseInlineMarkdown(content) : '<br>';
      break;
    case 'ul':
      div.setAttribute('data-type', 'li');
      div.setAttribute('data-list', 'ul');
      div.innerHTML = content ? parseInlineMarkdown(content) : '<br>';
      break;
    case 'ol':
      div.setAttribute('data-type', 'li');
      div.setAttribute('data-list', 'ol');
      div.setAttribute('data-num', blockType.num || '1');
      div.innerHTML = content ? parseInlineMarkdown(content) : '<br>';
      break;
    case 'task':
      div.className = 'md-line md-task';
      div.setAttribute('data-type', 'task');
      div.setAttribute('data-checked', String(blockType.checked || false));
      div.innerHTML =
        `<input type="checkbox" ${blockType.checked ? 'checked' : ''}><span class="md-task-text">${content ? parseInlineMarkdown(content) : ''}</span>`;
      break;
    default:
      div.setAttribute('data-type', 'p');
      div.innerHTML = content ? parseInlineMarkdown(content) : '<br>';
  }
  return div;
}

/* ============================================================
 *  MARKDOWN → HTML (for initial display)
 * ============================================================ */

function parseMarkdownToHtml(md: string, filePath?: string): string {
  if (!md) return '<div class="md-line" data-type="p"><br></div>';

  // Normalize CRLF / CR → LF so Windows-style files parse identically to
  // Unix-style files. Trailing \r characters would otherwise survive into
  // inline markdown output and cause rendering artefacts inside the
  // contentEditable div.
  const normalized = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeLanguage = '';
  let codeLines: string[] = [];
  let headingIndex = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^```(.*)$/);
    if (fenceMatch) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = fenceMatch[1].trim();
        codeLines = [];
      } else {
        result.push(
          `<pre id="block-code-${headingIndex}" class="md-code-block" data-lang="${codeLanguage}"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
        );
        headingIndex += 1;
        inCodeBlock = false;
        codeLanguage = '';
        codeLines = [];
      }
      i += 1;
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      i += 1;
      continue;
    }

    // Heading
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      result.push(
        `<div data-line="${i + 1}" class="md-line" data-type="h${hMatch[1].length}">${parseInlineMarkdown(hMatch[2])}</div>`
      );
      headingIndex += 1;
      i += 1;
      continue;
    }

    // Task list
    const taskMatch = line.match(/^([-*])\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      const checked = taskMatch[2].toLowerCase() === 'x';
      result.push(
        `<div class="md-line md-task" data-type="task" data-checked="${checked}"><input type="checkbox" ${checked ? 'checked' : ''}><span class="md-task-text">${parseInlineMarkdown(taskMatch[3])}</span></div>`
      );
      i += 1;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      result.push(
        `<div class="md-line" data-type="li" data-list="ul">${parseInlineMarkdown(ulMatch[1])}</div>`
      );
      i += 1;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      result.push(
        `<div class="md-line" data-type="li" data-list="ol" data-num="${olMatch[1]}">${parseInlineMarkdown(olMatch[2])}</div>`
      );
      i += 1;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      result.push(
        `<blockquote class="md-blockquote">${parseInlineMarkdown(line.slice(2))}</blockquote>`
      );
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)$/.test(line.trim())) {
      result.push('<hr class="md-hr">');
      i += 1;
      continue;
    }

    // GFM Table detection (consecutive lines with | separators and at least one separator line)
    if ((line.includes('|') && line.trim().startsWith('|')) || line.trim().endsWith('|')) {
      // Collect table rows until we find a non-table line
      const tableRows: string[] = [line];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        if (nextLine.includes('|') && (nextLine.trim().startsWith('|') || nextLine.trim().endsWith('|'))) {
          tableRows.push(nextLine);
          j += 1;
        } else {
          break;
        }
      }

      // Need at least 2 rows (header + separator + optional data)
      if (tableRows.length >= 2) {
        const hasSeparator = tableRows.some((row, idx) =>
          idx > 0 && /^\|?[\s:-]+\|[\s|:-]+\|?$/.test(row.trim())
        );
        if (hasSeparator) {
          // Find the separator row index
          let sepIdx = -1;
          for (let k = 1; k < tableRows.length; k++) {
            if (/^\|?[\s:-]+\|[\s|:-]+\|?$/.test(tableRows[k].trim())) {
              sepIdx = k;
              break;
            }
          }

          // Parse table
          const parseRow = (row: string): string[] => {
            return row.split('|')
              .map(c => c.trim())
              .filter(c => c !== '' && !/^[-:]+$/.test(c));
          };

          // Determine alignment from separator row
          const alignRow = sepIdx >= 0 ? tableRows[sepIdx] : '';
          const alignments: string[] = [];
          if (alignRow) {
            alignRow.split('|').forEach(cell => {
              const c = cell.trim();
              if (c.startsWith(':') && c.endsWith(':')) alignments.push('center');
              else if (c.endsWith(':')) alignments.push('right');
              else alignments.push('left');
            });
          }

          let html = '<table class="md-table"><thead><tr>';
          // Header row(s): all rows before separator
          for (let k = 0; k < sepIdx; k++) {
            const cells = parseRow(tableRows[k]);
            cells.forEach((cell, ci) => {
              html += `<th style="text-align:${alignments[ci] || 'left'}">${parseInlineMarkdown(cell)}</th>`;
            });
          }
          html += '</tr></thead><tbody>';

          // Data rows: after separator
          for (let k = sepIdx + 1; k < tableRows.length; k++) {
            html += '<tr>';
            const cells = parseRow(tableRows[k]);
            cells.forEach((cell, ci) => {
              html += `<td style="text-align:${alignments[ci] || 'left'}">${parseInlineMarkdown(cell)}</td>`;
            });
            html += '</tr>';
          }
          html += '</tbody></table>';
          result.push(html);
          i = j;
          continue;
        }
      }
      // Fall through to paragraph if not a valid table
    }

    // Standalone image
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (imgMatch) {
      const alt = imgMatch[1];
      const src = imgMatch[2];
      const title = imgMatch[3];
      const display = toDisplaySrc(filePath, src);
      const originalAttr =
        display !== src ? ` data-original-src="${escapeAttr(src)}"` : '';
      result.push(
        `<p class="md-image-block"><img src="${escapeAttr(display)}" alt="${escapeAttr(alt)}"${title ? ` title="${escapeAttr(title)}"` : ''}${originalAttr} class="md-image"></p>`
      );
      i += 1;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      result.push('<div class="md-line" data-type="p"><br></div>');
      i += 1;
      continue;
    }

    // Raw HTML block — collect consecutive HTML-ish lines, sanitize, and render
    if (looksLikeHtmlLine(line)) {
      const htmlLines: string[] = [line];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        // Keep blank lines inside HTML islands (pretty-printed markup)
        if (next.trim() === '') {
          htmlLines.push(next);
          j += 1;
          continue;
        }
        // Keep gathering while it still looks like HTML / nested markup / attributes
        if (
          looksLikeHtmlLine(next) ||
          /^\s*</.test(next) ||
          /<\/[a-zA-Z]/.test(next) ||
          /['"]\s*>/.test(next) ||
          /^\s*[a-zA-Z_:][-a-zA-Z0-9_:.]*\s*=/.test(next)
        ) {
          htmlLines.push(next);
          j += 1;
          continue;
        }
        break;
      }

      const rawSource = htmlLines.join('\n');
      const safe = sanitizeRichHtml(rawSource);
      const encodedSource = encodeURIComponent(rawSource);
      if (safe.trim()) {
        result.push(
          `<div class="md-line md-raw-html" data-type="raw" data-raw-source="${encodedSource}">${safe}</div>`
        );
      } else {
        // Sanitizer stripped everything — show escaped source so content is not lost
        result.push(
          `<div class="md-line md-raw-html" data-type="raw" data-raw-source="${encodedSource}"><code class="md-code">${escapeHtml(rawSource)}</code></div>`
        );
      }
      i = j;
      continue;
    }

    // Default paragraph
    result.push(
      `<div class="md-line" data-type="p">${parseInlineMarkdown(line)}</div>`
    );
    i += 1;
  }

  if (inCodeBlock) {
    result.push(
      `<pre class="md-code-block" data-lang="${codeLanguage}"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
    );
  }

  const joined = result.join('');
  return rewriteHtmlImageSources(joined, filePath);
}

/* ============================================================
 *  HTML → MARKDOWN (serializer)
 * ============================================================ */

function htmlToMarkdown(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const ATTR_ALLOW = new Set([
    'align', 'width', 'height', 'href', 'src', 'alt', 'title', 'class', 'id',
    'open', 'colspan', 'rowspan', 'style', 'target', 'rel',
  ]);

  const serializeAttrs = (el: Element): string => {
    let out = '';
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('data-')) continue;
      if (!ATTR_ALLOW.has(name)) continue;
      // Prefer original src when present (display URL is not source of truth)
      if (name === 'src' && el.hasAttribute('data-original-src')) continue;
      out += ` ${name}="${attr.value.replace(/"/g, '&quot;')}"`;
    }
    if (el.hasAttribute('data-original-src')) {
      out += ` src="${(el.getAttribute('data-original-src') || '').replace(/"/g, '&quot;')}"`;
    }
    return out;
  };

  const processNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const className = typeof el.className === 'string' ? el.className : '';
    const dataType = el.getAttribute('data-type') || '';
    const children = Array.from(el.childNodes).map(processNode).join('');

    // Code block
    if (tag === 'pre' && className.includes('md-code-block')) {
      const lang = el.getAttribute('data-lang') || '';
      const code = el.querySelector('code')?.textContent || '';
      return `\`\`\`${lang}\n${code}\n\`\`\`\n`;
    }

    // Line elements
    if (tag === 'div' && className.includes('md-line')) {
      // Raw HTML blocks must round-trip as original source
      if (dataType === 'raw') {
        const encoded = el.getAttribute('data-raw-source');
        if (encoded) {
          try {
            return `${decodeURIComponent(encoded)}\n`;
          } catch {
            return `${encoded}\n`;
          }
        }
        return `${el.innerHTML}\n`;
      }
      switch (dataType) {
        case 'h1': return `# ${children}\n`;
        case 'h2': return `## ${children}\n`;
        case 'h3': return `### ${children}\n`;
        case 'h4': return `#### ${children}\n`;
        case 'h5': return `##### ${children}\n`;
        case 'h6': return `###### ${children}\n`;
        case 'li': {
          const listType = el.getAttribute('data-list');
          const num = el.getAttribute('data-num') || '1';
          return listType === 'ol' ? `${num}. ${children}\n` : `- ${children}\n`;
        }
        case 'task': {
          const checked = el.getAttribute('data-checked') === 'true';
          return `- [${checked ? 'x' : ' '}] ${children}\n`;
        }
        case 'p':
        default:
          return `${children}\n`;
      }
    }

    // Blockquote
    if (tag === 'blockquote') return `> ${children}\n`;

    // HR
    if (tag === 'hr') return '---\n';

    // Inline formatting
    if (className.includes('md-bold') || tag === 'strong' || tag === 'b') return `**${children}**`;
    if (className.includes('md-italic') || tag === 'em' || tag === 'i') return `*${children}*`;
    if (className.includes('md-strike') || tag === 'del' || tag === 's' || tag === 'strike') return `~~${children}~~`;
    if (className.includes('md-highlight') || tag === 'mark') return `==${children}==`;
    if (className.includes('md-code') || tag === 'kbd' || (tag === 'code' && !el.closest('pre'))) return `\`${children}\``;
    if (className.includes('md-superscript') || tag === 'sup') return `^${children}^`;
    if (className.includes('md-subscript') || tag === 'sub') return `~${children}~`;
    if (className.includes('md-link') || tag === 'a') {
      const href = el.getAttribute('href') || '';
      return `[${children}](${href})`;
    }
    if (tag === 'img') {
      const src = el.getAttribute('data-original-src') || el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '';
      // If this image sits inside a raw HTML island, the parent will emit full HTML.
      // For markdown images, emit markdown form.
      if (el.closest('[data-type="raw"]')) {
        return `<img${serializeAttrs(el)} />`;
      }
      return `![${alt}](${src})`;
    }
    if (tag === 'br') return '';
    if (tag === 'input') return '';
    if (tag === 'span') return children;

    // Table serialization
    if (tag === 'table' && className.includes('md-table')) {
      const rows: string[] = [];
      const thead = el.querySelector('thead');
      
      const allRows = el.querySelectorAll('tr');

      // Collect alignment info from header cells
      const alignments: string[] = [];
      const firstRow = allRows[0];
      if (firstRow) {
        firstRow.querySelectorAll('th, td').forEach(cell => {
          const align = (cell as HTMLElement).style.textAlign || 'left';
          alignments.push(align);
        });
      }

      allRows.forEach((row, rowIdx) => {
        const cells = row.querySelectorAll('th, td');
        const cellTexts: string[] = [];
        cells.forEach((cell) => {
          cellTexts.push(processNode(cell).trim());
        });
        rows.push('| ' + cellTexts.join(' | ') + ' |');

        // Insert separator after header
        if (rowIdx === 0 && (thead || row === allRows[0])) {
          const sepCells = cellTexts.map((_, ci) => {
            const a = alignments[ci] || 'left';
            if (a === 'center') return ':---:';
            if (a === 'right') return '---:';
            return '---';
          });
          rows.push('| ' + sepCells.join(' | ') + ' |');
        }
      });
      return rows.join('\n') + '\n';
    }

    // Generic HTML element: reconstruct with attributes (fallback when not wrapped as raw)
    if (/^(div|p|section|article|aside|header|footer|nav|main|details|summary|figure|figcaption|address|hgroup|dialog|template|center)$/.test(tag)) {
      const attrs = serializeAttrs(el);
      const voidish = !children && /^(br|hr)$/.test(tag);
      if (voidish) return `<${tag}${attrs} />\n`;
      return `<${tag}${attrs}>${children}</${tag}>\n`;
    }
    if (/^(span|font|u|small|abbr|dfn|cite|time|var|samp|q|data|wbr|bdo|bdi|ruby|rt|rp|output|meter|progress|datalist|label)$/.test(tag)) {
      const attrs = serializeAttrs(el);
      return `<${tag}${attrs}>${children}</${tag}>`;
    }

    return children;
  };

  return Array.from(temp.childNodes)
    .map(processNode)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ============================================================
 *  SYNTAX HIGHLIGHTING
 * ============================================================ */

function applySyntaxHighlighting(root: HTMLElement): void {
  root.querySelectorAll('.md-code-block code').forEach((block) => {
    const pre = block.parentElement;
    const lang = pre?.getAttribute('data-lang') || '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        const result = hljs.highlight(block.textContent || '', { language: lang });
        block.innerHTML = result.value;
      } catch {
        // highlight.js may throw on edge cases — leave raw text
      }
    }
  });
}

/* ============================================================
 *  HEADING ID SYNC
 * ============================================================ */

function syncHeadingIds(editor: HTMLElement) {
  let headingIndex = 0;
  Array.from(editor.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    const type = child.getAttribute('data-type');
    if (type && /^h[1-6]$/.test(type)) {
      child.id = `heading-${headingIndex}`;
      headingIndex += 1;
    } else if (child.id.startsWith('heading-')) {
      child.removeAttribute('id');
    }
  });
}

/* ============================================================
 *  WYSIWYG EDITOR COMPONENT
 * ============================================================ */

const WysiwygEditor: React.FC<WysiwygEditorProps> = ({ content, filePath, onContentChange, scrollToLine, onPasteImage }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isInternalChange, setIsInternalChange] = useState(false);
  const onChangeRef = useRef(onContentChange);
  const lastNavTokenRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const baselineRef = useRef(content);

  useEffect(() => {
    onChangeRef.current = onContentChange;
  }, [onContentChange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (!initializedRef.current) {
      editor.innerHTML = parseMarkdownToHtml(content, filePath);
      syncHeadingIds(editor);
      applySyntaxHighlighting(editor);
      baselineRef.current = content;
      initializedRef.current = true;
      return;
    }

    if (isInternalChange) return;

    // Only re-parse when external content actually changed vs last known source
    if (content !== baselineRef.current) {
      editor.innerHTML = parseMarkdownToHtml(content, filePath);
      syncHeadingIds(editor);
      applySyntaxHighlighting(editor);
      baselineRef.current = content;
    }
  }, [content, filePath, isInternalChange]);

  useEffect(() => {
    if (!scrollToLine || !editorRef.current) return;
    if (lastNavTokenRef.current === scrollToLine.token) return;
    lastNavTokenRef.current = scrollToLine.token;

    const editor = editorRef.current;
    const headingEl = editor.querySelector(`[data-line="${scrollToLine.line}"]`);
    if (headingEl) {
      headingEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const blocks = editor.children;
    const idx = Math.min(scrollToLine.line - 1, blocks.length - 1);
    if (idx >= 0 && blocks[idx]) {
      blocks[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [scrollToLine]);

  const updateContent = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setIsInternalChange(true);
    syncHeadingIds(editor);
    const md = htmlToMarkdown(editor.innerHTML);
    baselineRef.current = md;
    onChangeRef.current(md);
    applySyntaxHighlighting(editor);
    setTimeout(() => setIsInternalChange(false), 0);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.tagName !== 'INPUT') return;
      const input = target as HTMLInputElement;
      if (input.type !== 'checkbox') return;
      const task = input.closest('.md-task') as HTMLElement | null;
      if (!task) return;
      task.setAttribute('data-checked', String(input.checked));
      updateContent();
    };

    editor.addEventListener('click', onClick);
    return () => editor.removeEventListener('click', onClick);
  }, [updateContent]);

  const handleInput = useCallback(
    (e: React.FormEvent) => {
      const editor = editorRef.current;
      if (!editor) return;

      const lineEl = getCurrentLineElement(editor);
      if (!lineEl) return;

      const text = lineEl.textContent || '';
      const pos = getCaretPosition(lineEl);

      if (lineEl.getAttribute('data-type') === 'li' && lineEl.getAttribute('data-list') === 'ul') {
        const taskInListMatch = text.match(/^\s*\[([ xX])\]\s*(.*)$/);
        if (taskInListMatch) {
          const checked = taskInListMatch[1].toLowerCase() === 'x';
          const taskContent = (taskInListMatch[2] || '').replace(/^\s+/, '');
          const taskEl = createLineElement(
            { type: 'task', prefix: `- [${taskInListMatch[1]}]`, content: '', checked },
            taskContent
          );
          lineEl.replaceWith(taskEl);
          const textTarget = taskEl.querySelector('.md-task-text');
          setCaretPosition((textTarget as HTMLElement) || taskEl, taskContent.length);
          updateContent();
          return;
        }
      }

      if (e.nativeEvent instanceof InputEvent && e.nativeEvent.data === ' ') {
        const textBeforeSpace = text.substring(0, pos - 1).trim();
        const blockType = detectBlockType(textBeforeSpace);
        if (blockType) {
          const contentAfter = text.substring(pos);
          const newEl = createLineElement(blockType, contentAfter);
          lineEl.replaceWith(newEl);
          setCaretPosition(newEl, contentAfter.length);
          updateContent();
          return;
        }
      }

      updateContent();
    },
    [updateContent]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const editor = editorRef.current;
      if (!editor) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const lineEl = getCurrentLineElement(editor);

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!lineEl) {
          updateContent();
          return;
        }

        const type = lineEl.getAttribute('data-type') || 'p';
        const listKind = lineEl.getAttribute('data-list');
        const text = (lineEl.textContent || '').trim();
        const isEmpty = text === '' || text === '\u200B';

        if (isEmpty && (type === 'li' || type === 'task')) {
          const newLine = document.createElement('div');
          newLine.className = 'md-line';
          newLine.setAttribute('data-type', 'p');
          newLine.innerHTML = '<br>';
          lineEl.replaceWith(newLine);
          setCaretPosition(newLine, 0);
          updateContent();
          return;
        }

        if (type === 'li' && listKind === 'ul') {
          const newEl = createLineElement({ type: 'ul', prefix: '-', content: '' }, '');
          lineEl.after(newEl);
          setCaretPosition(newEl, 0);
          updateContent();
          return;
        }

        if (type === 'li' && listKind === 'ol') {
          const currentNum = Number(lineEl.getAttribute('data-num') || '1');
          const next = String(currentNum + 1);
          const newEl = createLineElement(
            { type: 'ol', prefix: `${next}.`, content: '', num: next },
            ''
          );
          lineEl.after(newEl);
          setCaretPosition(newEl, 0);
          updateContent();
          return;
        }

        if (type === 'task') {
          const newEl = createLineElement(
            { type: 'task', prefix: '- [ ]', content: '', checked: false },
            ''
          );
          lineEl.after(newEl);
          const textTarget = newEl.querySelector('.md-task-text');
          setCaretPosition((textTarget as HTMLElement) || newEl, 0);
          updateContent();
          return;
        }

        const newLine = document.createElement('div');
        newLine.className = 'md-line';
        newLine.setAttribute('data-type', 'p');
        newLine.innerHTML = '<br>';
        lineEl.after(newLine);
        setCaretPosition(newLine, 0);
        updateContent();
        return;
      }

      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
        updateContent();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        document.execCommand('bold');
        updateContent();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        document.execCommand('italic');
        updateContent();
        return;
      }
    },
    [updateContent]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      if (!onPasteImage) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        const rel = await onPasteImage(file);
        if (!rel) return;
        const md = `![image](${rel})`;
        // insert at caret as markdown image line element
        document.execCommand('insertText', false, md);
        updateContent();
        return;
      }
    },
    [onPasteImage, updateContent]
  );

  return (
    <div className="wysiwyg-editor">
      <div
        ref={editorRef}
        className="wysiwyg-content"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={(e) => {
          void handlePaste(e);
        }}
        onBlur={updateContent}
        spellCheck={false}
      />
    </div>
  );
};


export default WysiwygEditor;
