import { useRef, useEffect, useState } from 'react';
import type { ScrollToLine } from '../types';
import { renderMarkdownDocument } from '../utils/markdownRender';
import { hasMermaidDiagram, renderMermaidInRoot } from '../utils/mermaidDiagram';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import '../styles/markdownDoc.css';
import './MarkdownPreview.css';

interface MarkdownPreviewProps {
  content: string;
  filePath?: string;
  scrollPercent?: number;
  onPreviewScroll?: (percent: number) => void;
  scrollToLine?: ScrollToLine;
}

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
      const safe = await renderMarkdownDocument(content, { filePath });
      if (!cancelled) setHtml(safe);
    })();
    return () => {
      cancelled = true;
    };
  }, [content, filePath]);

  // Lazy mermaid render after HTML is in the DOM
  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;
    const hasNodes = root.querySelector('.mermaid-src, .md-mermaid-canvas');
    if (!hasNodes && !hasMermaidDiagram(content)) return;

    const signal = { cancelled: false };
    void renderMermaidInRoot(root, { signal });
    return () => {
      signal.cancelled = true;
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
      <div className="markdown-body md-doc" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

export default MarkdownPreview;
