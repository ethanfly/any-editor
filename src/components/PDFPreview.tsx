import React, { useEffect, useRef, useState } from 'react';
import './PDFPreview.css';

interface PDFPreviewProps {
  filePath: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ filePath }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;

    async function loadPDF() {
      setLoading(true);
      setError(null);
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

        // Read the PDF file as bytes via Tauri
        const { invoke } = await import('@tauri-apps/api/core');
        const bytes = await invoke<number[]>('read_file_bytes', { path: filePath });
        const uint8Array = new Uint8Array(bytes);

        const loadingTask = pdfjs.getDocument({ data: uint8Array });
        pdfDoc = await loadingTask.promise;

        if (cancelled) return;

        setNumPages(pdfDoc.numPages);
        setCurrentPage(1);
        renderPage(pdfDoc, 1);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(`无法加载 PDF: ${err.message}`);
          setLoading(false);
        }
      }
    }

    async function renderPage(pdf: any, pageNum: number) {
      if (!containerRef.current) return;
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Clear container
        containerRef.current!.innerHTML = '';
        containerRef.current!.appendChild(canvas);

        await page.render({
          canvas,
          viewport: viewport,
        }).promise;
      } catch (err: any) {
        console.error('Failed to render page:', err);
      }
    }

    loadPDF();

    return () => {
      cancelled = true;
    };
  }, [filePath, scale]);

  useEffect(() => {
    if (numPages > 0) {
      const loadAndRender = async () => {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

        const { invoke } = await import('@tauri-apps/api/core');
        const bytes = await invoke<number[]>('read_file_bytes', { path: filePath });
        const uint8Array = new Uint8Array(bytes);

        const pdfDoc = await pdfjs.getDocument({ data: uint8Array }).promise;
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale });

        if (containerRef.current) {
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            containerRef.current.innerHTML = '';
            containerRef.current.appendChild(canvas);
            await page.render({ canvas, viewport }).promise;
          }
        }
      };
      loadAndRender();
    }
  }, [currentPage, scale, filePath, numPages]);

  return (
    <div className="pdf-preview">
      {loading && (
        <div className="pdf-loading">
          <div className="pdf-spinner" />
          <p>加载 PDF 中...</p>
        </div>
      )}
      {error && (
        <div className="pdf-error">
          <span className="pdf-error-mark">!</span>
          <p>{error}</p>
        </div>
      )}
      {!loading && !error && (
        <>
          <div className="pdf-toolbar">
            <button
              className="pdf-toolbar-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              ◀
            </button>
            <span className="pdf-page-info">
              {currentPage} / {numPages}
            </span>
            <button
              className="pdf-toolbar-btn"
              disabled={currentPage >= numPages}
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            >
              ▶
            </button>
            <div className="pdf-toolbar-spacer" />
            <button
              className="pdf-toolbar-btn"
              onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
            >
              −
            </button>
            <span className="pdf-scale-info">{Math.round(scale * 100)}%</span>
            <button
              className="pdf-toolbar-btn"
              onClick={() => setScale((s) => Math.min(3, s + 0.2))}
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
