/**
 * Markdown WYSIWYG — thin adapter over horseMD's Milkdown Crepe Editor.
 * Core engine / plugins live in `src/md-editor/` (ported from horseMD).
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import HorseMdEditor from '../md-editor/components/Editor.jsx';
import type { HorseMdEditorApi } from '../md-editor/components/Editor';
import { MdEditorI18n } from '../md-editor/i18n-bridge';
import { ensureMdEditorPlatform } from '../md-editor/platform';
import '../styles/markdownDoc.css';
import '../md-editor/styles/theme-bridge.css';
import '../md-editor/styles/md-editor.css';
import './WysiwygEditor.css';

export type WysiwygEditorApi = HorseMdEditorApi;

interface WysiwygEditorProps {
  content: string;
  filePath?: string;
  onContentChange: (markdown: string) => void;
  scrollToLine?: { line: number; token: number } | null;
  onPasteImage?: (file: File) => Promise<string | null>;
  readOnly?: boolean;
  /** Matches Monaco / settings.fontSize */
  fontSize?: number;
  /** Expose Crepe editor API (setBlock / applyTextFormat / …) to App toolbar */
  onApiReady?: (api: WysiwygEditorApi | null) => void;
}

declare global {
  interface Window {
    __anyEditorConvertFileSrc?: (absPath: string) => string;
  }
}

function parentDir(filePath: string): string {
  const n = filePath.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i >= 0 ? filePath.slice(0, i + 1).replace(/[/\\]+$/, '') || filePath : filePath;
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/';
  return `${dir.replace(/[/\\]+$/, '')}${sep}${name}`;
}

const normalizeMd = (s: string) => s.replace(/\r\n/g, '\n');

const WysiwygEditor: React.FC<WysiwygEditorProps> = ({
  content,
  filePath,
  onContentChange,
  scrollToLine,
  onPasteImage,
  readOnly = false,
  fontSize,
  onApiReady,
}) => {
  const apiRef = useRef<WysiwygEditorApi | null>(null);
  const lastNavTokenRef = useRef<number | null>(null);
  const onPasteImageRef = useRef(onPasteImage);
  onPasteImageRef.current = onPasteImage;
  const onApiReadyRef = useRef(onApiReady);
  onApiReadyRef.current = onApiReady;
  const contentRef = useRef(content);
  contentRef.current = content;
  const lastEmittedRef = useRef(content);
  // Sync external content updates (history restore, etc.) without remounting.
  // Compare normalized newlines so trivial EOL diffs don't wipe the caret.
  useEffect(() => {
    if (normalizeMd(content) === normalizeMd(lastEmittedRef.current)) {
      lastEmittedRef.current = content;
      return;
    }
    const api = apiRef.current;
    if (api?.replaceMarkdown) {
      api.replaceMarkdown(content);
      lastEmittedRef.current = content;
      return;
    }
    // Before ready: only update baseline; initialContent was already used at create.
    lastEmittedRef.current = content;
  }, [content]);

  useEffect(() => {
    return () => {
      onApiReadyRef.current?.(null);
    };
  }, []);

  // Install Tauri platform bridge + convertFileSrc for relative images
  useEffect(() => {
    window.__anyEditorConvertFileSrc = (absPath: string) => {
      try {
        return convertFileSrc(absPath);
      } catch {
        return absPath;
      }
    };

    ensureMdEditorPlatform({
      saveImage: async (docPath, name, bytes) => {
        // Prefer app-level paste handler (assets/ relative path)
        const file = new File([bytes as BlobPart], name, { type: 'application/octet-stream' });
        const custom = onPasteImageRef.current;
        if (custom) {
          const rel = await custom(file);
          if (rel) return { ok: true, path: rel };
        }
        // Fallback: write next to document under assets/
        try {
          if (!docPath) return { ok: false, error: 'no doc path' };
          const absDir = joinPath(parentDir(docPath), 'assets');
          const absPath = joinPath(absDir, name);
          await invoke('write_file_bytes', {
            path: absPath,
            contents: Array.from(bytes),
          });
          return { ok: true, path: `assets/${name}`.replace(/\\/g, '/') };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      },
    });

    return () => {
      delete window.__anyEditorConvertFileSrc;
    };
  }, []);

  // Outline / jump-to-line from App
  useEffect(() => {
    if (!scrollToLine) return;
    if (lastNavTokenRef.current === scrollToLine.token) return;
    lastNavTokenRef.current = scrollToLine.token;
    const api = apiRef.current;
    if (api?.jumpToLine) {
      api.jumpToLine(scrollToLine.line);
      return;
    }
    // Fallback: heading-index scroll inside editor host
    const host = document.querySelector('.wysiwyg-crepe .editor-host .ProseMirror');
    if (!host) return;
    const headings = host.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const lines = contentRef.current.split('\n');
    let headingIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,6}\s+/.test(lines[i])) {
        headingIndex += 1;
        if (i + 1 === scrollToLine.line) {
          (headings[headingIndex] as HTMLElement | undefined)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          return;
        }
      }
    }
  }, [scrollToLine]);

  const handleChange = useCallback(
    (md: string) => {
      lastEmittedRef.current = md;
      onContentChange(md);
    },
    [onContentChange]
  );

  const handleReady = useCallback((api: WysiwygEditorApi | null) => {
    apiRef.current = api;
    onApiReadyRef.current?.(api);
  }, []);

  // Remount when the open file path changes; content is initial only inside Crepe.
  const editorKey = useMemo(
    () => filePath || 'untitled-md',
    [filePath]
  );

  const shellStyle = useMemo(
    () =>
      fontSize
        ? ({ '--editor-font-size': `${fontSize}px` } as React.CSSProperties)
        : undefined,
    [fontSize]
  );

  return (
    <div className="wysiwyg-editor wysiwyg-crepe" style={shellStyle} data-theme-aware>
      <div className="editor-scroll">
        <MdEditorI18n>
          <HorseMdEditor
            key={editorKey}
            initialContent={content}
            docPath={filePath}
            spellcheck
            selectionToolbar
            readOnly={readOnly}
            onChange={handleChange}
            onReady={handleReady}
          />
        </MdEditorI18n>
      </div>
    </div>
  );
};

export default WysiwygEditor;
