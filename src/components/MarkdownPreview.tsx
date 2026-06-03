import React, { useMemo, useRef, useEffect } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
import './MarkdownPreview.css';

interface MarkdownPreviewProps {
  content: string;
  scrollPercent?: number;
  onPreviewScroll?: (percent: number) => void;
}

// Configure marked with GFM (tables, task lists, strikethrough) + code highlight
marked.setOptions({
  gfm: true,
  breaks: false,
  highlight: function (code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch {
        // fall through to auto-detect
      }
    }
    // auto-detect language
    try {
      return hljs.highlightAuto(code).value;
    } catch {
      return code;
    }
  },
});

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  scrollPercent,
  onPreviewScroll,
}) => {
  const previewRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    const rawHtml = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['target', 'rel'],
      ADD_TAGS: ['iframe'], // allow sanitized iframes if needed
    });
  }, [content]);

  // Sync scroll: when editor scrolls, preview follows
  useEffect(() => {
    if (scrollPercent !== undefined && previewRef.current) {
      const el = previewRef.current;
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.round(scrollPercent * maxScroll);
    }
  }, [scrollPercent]);

  // Report scroll back when user scrolls the preview
  const handlePreviewScroll = () => {
    if (onPreviewScroll && previewRef.current) {
      const el = previewRef.current;
      const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 1);
      const percent = Math.min(Math.max(el.scrollTop / maxScroll, 0), 1);
      onPreviewScroll(percent);
    }
  };

  return (
    <div
      className="markdown-preview"
      ref={previewRef}
      onScroll={handlePreviewScroll}
    >
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};

export default MarkdownPreview;
