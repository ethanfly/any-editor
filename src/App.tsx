import React, { useState, useCallback, useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import FileTree from './components/FileTree';
import TabBar from './components/TabBar';
import TitleBar from './components/TitleBar';
import Toolbar from './components/Toolbar';
import EditorPane from './components/EditorPane';
import MarkdownPreview from './components/MarkdownPreview';
import PDFPreview from './components/PDFPreview';
import Outline from './components/Outline';
import type { OpenTab, ViewMode } from './types';
import { MARKDOWN_EXTENSIONS } from './types';
import './App.css';

interface InitialOpenPath {
  path: string;
  is_dir: boolean;
  parent_path?: string;
}

const App: React.FC = () => {
  const [rootPath, setRootPath] = useState<string>('');
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('code');
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [currentLine, setCurrentLine] = useState(1);
  const [refreshKey] = useState(0);
  const [statusMessage, setStatusMessage] = useState('就绪');
  const didHandleInitialOpen = useRef(false);

  const activeTab = tabs.find((t) => t.path === activeTabPath) || null;
  const isMarkdown = activeTab
    ? MARKDOWN_EXTENSIONS.has(activeTab.extension)
    : false;
  const isPDF = activeTab?.extension === 'pdf';

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o' && !e.shiftKey) {
        e.preventDefault();
        handleOpenFolder();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o' && e.shiftKey) {
        e.preventDefault();
        handleOpenFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabPath]);

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择文件夹',
      });
      if (selected && typeof selected === 'string') {
        setRootPath(selected);
        setStatusMessage(`已打开文件夹: ${selected}`);
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  };

  const handleOpenFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: '选择文件',
        filters: [
          {
            name: '所有文件',
            extensions: ['*'],
          },
        ],
      });
      if (selected && typeof selected === 'string') {
        openFile(selected);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  const openFile = useCallback(
    async (filePath: string) => {
      try {
        // Check if already open
        const existingTab = tabs.find((t) => t.path === filePath);
        if (existingTab) {
          setActiveTabPath(filePath);
          return;
        }

        const pathParts = filePath.replace(/\\/g, '/').split('/');
        const name = pathParts[pathParts.length - 1];
        const ext = name.split('.').pop()?.toLowerCase() || '';

        // Check if it's a PDF
        if (ext === 'pdf') {
          const newTab: OpenTab = {
            path: filePath,
            name,
            extension: ext,
            content: '',
            isModified: false,
            isBinary: true,
          };
          setTabs((prev) => [...prev, newTab]);
          setActiveTabPath(filePath);
          setStatusMessage(`已打开: ${name}`);
          return;
        }

        // Try to read as text
        const result = await invoke<{ content: string }>('read_file', {
          path: filePath,
        }).catch(() => null);

        if (result === null) {
          setStatusMessage(`无法读取文件: ${name}`);
          return;
        }

        const newTab: OpenTab = {
          path: filePath,
          name,
          extension: ext,
          content: result.content,
          isModified: false,
          isBinary: false,
        };

        setTabs((prev) => [...prev, newTab]);
        setActiveTabPath(filePath);
        setStatusMessage(`已打开: ${name}`);
      } catch (err: unknown) {
        setStatusMessage(`错误: ${String(err)}`);
      }
    },
    [tabs]
  );

  useEffect(() => {
    if (didHandleInitialOpen.current) return;
    didHandleInitialOpen.current = true;

    void invoke<InitialOpenPath | null>('get_initial_open_path')
      .then((initialPath) => {
        if (!initialPath) return;

        if (initialPath.is_dir) {
          setRootPath(initialPath.path);
          setStatusMessage(`已打开文件夹: ${initialPath.path}`);
          return;
        }

        if (initialPath.parent_path) {
          setRootPath(initialPath.parent_path);
        }
        void openFile(initialPath.path);
      })
      .catch(() => undefined);
  }, [openFile]);

  const handleTabClose = useCallback(
    (path: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.path === path);
        const newTabs = prev.filter((t) => t.path !== path);

        if (path === activeTabPath) {
          if (newTabs.length > 0) {
            const newIdx = Math.min(idx, newTabs.length - 1);
            setActiveTabPath(newTabs[newIdx].path);
          } else {
            setActiveTabPath(null);
          }
        }

        return newTabs;
      });
    },
    [activeTabPath]
  );

  const handleContentChange = useCallback(
    (content: string) => {
      if (!activeTabPath) return;
      setTabs((prev) =>
        prev.map((tab) =>
          tab.path === activeTabPath
            ? { ...tab, content, isModified: true }
            : tab
        )
      );
    },
    [activeTabPath]
  );

  const handleSave = useCallback(async () => {
    if (!activeTab || activeTab.isBinary) return;

    try {
      await invoke('write_file', {
        path: activeTab.path,
        content: activeTab.content,
      });
      setTabs((prev) =>
        prev.map((tab) =>
          tab.path === activeTab.path ? { ...tab, isModified: false } : tab
        )
      );
      setStatusMessage(`已保存: ${activeTab.name}`);
    } catch (err: any) {
      setStatusMessage(`保存失败: ${err}`);
    }
  }, [activeTab]);

  const handleOutlineNavigate = useCallback((line: number) => {
    setCurrentLine(line);
  }, []);

  return (
    <div className="app">
      <TitleBar fileName={activeTab?.name || null} isModified={activeTab?.isModified || false} />
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSave={handleSave}
        onOpenFile={handleOpenFile}
        onOpenFolder={handleOpenFolder}
        canSave={!!activeTab && !activeTab.isBinary && activeTab.isModified}
        fileName={activeTab?.name || null}
        isModified={activeTab?.isModified || false}
        isMarkdown={isMarkdown}
      />

      <div className="app-body">
        {/* Left sidebar: File Tree */}
        <div className="sidebar-left">
          <FileTree
            rootPath={rootPath}
            onFileOpen={openFile}
            onRootChange={handleOpenFolder}
            refreshKey={refreshKey}
          />
        </div>

        {/* Main content area */}
        <div className="main-content">
          <TabBar
            tabs={tabs}
            activeTabPath={activeTabPath}
            onTabClick={setActiveTabPath}
            onTabClose={handleTabClose}
          />

          <div className="editor-area">
            {!activeTab && (
              <div className="welcome-screen">
                <div className="welcome-content">
                  <div className="welcome-logo">AE</div>
                  <h1>Any Editor</h1>
                  <p className="welcome-subtitle">万能文件编辑器</p>
                  <p className="welcome-desc">
                    支持 TXT、Markdown、PDF、JSON、HTML 等所有文本文件
                  </p>
                  <div className="welcome-actions">
                    <button
                      className="welcome-btn primary"
                      onClick={handleOpenFolder}
                    >
                      📂 打开文件夹
                    </button>
                    <button
                      className="welcome-btn secondary"
                      onClick={handleOpenFile}
                    >
                      📄 打开文件
                    </button>
                  </div>
                  <div className="welcome-shortcuts">
                    <span>Ctrl+O 打开文件夹</span>
                    <span>Ctrl+Shift+O 打开文件</span>
                    <span>Ctrl+S 保存</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab && isPDF && (
              <PDFPreview filePath={activeTab.path} />
            )}

            {activeTab && !isPDF && !isMarkdown && (
              <EditorPane
                content={activeTab.content}
                extension={activeTab.extension}
                onContentChange={handleContentChange}
                onCursorChange={setCurrentLine}
              />
            )}

            {activeTab && isMarkdown && viewMode === 'code' && (
              <EditorPane
                content={activeTab.content}
                extension={activeTab.extension}
                onContentChange={handleContentChange}
                onCursorChange={setCurrentLine}
              />
            )}

            {activeTab && isMarkdown && viewMode === 'preview' && (
              <MarkdownPreview content={activeTab.content} />
            )}

            {activeTab && isMarkdown && viewMode === 'split' && (
              <div className="split-view">
                <div className="split-left">
                  <EditorPane
                    content={activeTab.content}
                    extension={activeTab.extension}
                    onContentChange={handleContentChange}
                    onCursorChange={setCurrentLine}
                  />
                </div>
                <div className="split-divider" />
                <div className="split-right">
                  <MarkdownPreview content={activeTab.content} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar: Outline */}
        {activeTab && !isPDF && (
          <Outline
            content={activeTab.content}
            extension={activeTab.extension}
            currentLine={currentLine}
            onNavigate={handleOutlineNavigate}
            isVisible={outlineVisible}
            onToggle={() => setOutlineVisible(!outlineVisible)}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="status-bar">
        <span className="status-message">{statusMessage}</span>
        <div className="status-right">
          {activeTab && (
            <>
              <span className="status-item">
                {activeTab.extension.toUpperCase() || 'TXT'}
              </span>
              <span className="status-separator">|</span>
              <span className="status-item">
                行 {currentLine}
              </span>
              <span className="status-separator">|</span>
              <span className="status-item">
                UTF-8
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
