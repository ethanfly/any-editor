import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentWindow, type Window } from '@tauri-apps/api/window';
import './TitleBar.css';

interface TitleBarProps {
  fileName: string | null;
  isModified: boolean;
  autoSaveEnabled?: boolean;
}

function getAppWindow(): Window | null {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

const TitleBar: React.FC<TitleBarProps> = ({ fileName, isModified, autoSaveEnabled = false }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  const windowTitle = useMemo(() => {
    const documentTitle = fileName ? `${isModified ? '* ' : ''}${fileName}` : 'READY';
    return `${documentTitle} · Any Editor`;
  }, [fileName, isModified]);

  useEffect(() => {
    document.title = windowTitle;
  }, [windowTitle]);

  const syncMaximized = useCallback(async () => {
    const appWindow = getAppWindow();
    if (!appWindow) return;

    try {
      setIsMaximized(await appWindow.isMaximized());
    } catch {
      setIsMaximized(false);
    }
  }, []);

  useEffect(() => {
    const appWindow = getAppWindow();
    if (!appWindow) return;

    let unlistenResize: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;
    let active = true;

    // Initial sync is async external state (window manager), not React render state.
    void appWindow.isMaximized()
      .then((value) => {
        if (active) setIsMaximized(value);
      })
      .catch(() => {
        if (active) setIsMaximized(false);
      });

    void appWindow
      .onResized(() => {
        void syncMaximized();
      })
      .then((fn) => {
        unlistenResize = fn;
      })
      .catch(() => undefined);

    void appWindow
      .onFocusChanged(() => {
        void syncMaximized();
      })
      .then((fn) => {
        unlistenFocus = fn;
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unlistenResize?.();
      unlistenFocus?.();
    };
  }, [syncMaximized]);

  const handleDrag = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const appWindow = getAppWindow();
    if (appWindow && event.button === 0 && event.detail === 1) {
      void appWindow.startDragging().catch(() => undefined);
    }
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    const appWindow = getAppWindow();
    if (!appWindow) return;

    try {
      await appWindow.toggleMaximize();
      await syncMaximized();
    } catch {
      setIsMaximized((value) => !value);
    }
  }, [syncMaximized]);

  const handleMinimize = useCallback(() => {
    const appWindow = getAppWindow();
    void appWindow?.minimize().catch(() => undefined);
  }, []);

  const handleClose = useCallback(() => {
    // Prefer close() so App's onCloseRequested guard can run
    const appWindow = getAppWindow();
    void appWindow?.close().catch(() => undefined);
  }, []);

  return (
    <div className="title-bar">
      <div
        className="title-drag-region"
        onMouseDown={handleDrag}
        onDoubleClick={() => {
          void handleToggleMaximize();
        }}
        role="presentation"
      >
        <div className="title-brand" aria-label="Any Editor">
          <span className="title-logo">
            <img src="/favicon.svg" alt="" />
          </span>
          <span className="title-name">ANY EDITOR</span>
        </div>
        <div className="title-document">
          <span className="title-document-text">{windowTitle}</span>
          {autoSaveEnabled && <span className="title-autosave-badge">自动保存</span>}
        </div>
        <div className="title-leds" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="window-controls">
        <button type="button" className="window-control" onClick={handleMinimize} aria-label="最小化">
          _
        </button>
        <button
          type="button"
          className="window-control"
          onClick={() => {
            void handleToggleMaximize();
          }}
          aria-label={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? '▣' : '□'}
        </button>
        <button type="button" className="window-control close" onClick={handleClose} aria-label="关闭">
          ×
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
