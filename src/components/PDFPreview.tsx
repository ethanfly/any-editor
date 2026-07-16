import React, { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import './PDFPreview.css';

// Offline worker — avoid CDN dependency
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PDFPreviewProps {
  filePath: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ filePath }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);

  const renderPage = useCallback(async (pageNum: number, scaleValue: number) => {
    const pdf = pdfDocRef.current;
    const container = containerRef.current;
    if (!pdf || !container) return;

    try {
      try {
        renderTaskRef.current?.cancel();
      } catch {
        // ignore cancel errors
      }

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: scaleValue });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      container.innerHTML = '';
      container.appendChild(canvas);

      const task = page.render({
        canvasContext: context,
        viewport,
        canvas,
      });
      renderTaskRef.current = task;
      await task.promise;
    } catch (err: unknown) {
      const msg = String(err);
      if (!msg.toLowerCase().includes('cancel')) {
        setError(`无法渲染页面: ${msg}`);
      }
    }
  }, []);

  // Load document once per filePath
  useEffect(() => {
    let cancelled = false;

    async function loadPDF() {
      setLoading(true);
      setError(null);
      setNumPages(0);
      setCurrentPage(1);

      const previous = pdfDocRef.current;
      pdfDocRef.current = null;
      if (previous) {
        try {
          // pdfjs cleanup: cleanup() releases resources; destroy may not exist on all versions
          await previous.cleanup();
        } catch {
          // ignore
        }
      }

      try {
        const bytes = await invoke<number[]>('read_file_bytes', { path: filePath });
        if (cancelled) return;

        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) {
          await pdfDoc.cleanup();
          return;
        }

        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);
        setLoading(false);
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(`无法加载 PDF: ${message}`);
          setLoading(false);
        }
      }
    }

    void loadPDF();

    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel();
      } catch {
        // ignore
      }
      const doc = pdfDocRef.current;
      pdfDocRef.current = null;
      if (doc) {
        void doc.cleanup().catch(() => undefined);
      }
    };
  }, [filePath]);

  // Re-render on page / scale change without reloading bytes
  useEffect(() => {
    if (!pdfDocRef.current || loading || error) return;
    void renderPage(currentPage, scale);
  }, [currentPage, scale, loading, error, renderPage, filePath]);

  // Keyboard navigation while PDF is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentPage((p) => Math.max(1, p - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        setCurrentPage((p) => Math.min(numPages || p, p + 1));
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(3, Math.round((s + 0.1) * 10) / 10));
      } else if (e.key === '-') {
        setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numPages]);

  return (
    <div className="pdf-preview">
      {loading && (
        <div className="pdf-loading">
          <div className="pdf-spinner" />
          <span>正在加载 PDF...</span>
        </div>
      )}
      {error && (
        <div className="pdf-error">
          <span>{error}</span>
        </div>
      )}
      {!loading && !error && (
        <>
          <div className="pdf-toolbar">
            <button
              type="button"
              className="pdf-toolbar-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              title="上一页"
            >
              ‹
            </button>
            <span className="pdf-page-info">
              {currentPage} / {numPages}
            </span>
            <button
              type="button"
              className="pdf-toolbar-btn"
              disabled={currentPage >= numPages}
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              title="下一页"
            >
              ›
            </button>
            <span className="pdf-toolbar-spacer" />
            <button
              type="button"
              className="pdf-toolbar-btn"
              onClick={() => setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))}
              title="缩小"
            >
              −
            </button>
            <span className="pdf-scale-info">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              className="pdf-toolbar-btn"
              onClick={() => setScale((s) => Math.min(3, Math.round((s + 0.1) * 10) / 10))}
              title="放大"
            >
              +
            </button>
          </div>
          <div className="pdf-canvas-container" ref={containerRef} />
        </>
      )}
    </div>
  );
};

export default PDFPreview;
