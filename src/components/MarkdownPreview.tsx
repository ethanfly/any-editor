import { useRef, useEffect, useState } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
import type { ScrollToLine } from '../types';
import { rewriteHtmlImageSources } from '../utils/mediaUrl';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import './MarkdownPreview.css';

interface MarkdownPreviewProps {
  content: string;
  filePath?: string;
  scrollPercent?: number;
  onPreviewScroll?: (percent: number) => void;
  scrollToLine?: ScrollToLine;
}

function hasMath(src: string): boolean {
  return /\$\$[\s\S]+?\$\$/.test(src) || /(^|[^\\])\$[^\n$]+?\$/.test(src);
}

function hasMermaid(src: string): boolean {
  return /```mermaid\b/i.test(src);
}

async function renderMathInMarkdown(src: string): Promise<string> {
  if (!hasMath(src)) return src;
  const katex = (await import('katex')).default;
  await import('katex/dist/katex.min.css');

  const fences: string[] = [];
  let text = src.replace(/```[\s\S]*?```/g, (m) => {
    const i = fences.length;
    fences.push(m);
    return `@@FENCE${i}@@`;
  });

  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr: string) => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `<pre class="math-error">$$${expr}$$</pre>`;
    }
  });

  text = text.replace(/(^|[^\\])\$([^\n$]+?)\$/g, (_m, prefix: string, expr: string) => {
    try {
      return `${prefix}${katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false })}`;
    } catch {
      return `${prefix}$${expr}$`;
    }
  });

  return text.replace(/@@FENCE(\d+)@@/g, (_m, i: string) => fences[Number(i)] ?? '');
}

// Configure marked once
marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = (lang || '').trim().toLowerCase();
      if (language === 'mermaid') {
        const id = `mmd-${Math.random().toString(36).slice(2, 10)}`;
        const escaped = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<div class="mermaid-src" data-mermaid-id="${id}">${escaped}</div>\n`;
      }
      const hlLang = language && hljs.getLanguage(language) ? language : 'plaintext';
      const highlighted = hljs.highlight(text, { language: hlLang }).value;
      return `<pre><code class="hljs language-${hlLang}">${highlighted}</code></pre>\n`;
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

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  filePath,
  scrollPercent,
  onPreviewScroll,
  scrollToLine,
}) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const lastNavTokenRef = useRef<number | null>(null);
  const applyingScrollRef = useRef(false);
  const [html, setHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const withMath = await renderMathInMarkdown(content);
      if (cancelled) return;
      const rawHtml = marked.parse(withMath, { async: false }) as string;
      const withLocalMedia = rewriteHtmlImageSources(rawHtml, filePath);
      const safe = DOMPurify.sanitize(withLocalMedia, {
        ADD_TAGS: ['div'],
        ADD_ATTR: [
          'target',
          'rel',
          'id',
          'data-line-hint',
          'data-original-src',
          'data-mermaid-id',
          'class',
          'width',
          'height',
          'align',
        ],
      });
      if (!cancelled) setHtml(safe);
    })();
    return () => {
      cancelled = true;
    };
  }, [content, filePath]);

  // Lazy mermaid render
  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>('.mermaid-src');
    if (!nodes.length && !hasMermaid(content)) return;

    let cancelled = false;
    void (async () => {
      if (!nodes.length) return;
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: 'inherit',
      });
      for (const node of Array.from(nodes)) {
        if (cancelled) return;
        if (node.dataset.rendered === '1') continue;
        const source = node.textContent || '';
        const id = node.dataset.mermaidId || `mmd-${Math.random().toString(36).slice(2)}`;
        try {
          const { svg } = await mermaid.render(id, source);
          if (cancelled) return;
          node.innerHTML = svg;
          node.dataset.rendered = '1';
          node.classList.add('mermaid-rendered');
        } catch (err) {
          node.innerHTML = `<pre class="mermaid-error">Mermaid 渲染失败: ${String(err)}</pre>`;
          node.dataset.rendered = '1';
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [html, content]);

  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest('a') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) return;
      e.preventDefault();
      void openUrl(href).catch(() => {
        window.open(href, '_blank', 'noopener,noreferrer');
      });
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [html]);

  useEffect(() => {
    if (scrollPercent === undefined || !previewRef.current) return;
    applyingScrollRef.current = true;
    const el = previewRef.current;
    const maxScroll = el.scrollHeight - el.clientHeight;
    el.scrollTop = Math.round(scrollPercent * maxScroll);
    requestAnimationFrame(() => {
      applyingScrollRef.current = false;
    });
  }, [scrollPercent]);

  useEffect(() => {
    if (!scrollToLine || !previewRef.current) return;
    if (lastNavTokenRef.current === scrollToLine.token) return;
    lastNavTokenRef.current = scrollToLine.token;

    const root = previewRef.current;
    const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const lines = content.split('\n');
    let headingIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,6}\s+/.test(lines[i])) {
        headingIndex += 1;
        if (i + 1 === scrollToLine.line) {
          const el = headings[headingIndex] as HTMLElement | undefined;
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
    }
    const ratio = Math.min(Math.max((scrollToLine.line - 1) / Math.max(lines.length, 1), 0), 1);
    const maxScroll = root.scrollHeight - root.clientHeight;
    root.scrollTop = Math.round(ratio * maxScroll);
  }, [scrollToLine, content]);

  const handlePreviewScroll = () => {
    if (applyingScrollRef.current) return;
    if (onPreviewScroll && previewRef.current) {
      const el = previewRef.current;
      const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 1);
      const percent = Math.min(Math.max(el.scrollTop / maxScroll, 0), 1);
      onPreviewScroll(percent);
    }
  };

  return (
    <div className="markdown-preview" ref={previewRef} onScroll={handlePreviewScroll}>
      <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

export default MarkdownPreview;
