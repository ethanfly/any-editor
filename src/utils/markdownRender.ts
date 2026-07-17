/**
 * Single markdown → HTML pipeline for preview / split / export.
 * WYSIWYG keeps an editable DOM, but uses the same extras/math/mermaid helpers.
 */

import { marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
import { rewriteHtmlImageSources } from './mediaUrl';
import {
  expandMarkdownExtras,
  MARKDOWN_PURIFY,
  renderFencedCodeHtml,
  renderMathInMarkdown,
} from './markdownExtensions';

let markedConfigured = false;

function configureMarked(): void {
  if (markedConfigured) return;
  markedConfigured = true;

  marked.use({
    gfm: true,
    breaks: false,
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const language = (lang || '').trim().toLowerCase();
        const mermaidHtml = renderFencedCodeHtml(text, language);
        if (mermaidHtml) return mermaidHtml;

        const hlLang = language && hljs.getLanguage(language) ? language : 'plaintext';
        const highlighted = hljs.highlight(text, { language: hlLang }).value;
        return `<pre class="md-code-block"><code class="hljs language-${hlLang}">${highlighted}</code></pre>\n`;
      },
      heading({ text, depth }: { text: string; depth: number }) {
        const id = text
          .toLowerCase()
          .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
          .replace(/\s+/g, '-');
        return `<h${depth} id="${id}" data-line-hint="${depth}">${text}</h${depth}>\n`;
      },
    },
  });
}

export interface MarkdownRenderOptions {
  filePath?: string;
  /** Skip DOMPurify (only for trusted internal tests). */
  skipSanitize?: boolean;
}

/**
 * Full document render used by preview + split right pane (+ export).
 * Pipeline: extras → math → marked → local media → purify
 */
export async function renderMarkdownDocument(
  content: string,
  options: MarkdownRenderOptions = {}
): Promise<string> {
  configureMarked();

  const withExtras = expandMarkdownExtras(content);
  const withMath = await renderMathInMarkdown(withExtras);
  const rawHtml = marked.parse(withMath, { async: false }) as string;
  // Wrap tables for horizontal scroll + consistent layout with WYSIWYG
  const withTables = rawHtml.replace(
    /<table(\s[^>]*)?>[\s\S]*?<\/table>/gi,
    (m) => `<div class="md-table-wrap">${m}</div>`
  );
  const withLocalMedia = rewriteHtmlImageSources(withTables, options.filePath);

  if (options.skipSanitize) return withLocalMedia;

  return DOMPurify.sanitize(withLocalMedia, {
    ADD_TAGS: [...MARKDOWN_PURIFY.ADD_TAGS],
    ADD_ATTR: [...MARKDOWN_PURIFY.ADD_ATTR, 'disabled', 'checked'],
  }) as string;
}
