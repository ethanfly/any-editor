import React, { useCallback, useMemo, useState } from 'react';
import { getCurrentWindow, type Window } from '@tauri-apps/api/window';
import './TitleBar.css';

interface TitleBarProps {
  fileName: string | null;
  isModified: boolean;
}

function getAppWindow(): Window | null {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

const TitleBar: React.FC<TitleBarProps> = ({ fileName, isModified }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  const windowTitle = useMemo(() => {
    const documentTitle = fileName ? `${isModified ? '* ' : ''}${fileName}` : 'READY';
    return `${documentTitle} · Any Editor`;
  }, [fileName, isModified]);

  const syncMaximized = useCallback(async () => {
    const appWindow = getAppWindow();
    if (!appWindow) return;

    try {
      setIsMaximized(await appWindow.isMaximized());
    } catch {
      setIsMaximized(false);
    }
  }, []);

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
    const appWindow = getAppWindow();
    void appWindow?.close().catch(() => undefined);
  }, []);

  return (
    <div className="title-bar">
      <div
        className="title-drag-region"
        onMouseDown={handleDrag}
        onDoubleClick={handleToggleMaximize}
        role="presentation"
      >
        <div className="title-brand" aria-label="Any Editor">
          <span className="title-logo">AE</span>
          <span className="title-name">ANY EDITOR</span>
        </div>
        <div className="title-document">{windowTitle}</div>
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
        <button type="button" className="window-control" onClick={handleToggleMaximize} aria-label={isMaximized ? '还原' : '最大化'}>
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
