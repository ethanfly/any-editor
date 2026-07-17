/**
 * Shared Markdown extension helpers used by preview / export / WYSIWYG.
 * Covers math, highlight, super/subscript, and mermaid fences beyond stock GFM.
 */

import {
  escapeHtml,
  hasMermaidDiagram,
  mermaidFenceLanguage,
  mermaidPlaceholderHtml,
  normalizeMermaidSource,
  shouldRenderAsMermaid,
} from './mermaidDiagram';

export const MATH_BLOCK_SNIPPET = `$$
E = mc^2
$$
`;

export const MATH_INLINE_SNIPPET = `$E=mc^2$`;

export function hasMath(src: string): boolean {
  return /\$\$[\s\S]+?\$\$/.test(src) || /(^|[^\\$])\$[^\n$]+?\$/.test(src);
}

export function hasMarkdownExtras(src: string): boolean {
  return hasMath(src) || hasMermaidDiagram(src) || /==[^=\n]+==/.test(src);
}

/** Protect fenced code blocks while transforming the rest of the document. */
export function mapOutsideFences(src: string, map: (segment: string) => string): string {
  const fences: string[] = [];
  const masked = src.replace(/```[\s\S]*?```/g, (m) => {
    const i = fences.length;
    fences.push(m);
    return `@@FENCE${i}@@`;
  });
  const transformed = map(masked);
  return transformed.replace(/@@FENCE(\d+)@@/g, (_m, i: string) => fences[Number(i)] ?? '');
}

/**
 * Convert ==highlight==, ^sup^, ~sub~ (outside code fences) into HTML.
 * Applied before marked so GFM parser does not eat the tokens.
 */
export function expandMarkdownExtras(src: string): string {
  return mapOutsideFences(src, (segment) => {
    const codes: string[] = [];
    let text = segment.replace(/`[^`\n]+`/g, (m) => {
      const i = codes.length;
      codes.push(m);
      return `@@CODE${i}@@`;
    });

    const maths: string[] = [];
    text = text.replace(/\$\$[\s\S]+?\$\$/g, (m) => {
      const i = maths.length;
      maths.push(m);
      return `@@MATH${i}@@`;
    });
    text = text.replace(/(^|[^\\$])(\$[^\n$]+?\$)/g, (_m, prefix: string, body: string) => {
      const i = maths.length;
      maths.push(body);
      return `${prefix}@@MATH${i}@@`;
    });

    text = text
      .replace(/==([^=\n]+?)==/g, '<mark class="md-highlight">$1</mark>')
      .replace(/\^([^^\n]+?)\^/g, '<sup class="md-superscript">$1</sup>')
      .replace(/(?<!~)~([^~\n]+?)~(?!~)/g, '<sub class="md-subscript">$1</sub>');

    text = text.replace(/@@MATH(\d+)@@/g, (_m, i: string) => maths[Number(i)] ?? '');
    text = text.replace(/@@CODE(\d+)@@/g, (_m, i: string) => codes[Number(i)] ?? '');
    return text;
  });
}

/** Lazy KaTeX render for markdown source (outside fences). */
export async function renderMathInMarkdown(src: string): Promise<string> {
  if (!hasMath(src)) return src;
  // Lazy-load: katex CSS+JS only when formulas exist.
  const katex = (await import('katex')).default;
  await import('katex/dist/katex.min.css');

  return mapOutsideFences(src, (segment) => {
    let text = segment.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr: string) => {
      try {
        return katex.renderToString(expr.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
      } catch {
        return `<pre class="math-error">$$${expr}$$</pre>`;
      }
    });

    text = text.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (_m, prefix: string, expr: string) => {
      try {
        return `${prefix}${katex.renderToString(expr.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        })}`;
      } catch {
        return `${prefix}$${expr}$`;
      }
    });

    return text;
  });
}

/** DOMPurify options shared by markdown HTML sinks. */
export const MARKDOWN_PURIFY = {
  ADD_TAGS: [
    'div',
    'span',
    'mark',
    'sup',
    'sub',
    'section',
    'figure',
    'figcaption',
    'details',
    'summary',
    'svg',
    'path',
    'g',
    'defs',
    'marker',
    'use',
    'clipPath',
    'foreignObject',
    'style',
    'line',
    'polygon',
    'polyline',
    'rect',
    'circle',
    'ellipse',
    'text',
    'tspan',
  ],
  ADD_ATTR: [
    'target',
    'rel',
    'id',
    'class',
    'style',
    'width',
    'height',
    'align',
    'colspan',
    'rowspan',
    'open',
    'aria-hidden',
    'aria-label',
    'aria-roledescription',
    'role',
    'xmlns',
    'viewBox',
    'preserveAspectRatio',
    'd',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-dasharray',
    'stroke-linecap',
    'stroke-linejoin',
    'transform',
    'x',
    'y',
    'x1',
    'y1',
    'x2',
    'y2',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'points',
    'marker-end',
    'marker-start',
    'markerWidth',
    'markerHeight',
    'refX',
    'refY',
    'orient',
    'markerUnits',
    'fx',
    'fy',
    'offset',
    'gradientUnits',
    'gradientTransform',
    'clip-path',
    'clipPathUnits',
    'text-anchor',
    'dominant-baseline',
    'font-family',
    'font-size',
    'font-weight',
    'opacity',
    'data-line-hint',
    'data-original-src',
    'data-mermaid-id',
    'data-mermaid-lang',
    'data-mermaid-source',
    'data-type',
    'data-lang',
    'data-raw-source',
    'data-expr',
    'data-display',
    'data-processed',
    'colspan',
    'rowspan',
  ],
} as const;

/** Build marked code renderer snippet for mermaid-aware fences. */
export function renderFencedCodeHtml(text: string, lang?: string): string | null {
  if (!shouldRenderAsMermaid(lang, text)) return null;
  return mermaidPlaceholderHtml(lang, text);
}

/** Placeholder HTML for WYSIWYG mermaid blocks (round-trips via data attributes). */
export function wysiwygMermaidBlockHtml(
  lang: string | undefined | null,
  text: string,
  blockId: number
): string {
  const source = normalizeMermaidSource(lang, text);
  const fenceLang = mermaidFenceLanguage(lang);
  const encoded = encodeURIComponent(source);
  return (
    `<div id="block-mermaid-${blockId}" class="md-line md-mermaid-block" contenteditable="false" ` +
    `data-type="mermaid" data-lang="${escapeHtml(fenceLang)}" data-mermaid-source="${encoded}" data-raw-source="${encoded}">` +
    `<div class="md-mermaid-canvas mermaid-src mermaid-pending" data-mermaid-source="${encoded}"></div>` +
    `<pre class="md-mermaid-source" spellcheck="false"><code>${escapeHtml(source)}</code></pre>` +
    `</div>`
  );
}

export function wysiwygMathInlineHtml(expr: string): string {
  return `<span class="md-math md-math-inline" data-type="math" data-display="0" data-expr="${encodeURIComponent(expr)}"></span>`;
}

export function wysiwygMathBlockHtml(expr: string): string {
  return `<div class="md-line md-math md-math-block" contenteditable="false" data-type="math" data-display="1" data-expr="${encodeURIComponent(expr)}"></div>`;
}

export async function renderMathInRoot(
  root: HTMLElement,
  options: { force?: boolean; signal?: { cancelled: boolean } } = {}
): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.md-math'));
  if (!nodes.length) return;

  // Lazy-load: katex only when math nodes exist.
  const katex = (await import('katex')).default;
  await import('katex/dist/katex.min.css');
  if (options.signal?.cancelled) return;

  for (const el of nodes) {
    if (options.signal?.cancelled) return;
    if (!options.force && el.dataset.rendered === '1') continue;
    const encoded = el.getAttribute('data-expr') || '';
    let expr = '';
    try {
      expr = decodeURIComponent(encoded);
    } catch {
      expr = encoded;
    }
    const display = el.getAttribute('data-display') === '1';
    try {
      el.innerHTML = katex.renderToString(expr.trim(), {
        displayMode: display,
        throwOnError: false,
        output: 'html',
      });
      el.dataset.rendered = '1';
    } catch {
      el.innerHTML = `<pre class="math-error">${display ? '$$' : '$'}${escapeHtml(expr)}${display ? '$$' : '$'}</pre>`;
      el.dataset.rendered = '1';
    }
  }
}
