import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import './PDFPreview.css';

// Offline worker — avoid CDN dependency
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PDFPreviewProps {
  filePath: string;
}

type FitMode = 'custom' | 'width' | 'page' | 'actual';

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 0.1;

function clampScale(value: number): number {
  const stepped = Math.round(value / SCALE_STEP) * SCALE_STEP;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(stepped.toFixed(2))));
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ filePath }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const renderGenRef = useRef(0);
  const dragRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const scaleRef = useRef(1);
  const pageRefNum = useRef(1);
  const wheelLockRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [pageInput, setPageInput] = useState('1');
  const [dragging, setDragging] = useState(false);
  const [rendering, setRendering] = useState(false);

  scaleRef.current = scale;
  pageRefNum.current = currentPage;

  const cancelRender = useCallback(() => {
    try {
      renderTaskRef.current?.cancel();
    } catch {
      // ignore cancel races
    }
    renderTaskRef.current = null;
  }, []);

  /** Compute scale for fit-width / fit-page against stage size. */
  const computeFitScale = useCallback(async (mode: Exclude<FitMode, 'custom' | 'actual'>) => {
    const pdf = pdfDocRef.current;
    const stage = stageRef.current;
    if (!pdf || !stage) return null;

    const page = pageRef.current ?? (await pdf.getPage(pageRefNum.current));
    pageRef.current = page;
    const base = page.getViewport({ scale: 1 });
    const pad = 32;
    const availW = Math.max(120, stage.clientWidth - pad);
    const availH = Math.max(120, stage.clientHeight - pad);

    if (mode === 'width') return clampScale(availW / base.width);
    return clampScale(Math.min(availW / base.width, availH / base.height));
  }, []);

  const renderPage = useCallback(
    async (pageNum: number, scaleValue: number) => {
      const pdf = pdfDocRef.current;
      const canvas = canvasRef.current;
      if (!pdf || !canvas) return;

      const gen = ++renderGenRef.current;
      cancelRender();
      setRendering(true);

      try {
        if (!pageRef.current || pageRef.current.pageNumber !== pageNum) {
          pageRef.current = await pdf.getPage(pageNum);
        }
        const page = pageRef.current;
        if (gen !== renderGenRef.current) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scaleValue });
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, viewport.width, viewport.height);

        const task = page.render({
          canvasContext: context,
          viewport,
          canvas,
        });
        renderTaskRef.current = task;
        await task.promise;
        if (gen !== renderGenRef.current) return;
      } catch (err: unknown) {
        const msg = String(err);
        if (!msg.toLowerCase().includes('cancel') && gen === renderGenRef.current) {
          setError(`无法渲染页面: ${msg}`);
        }
      } finally {
        if (gen === renderGenRef.current) setRendering(false);
      }
    },
    [cancelRender]
  );

  // Load document once per path
  useEffect(() => {
    let cancelled = false;

    async function loadPDF() {
      setLoading(true);
      setError(null);
      setNumPages(0);
      setCurrentPage(1);
      setPageInput('1');
      setFitMode('width');
      setScale(1);
      pageRef.current = null;

      const previous = pdfDocRef.current;
      pdfDocRef.current = null;
      if (previous) {
        try {
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
      cancelRender();
      pageRef.current = null;
      const doc = pdfDocRef.current;
      pdfDocRef.current = null;
      if (doc) void doc.cleanup().catch(() => undefined);
    };
  }, [filePath, cancelRender]);

  // Apply fit mode when ready / resized
  useEffect(() => {
    if (loading || error || !pdfDocRef.current) return;
    if (fitMode === 'custom') return;

    let cancelled = false;
    void (async () => {
      if (fitMode === 'actual') {
        if (!cancelled) setScale(1);
        return;
      }
      const next = await computeFitScale(fitMode);
      if (!cancelled && next != null) setScale(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [fitMode, loading, error, currentPage, numPages, computeFitScale, filePath]);

  // Re-render on page / scale
  useEffect(() => {
    if (loading || error || !pdfDocRef.current) return;
    void renderPage(currentPage, scale);
  }, [currentPage, scale, loading, error, renderPage, filePath]);

  // Keep page input in sync
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // ResizeObserver: re-fit when stage size changes
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || loading || error) return;
    if (fitMode !== 'width' && fitMode !== 'page') return;

    let timer: number | null = null;
    const ro = new ResizeObserver(() => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void (async () => {
          const next = await computeFitScale(fitMode);
          if (next != null && Math.abs(next - scaleRef.current) > 0.01) setScale(next);
        })();
      }, 80);
    });
    ro.observe(stage);
    return () => {
      ro.disconnect();
      if (timer != null) window.clearTimeout(timer);
    };
  }, [fitMode, loading, error, computeFitScale]);

  const goToPage = useCallback(
    (page: number, opts?: { resetScroll?: boolean }) => {
      if (!numPages) return;
      const next = Math.min(numPages, Math.max(1, Math.floor(page)));
      setCurrentPage(next);
      if (opts?.resetScroll !== false) {
        const stage = stageRef.current;
        if (stage) {
          stage.scrollLeft = 0;
          stage.scrollTop = 0;
        }
      }
    },
    [numPages]
  );

  const zoomBy = useCallback((delta: number) => {
    setFitMode('custom');
    setScale((s) => clampScale(s + delta));
  }, []);

  const zoomTo = useCallback((value: number) => {
    setFitMode('custom');
    setScale(clampScale(value));
  }, []);

  // Keyboard: page / zoom (scoped when root focused or pointer over)
  useEffect(() => {
    if (loading || error) return;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        // allow typing in page input except arrows when we handle commit separately
        if (target.classList.contains('pdf-page-input')) {
          if (e.key === 'Enter') {
            e.preventDefault();
            const n = Number.parseInt(pageInput, 10);
            if (!Number.isNaN(n)) goToPage(n);
          }
        }
        return;
      }

      const stage = stageRef.current;
      const key = e.key;

      if (key === 'ArrowLeft' || key === 'PageUp') {
        e.preventDefault();
        goToPage(pageRefNum.current - 1);
        return;
      }
      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') {
        e.preventDefault();
        goToPage(pageRefNum.current + 1);
        return;
      }
      if (key === 'Home') {
        e.preventDefault();
        goToPage(1);
        return;
      }
      if (key === 'End') {
        e.preventDefault();
        goToPage(numPages);
        return;
      }
      if (key === 'ArrowUp' && stage) {
        if (stage.scrollTop <= 0) {
          e.preventDefault();
          goToPage(pageRefNum.current - 1);
        }
        return;
      }
      if (key === 'ArrowDown' && stage) {
        const maxTop = stage.scrollHeight - stage.clientHeight;
        if (stage.scrollTop >= maxTop - 1) {
          e.preventDefault();
          goToPage(pageRefNum.current + 1);
        }
        return;
      }
      if ((key === '+' || key === '=') && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
        e.preventDefault();
        zoomBy(SCALE_STEP);
        return;
      }
      if (key === '-' || key === '_') {
        if (e.ctrlKey || e.metaKey || key === '-') {
          e.preventDefault();
          zoomBy(-SCALE_STEP);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, error, numPages, goToPage, zoomBy, pageInput]);

  // Wheel: Ctrl/Meta = zoom; else edge-flip pages (WPS-like)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || loading || error) return;

    const onWheel = (e: WheelEvent) => {
      // Ctrl / ⌘ + wheel → zoom (WPS / browser PDF)
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
        zoomBy(delta);
        return;
      }

      // Horizontal scroll / trackpad pinch-ish: let browser handle mostly
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const maxTop = Math.max(0, stage.scrollHeight - stage.clientHeight);
      const atTop = stage.scrollTop <= 1;
      const atBottom = stage.scrollTop >= maxTop - 1;
      const canScroll = maxTop > 2;

      // When page fits (no scroll), wheel flips pages
      if (!canScroll) {
        e.preventDefault();
        if (wheelLockRef.current) return;
        if (e.deltaY > 8) {
          wheelLockRef.current = true;
          goToPage(pageRefNum.current + 1);
          window.setTimeout(() => {
            wheelLockRef.current = false;
          }, 180);
        } else if (e.deltaY < -8) {
          wheelLockRef.current = true;
          goToPage(pageRefNum.current - 1);
          window.setTimeout(() => {
            wheelLockRef.current = false;
          }, 180);
        }
        return;
      }

      // When zoomed/scrollable: flip only past edges (WPS continuous feel)
      if (e.deltaY > 0 && atBottom) {
        e.preventDefault();
        if (wheelLockRef.current) return;
        if (pageRefNum.current < numPages) {
          wheelLockRef.current = true;
          goToPage(pageRefNum.current + 1);
          window.setTimeout(() => {
            wheelLockRef.current = false;
          }, 200);
        }
      } else if (e.deltaY < 0 && atTop) {
        e.preventDefault();
        if (wheelLockRef.current) return;
        if (pageRefNum.current > 1) {
          wheelLockRef.current = true;
          goToPage(pageRefNum.current - 1);
          window.setTimeout(() => {
            wheelLockRef.current = false;
          }, 200);
        }
      }
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [loading, error, numPages, goToPage, zoomBy]);

  // Drag to pan (left button / touch)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || loading || error) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      // Don't start drag from toolbar (stage only)
      const maxScrollX = stage.scrollWidth - stage.clientWidth;
      const maxScrollY = stage.scrollHeight - stage.clientHeight;
      if (maxScrollX <= 0 && maxScrollY <= 0) return;

      dragRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
      };
      setDragging(true);
      stage.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      stage.scrollLeft = d.scrollLeft - dx;
      stage.scrollTop = d.scrollTop - dy;
    };

    const endDrag = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || (d.pointerId != null && d.pointerId !== e.pointerId)) return;
      d.active = false;
      d.pointerId = null;
      setDragging(false);
      try {
        stage.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    return () => {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', endDrag);
      stage.removeEventListener('pointercancel', endDrag);
    };
  }, [loading, error, scale, currentPage]);

  const commitPageInput = () => {
    const n = Number.parseInt(pageInput, 10);
    if (Number.isNaN(n)) {
      setPageInput(String(currentPage));
      return;
    }
    goToPage(n);
  };

  return (
    <div className="pdf-preview" ref={rootRef} tabIndex={0}>
      {loading && (
        <div className="pdf-loading">
          <div className="pdf-spinner" />
          <span>正在加载 PDF...</span>
        </div>
      )}
      {error && (
        <div className="pdf-error">
          <span className="pdf-error-mark">!</span>
          <span>{error}</span>
        </div>
      )}
      {!loading && !error && (
        <>
          <div className="pdf-toolbar" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pdf-toolbar-btn"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              title="上一页 (← / PageUp)"
            >
              ‹
            </button>

            <div className="pdf-page-jump">
              <input
                className="pdf-page-input"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={commitPageInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitPageInput();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                aria-label="页码"
              />
              <span className="pdf-page-total">/ {numPages}</span>
            </div>

            <button
              type="button"
              className="pdf-toolbar-btn"
              disabled={currentPage >= numPages}
              onClick={() => goToPage(currentPage + 1)}
              title="下一页 (→ / PageDown / Space)"
            >
              ›
            </button>

            <span className="pdf-toolbar-spacer" />

            <button
              type="button"
              className="pdf-toolbar-btn"
              onClick={() => zoomBy(-SCALE_STEP)}
              title="缩小 (− / Ctrl+滚轮)"
            >
              −
            </button>
            <button
              type="button"
              className="pdf-toolbar-btn pdf-scale-info"
              onClick={() => {
                setFitMode('actual');
                zoomTo(1);
              }}
              title="重置为 100%"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              className="pdf-toolbar-btn"
              onClick={() => zoomBy(SCALE_STEP)}
              title="放大 (+ / Ctrl+滚轮)"
            >
              +
            </button>

            <button
              type="button"
              className={`pdf-toolbar-btn ${fitMode === 'width' ? 'active' : ''}`}
              onClick={() => setFitMode('width')}
              title="适合宽度"
            >
              适宽
            </button>
            <button
              type="button"
              className={`pdf-toolbar-btn ${fitMode === 'page' ? 'active' : ''}`}
              onClick={() => setFitMode('page')}
              title="适合页面"
            >
              整页
            </button>
            <button
              type="button"
              className={`pdf-toolbar-btn ${fitMode === 'actual' ? 'active' : ''}`}
              onClick={() => {
                setFitMode('actual');
                zoomTo(1);
              }}
              title="实际大小 100%"
            >
              100%
            </button>

            {rendering && <span className="pdf-rendering-dot" title="渲染中" />}
          </div>

          <div
            className={`pdf-stage ${dragging ? 'dragging' : ''}`}
            ref={stageRef}
            title="拖动平移 · 滚轮翻页 · Ctrl+滚轮缩放"
          >
            <div className="pdf-page-sheet">
              <canvas ref={canvasRef} className="pdf-canvas" />
            </div>
          </div>

          <div className="pdf-hint">
            滚轮翻页 · Ctrl+滚轮缩放 · 拖动平移 · ←/→ 翻页
          </div>
        </>
      )}
    </div>
  );
};

export default PDFPreview;
