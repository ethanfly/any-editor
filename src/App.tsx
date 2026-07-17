import React, { useState, useCallback, useEffect, useRef } from 'react';
import { open, save, message, ask } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import FileTree from './components/FileTree';
import TabBar from './components/TabBar';
import TitleBar from './components/TitleBar';
import Toolbar from './components/Toolbar';
import EditorPane from './components/EditorPane';
import type { EditorPaneHandle } from './components/EditorPane';
import MarkdownPreview from './components/MarkdownPreview';
import WysiwygEditor from './components/WysiwygEditor';
import PDFPreview from './components/PDFPreview';
import ImagePreview from './components/ImagePreview';
import Outline from './components/Outline';
import FindReplace from './components/FindReplace';
import type { FindReplaceHandlers } from './components/FindReplace';
import SettingsModal from './components/SettingsModal';
import HistoryPanel from './components/HistoryPanel';
import QuickOpen from './components/QuickOpen';
import SearchPanel from './components/SearchPanel';
import type { OpenTab, ViewMode } from './types';
import { BINARY_EXTENSIONS, IMAGE_EXTENSIONS, MARKDOWN_EXTENSIONS } from './types';
import { loadSettings, saveSettings, type AppSettings } from './types/settings';
import { contentToHtmlDocument, printHtmlDocument } from './utils/exportMarkdown';
import { applyMarkdownFormat, type FormatAction } from './utils/markdownFormat';
import { formatJsonDocument, minifyJsonDocument } from './utils/jsonFormat';
import { computeTextStats } from './utils/textStats';
import { loadWindowGeometry, saveWindowGeometry } from './utils/windowState';
import { loadWorkspace, saveWorkspace, pushRecentFile } from './utils/workspace';
import DiffPanel from './components/DiffPanel';
import CsvTableView from './components/CsvTableView';
import ShortcutsHelp from './components/ShortcutsHelp';
import CommandPalette from './components/CommandPalette';
import type { CommandItem } from './components/CommandPalette';
import './App.css';

const LARGE_FILE_WARN_BYTES = 2 * 1024 * 1024; // 2MB
const LARGE_FILE_READONLY_BYTES = 8 * 1024 * 1024; // 8MB => readonly
const LARGE_FILE_BLOCK_BYTES = 30 * 1024 * 1024; // 30MB confirm

interface InitialOpenPath {
  path: string;
  is_dir: boolean;
  parent_path?: string;
}

interface FileReadResult {
  path: string;
  content: string;
  extension: string;
  encoding?: string;
}

function getFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

function getExtension(filePath: string): string {
  const name = getFileName(filePath);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return name.slice(dot + 1).toLowerCase();
}

function isFlagArg(arg: string): boolean {
  return arg.startsWith('-');
}

function parentDir(filePath: string): string {
  const normalized = filePath.replace(/\//g, '\\');
  if (filePath.includes('\\') || /^[a-zA-Z]:/.test(filePath)) {
    const idx = normalized.lastIndexOf('\\');
    return idx >= 0 ? filePath.slice(0, idx) : filePath;
  }
  const idx = filePath.lastIndexOf('/');
  return idx >= 0 ? filePath.slice(0, idx) : filePath;
}

function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.endsWith('\\') || dir.endsWith('/') ? `${dir}${name}` : `${dir}${sep}${name}`;
}

const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [rootPath, setRootPath] = useState<string>('');
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(loadSettings().defaultMarkdownView);
  const [outlineVisible, setOutlineVisible] = useState(false);
  const [outlineHasContent, setOutlineHasContent] = useState(false);
  const [fileTreeVisible, setFileTreeVisible] = useState(false);
  const [currentLine, setCurrentLine] = useState(1);
  const [scrollToLine, setScrollToLine] = useState<{ line: number; token: number } | null>(null);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusMessage, setStatusMessage] = useState('就绪');
  const [findOpen, setFindOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [findHandlers, setFindHandlers] = useState<FindReplaceHandlers | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [diskChangedPaths, setDiskChangedPaths] = useState<Record<string, boolean>>({});
  const [csvTableMode, setCsvTableMode] = useState(true);
  const workspaceReady = useRef(false);

  const didHandleInitialOpen = useRef(false);
  const outlineVisibleRef = useRef(outlineVisible);
  const tabsRef = useRef(tabs);
  const activeTabPathRef = useRef(activeTabPath);
  const settingsRef = useRef(settings);
  const openFileRef = useRef<(filePath: string) => Promise<void>>(async () => undefined);
  const untitledCounter = useRef(1);
  const editorPaneRef = useRef<EditorPaneHandle | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diskMtimeRef = useRef<Record<string, number>>({});

  useEffect(() => {
    outlineVisibleRef.current = outlineVisible;
    tabsRef.current = tabs;
    activeTabPathRef.current = activeTabPath;
    settingsRef.current = settings;
  }, [outlineVisible, tabs, activeTabPath, settings]);

  useEffect(() => {
    saveSettings(settings);
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--app-ui-font-size', `${settings.uiFontSize || 13}px`);
  }, [settings]);

  // Restore window geometry
  useEffect(() => {
    const geo = loadWindowGeometry();
    if (!geo) return;
    void (async () => {
      try {
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(Math.max(900, geo.width), Math.max(600, geo.height)));
        await win.setPosition(new LogicalPosition(geo.x, geo.y));
      } catch {
        // ignore
      }
    })();
  }, []);

  // Persist window geometry
  useEffect(() => {
    let unlistenResize: (() => void) | undefined;
    let unlistenMove: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const persist = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void (async () => {
          try {
            const win = getCurrentWindow();
            const size = await win.innerSize();
            const pos = await win.outerPosition();
            // convert physical to logical roughly using factor if available
            const factor = await win.scaleFactor();
            saveWindowGeometry({
              width: Math.round(size.width / factor),
              height: Math.round(size.height / factor),
              x: Math.round(pos.x / factor),
              y: Math.round(pos.y / factor),
            });
          } catch {
            // ignore
          }
        })();
      }, 400);
    };
    void (async () => {
      try {
        const win = getCurrentWindow();
        unlistenResize = await win.onResized(() => persist());
        unlistenMove = await win.onMoved(() => persist());
      } catch {
        // ignore
      }
    })();
    return () => {
      if (timer) clearTimeout(timer);
      unlistenResize?.();
      unlistenMove?.();
    };
  }, []);

    // Restore workspace once (after optional CLI/file association open)
  useEffect(() => {
    const ws = loadWorkspace();
    setRecentFiles(ws?.recentFiles ?? []);
    // Delay slightly so get_initial_open_path can win when launched with a file
    const timer = setTimeout(() => {
      if (didHandleInitialOpen.current && activeTabPathRef.current) {
        workspaceReady.current = true;
        return;
      }
      if (!ws) {
        workspaceReady.current = true;
        return;
      }
      if (ws.rootPath) {
        setRootPath(ws.rootPath);
        setFileTreeVisible(ws.fileTreeVisible ?? true);
      }
      if (ws.viewMode) setViewMode(ws.viewMode);
      const tabsToOpen = (ws.openTabs || []).filter((p) => p && !p.startsWith('untitled:'));
      void (async () => {
        for (const p of tabsToOpen.slice(0, 12)) {
          await openFileRef.current(p);
        }
        if (ws.activeTabPath) setActiveTabPath(ws.activeTabPath);
        workspaceReady.current = true;
      })();
    }, 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist workspace
  useEffect(() => {
    if (!workspaceReady.current) return;
    saveWorkspace({
      rootPath,
      openTabs: tabs.map((t) => t.path),
      activeTabPath,
      viewMode,
      fileTreeVisible,
      recentFiles,
    });
  }, [rootPath, tabs, activeTabPath, viewMode, fileTreeVisible, recentFiles]);

  const handleHasContent = useCallback((hasContent: boolean) => {
    setOutlineHasContent(hasContent);
    if (hasContent && !outlineVisibleRef.current) {
      setOutlineVisible(true);
    }
    if (!hasContent) {
      setOutlineVisible(false);
    }
  }, []);

  const activeTab = tabs.find((t) => t.path === activeTabPath) || null;
  const isMarkdown = activeTab ? MARKDOWN_EXTENSIONS.has(activeTab.extension) : false;
  const isPDF = activeTab?.extension === 'pdf';
  const isImage = !!activeTab && IMAGE_EXTENSIONS.has(activeTab.extension);
  const isCsv = !!activeTab && (activeTab.extension === 'csv' || activeTab.extension === 'tsv');

  const persistHistory = useCallback(async (tab: OpenTab) => {
    if (!settingsRef.current.historyEnabled) return;
    if (tab.isBinary || tab.isUntitled || tab.path.startsWith('untitled:')) return;
    try {
      await invoke('save_history_snapshot', {
        path: tab.path,
        content: tab.content,
        limit: settingsRef.current.historyLimit,
      });
    } catch {
      // history is best-effort
    }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择文件夹',
      });
      if (selected && typeof selected === 'string') {
        setRootPath(selected);
        setFileTreeVisible(true);
        setRefreshKey((k) => k + 1);
        setStatusMessage(`已打开文件夹: ${selected}`);
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
      setStatusMessage(`打开文件夹失败: ${String(err)}`);
    }
  }, []);

  const openFile = useCallback(async (filePath: string) => {
    try {
      const isDir = await invoke<boolean>('is_directory', { path: filePath }).catch(() => false);
      if (isDir) {
        setRootPath(filePath);
        setFileTreeVisible(true);
        setRefreshKey((k) => k + 1);
        setStatusMessage(`已打开文件夹: ${filePath}`);
        return;
      }

      if (tabsRef.current.some((t) => t.path === filePath)) {
        setActiveTabPath(filePath);
        return;
      }

      const name = getFileName(filePath);
      const ext = getExtension(filePath);

      // Large file protection for text-like opens
      let forceReadonly = false;
      if (!(ext === 'pdf' || BINARY_EXTENSIONS.has(ext))) {
        try {
          const meta = await invoke<{ size: number; modified_ms?: number }>('file_meta', { path: filePath });
          if (typeof meta.modified_ms === 'number') {
            diskMtimeRef.current[filePath] = meta.modified_ms;
          }
          if (meta.size >= LARGE_FILE_BLOCK_BYTES) {
            const proceed = await ask(
              `文件约 ${(meta.size / 1024 / 1024).toFixed(1)} MB，可能导致卡顿。\n仍要打开吗？`,
              { title: '大文件警告', kind: 'warning' }
            );
            if (!proceed) {
              setStatusMessage('已取消打开大文件');
              return;
            }
          }
          if (meta.size >= LARGE_FILE_READONLY_BYTES) {
            forceReadonly = true;
            setStatusMessage(
              `大文件已以只读打开 (${(meta.size / 1024 / 1024).toFixed(1)} MB)`
            );
          } else if (meta.size >= LARGE_FILE_WARN_BYTES) {
            setStatusMessage(`提示: 文件较大 (${(meta.size / 1024 / 1024).toFixed(1)} MB)，已打开`);
          }
        } catch {
          // ignore meta failures
        }
      }

      if (ext === 'pdf'
 || BINARY_EXTENSIONS.has(ext)) {
        const newTab: OpenTab = {
          path: filePath,
          name,
          extension: ext || 'bin',
          content: '',
          isModified: false,
          isBinary: true,
          encoding: ext === 'pdf' ? 'PDF' : IMAGE_EXTENSIONS.has(ext) ? 'Image' : 'Binary',
        };
        setTabs((prev) => (prev.some((t) => t.path === filePath) ? prev : [...prev, newTab]));
        setActiveTabPath(filePath);
        setStatusMessage(
          ext === 'pdf' || IMAGE_EXTENSIONS.has(ext)
            ? `已打开: ${name}`
            : `已打开二进制文件: ${name}`
        );
        return;
      }

      const result = await invoke<FileReadResult>('read_file', { path: filePath }).catch((err: unknown) => {
        const msg = String(err);
        if (msg.includes('BINARY_FILE')) return 'BINARY' as const;
        throw err;
      });

      if (result === 'BINARY') {
        const newTab: OpenTab = {
          path: filePath,
          name,
          extension: ext || 'bin',
          content: '',
          isModified: false,
          isBinary: true,
          encoding: 'Binary',
        };
        setTabs((prev) => (prev.some((t) => t.path === filePath) ? prev : [...prev, newTab]));
        setActiveTabPath(filePath);
        setStatusMessage(`已打开二进制文件: ${name}`);
        return;
      }

      const newTab: OpenTab = {
        path: filePath,
        name,
        extension: result.extension || ext,
        content: result.content,
        isModified: false,
        isBinary: false,
        encoding: result.encoding || 'UTF-8',
        isReadonly: forceReadonly,
      };

      setTabs((prev) => (prev.some((t) => t.path === filePath) ? prev : [...prev, newTab]));
      setActiveTabPath(filePath);
      if (MARKDOWN_EXTENSIONS.has(result.extension || ext)) {
        setViewMode(settingsRef.current.defaultMarkdownView);
      } else {
        setViewMode('code');
      }
      setCurrentLine(1);
      setStatusMessage(`已打开: ${name}`);
      setRecentFiles(pushRecentFile(filePath));
    } catch (err: unknown) {
      setStatusMessage(`错误: ${String(err)}`);
    }
  }, []);

  useEffect(() => {
    openFileRef.current = openFile;
  }, [openFile]);

  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        title: '选择文件',
        filters: [{ name: '所有文件', extensions: ['*'] }],
      });
      if (selected && typeof selected === 'string') {
        await openFile(selected);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
      setStatusMessage(`打开文件失败: ${String(err)}`);
    }
  }, [openFile]);

  const handleNewFile = useCallback(() => {
    const id = untitledCounter.current++;
    const path = `untitled:${id}`;
    const tab: OpenTab = {
      path,
      name: `未命名-${id}.md`,
      extension: 'md',
      content: '',
      isModified: true,
      isBinary: false,
      encoding: 'UTF-8',
      isUntitled: true,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabPath(path);
    setViewMode(settingsRef.current.defaultMarkdownView);
    setStatusMessage('已新建未命名文档');
  }, []);

  const writeTabToDisk = useCallback(
    async (tab: OpenTab, targetPath: string): Promise<boolean> => {
      try {
        await invoke('write_file', {
          path: targetPath,
          content: tab.content,
          encoding: tab.encoding?.startsWith('GBK') ? 'GBK' : 'UTF-8',
        });
        const name = getFileName(targetPath);
        const ext = getExtension(targetPath);
        setTabs((prev) =>
          prev.map((t) =>
            t.path === tab.path
              ? {
                  ...t,
                  path: targetPath,
                  name,
                  extension: ext || t.extension,
                  isModified: false,
                  isUntitled: false,
                }
              : t
          )
        );
        if (activeTabPathRef.current === tab.path) {
          setActiveTabPath(targetPath);
        }
        setStatusMessage(`已保存: ${name}`);
        try {
          const meta = await invoke<{ modified_ms: number }>('file_meta', { path: targetPath });
          if (typeof meta.modified_ms === 'number') {
            diskMtimeRef.current[targetPath] = meta.modified_ms;
          }
        } catch {
          // ignore
        }
        setDiskChangedPaths((m) => {
          const next = { ...m };
          delete next[targetPath];
          delete next[tab.path];
          return next;
        });
        await persistHistory({ ...tab, path: targetPath, isUntitled: false });
        setRefreshKey((k) => k + 1);
        return true;
      } catch (err: unknown) {
        setStatusMessage(`保存失败: ${String(err)}`);
        return false;
      }
    },
    [persistHistory]
  );

  const handleSaveAs = useCallback(async (tabOverride?: OpenTab | null): Promise<boolean> => {
    const tab =
      tabOverride ?? tabsRef.current.find((t) => t.path === activeTabPathRef.current) ?? null;
    if (!tab || tab.isBinary) return false;

    try {
      const selected = await save({
        title: '另存为',
        defaultPath: tab.isUntitled ? tab.name : tab.path,
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'All', extensions: ['*'] },
        ],
      });
      if (!selected) return false;
      return writeTabToDisk(tab, selected);
    } catch (err) {
      setStatusMessage(`另存为失败: ${String(err)}`);
      return false;
    }
  }, [writeTabToDisk]);

  const handleSave = useCallback(
    async (tabOverride?: OpenTab | null): Promise<boolean> => {
      const tab =
        tabOverride ?? tabsRef.current.find((t) => t.path === activeTabPathRef.current) ?? null;
      if (!tab || tab.isBinary) return false;
      if (tab.isUntitled || tab.path.startsWith('untitled:')) {
        return handleSaveAs(tab);
      }
      return writeTabToDisk(tab, tab.path);
    },
    [handleSaveAs, writeTabToDisk]
  );

  // Poll disk mtime for external changes
  useEffect(() => {
    const timer = setInterval(() => {
      const openTabs = tabsRef.current.filter(
        (t) => !t.isBinary && !t.isUntitled && !t.path.startsWith('untitled:')
      );
      void (async () => {
        for (const tab of openTabs) {
          try {
            const meta = await invoke<{ modified_ms: number }>('file_meta', { path: tab.path });
            const prev = diskMtimeRef.current[tab.path];
            if (typeof meta.modified_ms === 'number') {
              if (prev && meta.modified_ms > prev && !tab.isModified) {
                setDiskChangedPaths((m) => ({ ...m, [tab.path]: true }));
                setStatusMessage(`磁盘文件已变化: ${tab.name}（可点“比较”或重新打开）`);
              }
              // if we saved recently and not modified, refresh baseline mtime
              if (!tab.isModified) {
                diskMtimeRef.current[tab.path] = meta.modified_ms;
              }
            }
          } catch {
            // ignore
          }
        }
      })();
    }, 3000);
    return () => clearInterval(timer);
  }, []);

    // Auto-save dirty real files
  useEffect(() => {
    if (!settings.autoSave) return;
    const dirty = tabs.filter((t) => t.isModified && !t.isBinary && !t.isUntitled && !t.path.startsWith('untitled:'));
    if (dirty.length === 0) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void (async () => {
        for (const tab of dirty) {
          // re-read latest from ref
          const latest = tabsRef.current.find((t) => t.path === tab.path);
          if (!latest || !latest.isModified || latest.isBinary || latest.isUntitled) continue;
          try {
            await invoke('write_file', {
              path: latest.path,
              content: latest.content,
              encoding: latest.encoding?.startsWith('GBK') ? 'GBK' : 'UTF-8',
            });
            setTabs((prev) =>
              prev.map((t) => (t.path === latest.path ? { ...t, isModified: false } : t))
            );
            await persistHistory(latest);
            setStatusMessage(`自动保存: ${latest.name}`);
          } catch (err) {
            setStatusMessage(`自动保存失败: ${String(err)}`);
          }
        }
      })();
    }, Math.max(500, settings.autoSaveIntervalMs));

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [tabs, settings.autoSave, settings.autoSaveIntervalMs, persistHistory]);

  const confirmDiscard = useCallback(async (tab: OpenTab): Promise<'save' | 'discard' | 'cancel'> => {
    try {
      const result = await message(`「${tab.name}」有未保存的更改。\n是否在关闭前保存？`, {
        title: '未保存的更改',
        kind: 'warning',
        buttons: {
          yes: '保存',
          no: '不保存',
          cancel: '取消',
        },
      });
      if (result === 'Yes' || result === '保存' || result === 'yes') return 'save';
      if (result === 'No' || result === '不保存' || result === 'no') return 'discard';
      return 'cancel';
    } catch {
      const saveIt = await ask(`「${tab.name}」有未保存的更改，是否保存？`, {
        title: '未保存的更改',
        kind: 'warning',
      });
      return saveIt ? 'save' : 'discard';
    }
  }, []);

  const handleTabClose = useCallback(
    async (path: string) => {
      const tab = tabsRef.current.find((t) => t.path === path);
      if (!tab) return;

      if (tab.isModified && !tab.isBinary) {
        const decision = await confirmDiscard(tab);
        if (decision === 'cancel') return;
        if (decision === 'save') {
          const ok = await handleSave(tab);
          if (!ok) return;
        }
      }

      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.path === path);
        const newTabs = prev.filter((t) => t.path !== path);

        if (path === activeTabPathRef.current) {
          if (newTabs.length > 0) {
            const newIdx = Math.min(Math.max(idx, 0), newTabs.length - 1);
            setActiveTabPath(newTabs[newIdx].path);
          } else {
            setActiveTabPath(null);
          }
        }

        return newTabs;
      });
    },
    [confirmDiscard, handleSave]
  );

  const handleTabReorder = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length ||
        fromIndex === toIndex
      ) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }, []);

    const handleContentChange = useCallback((content: string) => {
    const path = activeTabPathRef.current;
    if (!path) return;
    const current = tabsRef.current.find((t) => t.path === path);
    if (current?.isReadonly) {
      setStatusMessage('只读文件，无法编辑（大文件保护）');
      return;
    }
    setTabs((prev) =>
      prev.map((tab) => (tab.path === path ? { ...tab, content, isModified: true } : tab))
    );
  }, []);

  const handleWysiwygChange = useCallback((markdown: string) => {
    const path = activeTabPathRef.current;
    if (!path) return;
    const current = tabsRef.current.find((t) => t.path === path);
    if (current?.isReadonly) {
      setStatusMessage('只读文件，无法编辑（大文件保护）');
      return;
    }
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.path !== path) return tab;
        const next = markdown.replace(/\r\n/g, '\n');
        const prevContent = tab.content.replace(/\r\n/g, '\n');
        if (next === prevContent) return tab;
        return { ...tab, content: markdown, isModified: true };
      })
    );
  }, []);

  const handleOutlineNavigate = useCallback((line: number) => {
    setCurrentLine(line);
    setScrollToLine({ line, token: Date.now() });
  }, []);

  const handleRestoreHistory = useCallback((content: string) => {
    const path = activeTabPathRef.current;
    if (!path) return;
    setTabs((prev) =>
      prev.map((tab) => (tab.path === path ? { ...tab, content, isModified: true } : tab))
    );
    setStatusMessage('已恢复历史版本（未保存，可 Ctrl+S 写回文件）');
  }, []);

  const handlePasteImage = useCallback(
    async (file: File): Promise<string | null> => {
      const tab = tabsRef.current.find((t) => t.path === activeTabPathRef.current);
      if (!tab || tab.isBinary) return null;
      if (tab.isUntitled || tab.path.startsWith('untitled:')) {
        setStatusMessage('请先保存文档，再粘贴图片');
        return null;
      }

      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const ext =
          file.type === 'image/png'
            ? 'png'
            : file.type === 'image/jpeg'
              ? 'jpg'
              : file.type === 'image/gif'
                ? 'gif'
                : file.type === 'image/webp'
                  ? 'webp'
                  : 'png';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const relDir = 'assets';
        const fileName = `paste-${stamp}.${ext}`;
        const absDir = joinPath(parentDir(tab.path), relDir);
        const absPath = joinPath(absDir, fileName);
        await invoke('write_file_bytes', { path: absPath, contents: Array.from(buf) });
        setStatusMessage(`图片已保存: ${relDir}/${fileName}`);
        setRefreshKey((k) => k + 1);
        return `${relDir}/${fileName}`.replace(/\\/g, '/');
      } catch (err) {
        setStatusMessage(`保存图片失败: ${String(err)}`);
        return null;
      }
    },
    []
  );



  const textStats = activeTab && !activeTab.isBinary ? computeTextStats(activeTab.content) : null;

  const handleReopenEncoding = useCallback(async (label: 'UTF-8' | 'GBK') => {
    const tab = tabsRef.current.find((t) => t.path === activeTabPathRef.current);
    if (!tab || tab.isBinary || tab.isUntitled || tab.path.startsWith('untitled:')) {
      setStatusMessage('当前文件不支持切换编码');
      return;
    }
    if (tab.isModified) {
      const ok = await ask('切换编码将从磁盘重新读取并丢弃未保存更改，继续吗？', {
        title: '切换编码',
        kind: 'warning',
      });
      if (!ok) return;
    }
    try {
      const result = await invoke<FileReadResult>('read_file', {
        path: tab.path,
        encoding: label,
      });
      setTabs((prev) =>
        prev.map((t) =>
          t.path === tab.path
            ? {
                ...t,
                content: result.content,
                encoding: result.encoding || label,
                isModified: false,
              }
            : t
        )
      );
      setStatusMessage(`已用 ${label} 重新打开: ${tab.name}`);
    } catch (err) {
      setStatusMessage(`切换编码失败: ${String(err)}`);
    }
  }, []);

  const applyContentEdit = useCallback((nextContent: string, selection?: { start: number; end: number }) => {
    const path = activeTabPathRef.current;
    if (!path) return;
    const tab = tabsRef.current.find((t) => t.path === path);
    if (!tab || tab.isBinary || tab.isReadonly) {
      setStatusMessage(tab?.isReadonly ? '只读文件不可编辑' : '当前文件不支持编辑');
      return;
    }

    const pane = editorPaneRef.current;
    if (pane && selection) {
      pane.applyTextEdit(nextContent, selection);
      return;
    }

    setTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, content: nextContent, isModified: true } : t))
    );
  }, []);

  const handleFormat = useCallback((action: FormatAction) => {
    const path = activeTabPathRef.current;
    if (!path) {
      setStatusMessage('请先打开或新建文档');
      return;
    }
    const tab = tabsRef.current.find((t) => t.path === path);
    if (!tab || tab.isBinary) {
      setStatusMessage('当前文件不支持格式化');
      return;
    }
    if (tab.isReadonly) {
      setStatusMessage('只读文件不可编辑');
      return;
    }

    const isMd = MARKDOWN_EXTENSIONS.has(tab.extension);
    if (!isMd && action !== 'formatDoc') {
      setStatusMessage('该格式操作仅支持 Markdown');
      return;
    }

    let sel = { start: tab.content.length, end: tab.content.length };
    const paneSel = editorPaneRef.current?.getSelectionOffsets();
    if (paneSel) sel = paneSel;

    const result = applyMarkdownFormat(tab.content, sel, action);
    applyContentEdit(result.content, result.selection);
    const labels: Record<string, string> = {
      bold: '加粗', italic: '斜体', strike: '删除线', code: '行内代码', highlight: '高亮',
      h1: '标题1', h2: '标题2', h3: '标题3', quote: '引用', ul: '无序列表', ol: '有序列表',
      task: '任务列表', link: '链接', image: '图片', codeblock: '代码块', hr: '分隔线', table: '表格',
      formatDoc: '文档',
    };
    setStatusMessage(`已应用格式: ${labels[action] || action}`);
  }, [applyContentEdit]);

  const handleFormatDocument = useCallback(async () => {
    const path = activeTabPathRef.current;
    if (!path) {
      setStatusMessage('请先打开或新建文档');
      return;
    }
    const tab = tabsRef.current.find((t) => t.path === path);
    if (!tab || tab.isBinary) {
      setStatusMessage('当前文件不支持格式化');
      return;
    }
    if (tab.isReadonly) {
      setStatusMessage('只读文件不可编辑');
      return;
    }

    const isMd = MARKDOWN_EXTENSIONS.has(tab.extension);
    if (isMd) {
      handleFormat('formatDoc');
      return;
    }

    // Reliable JSON pretty-print (does not depend on Monaco workers)
    if (tab.extension === 'json') {
      const result = formatJsonDocument(tab.content, 2);
      if (!result.ok) {
        setStatusMessage(`JSON 格式化失败: ${result.message}`);
        return;
      }
      if (!result.changed) {
        setStatusMessage('JSON 已是格式化状态');
        return;
      }
      applyContentEdit(result.content, { start: 0, end: 0 });
      setStatusMessage('已格式化 JSON');
      return;
    }

    const ok = await editorPaneRef.current?.formatDocument();
    if (ok) {
      setStatusMessage('已格式化文档');
      return;
    }

    // fallback: trim trailing spaces / normalize newlines for plain text
    const next = tab.content
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\n*$/, '\n');
    if (next !== tab.content) {
      applyContentEdit(next, { start: 0, end: 0 });
      setStatusMessage('已清理空白并规范化换行');
    } else {
      setStatusMessage('当前语言暂无内置格式化器，已检查无需清理');
    }
  }, [applyContentEdit, handleFormat]);

  const handleMinifyJson = useCallback(() => {
    const path = activeTabPathRef.current;
    if (!path) {
      setStatusMessage('请先打开或新建文档');
      return;
    }
    const tab = tabsRef.current.find((t) => t.path === path);
    if (!tab || tab.isBinary || tab.extension !== 'json') {
      setStatusMessage('仅 JSON 文件支持压缩');
      return;
    }
    if (tab.isReadonly) {
      setStatusMessage('只读文件不可编辑');
      return;
    }
    const result = minifyJsonDocument(tab.content);
    if (!result.ok) {
      setStatusMessage(`JSON 压缩失败: ${result.message}`);
      return;
    }
    if (!result.changed) {
      setStatusMessage('JSON 已是压缩状态');
      return;
    }
    applyContentEdit(result.content, { start: 0, end: 0 });
    setStatusMessage('已压缩 JSON');
  }, [applyContentEdit]);

  const handleInsertTable = useCallback(() => {
    handleFormat('table');
  }, [handleFormat]);

  const handleExportHtml = useCallback(async () => {
    const tab = tabsRef.current.find((t) => t.path === activeTabPathRef.current);
    if (!tab || tab.isBinary) {
      setStatusMessage('当前没有可导出的文本文件');
      return;
    }
    try {
      const html = await contentToHtmlDocument(tab.name || 'document', tab.content, {
        extension: tab.extension,
        filePath: tab.isUntitled ? undefined : tab.path,
      });
      const selected = await save({
        title: '导出 HTML',
        defaultPath: tab.name.replace(/\.[^.]+$/, '') + '.html',
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (!selected) return;
      await invoke('write_file', { path: selected, content: html });
      setStatusMessage(`已导出 HTML: ${selected}`);
    } catch (err) {
      setStatusMessage(`导出失败: ${String(err)}`);
    }
  }, []);

  const handleExportPdf = useCallback(async () => {
    const tab = tabsRef.current.find((t) => t.path === activeTabPathRef.current);
    if (!tab || tab.isBinary) {
      setStatusMessage('当前没有可导出的文本文件');
      return;
    }
    try {
      setStatusMessage('正在准备打印…');
      const html = await contentToHtmlDocument(tab.name || 'document', tab.content, {
        extension: tab.extension,
        filePath: tab.isUntitled ? undefined : tab.path,
      });
      // Hidden iframe print — works in Tauri/WebView2 (window.open is often blocked / returns null with noopener)
      await printHtmlDocument(html);
      setStatusMessage('已打开打印对话框（可另存为 PDF）');
    } catch (err) {
      setStatusMessage(`导出 PDF 失败: ${String(err)}`);
    }
  }, []);

  const handleOpenSearchMatch = useCallback(
    async (path: string, line: number) => {
      await openFileRef.current(path);
      setViewMode((vm) => (MARKDOWN_EXTENSIONS.has(getExtension(path)) ? (vm === 'wysiwyg' ? 'code' : vm) : 'code'));
      // Prefer code view for line navigation accuracy
      if (MARKDOWN_EXTENSIONS.has(getExtension(path))) setViewMode('code');
      setCurrentLine(line);
      setScrollToLine({ line, token: Date.now() });
    },
    []
  );

    // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (e.shiftKey) void handleSaveAs();
        else void handleSave();
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleNewFile();
        return;
      }
      if ((e.key === 'f' || e.key === 'F') && e.shiftKey) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        e.stopPropagation();
        setFindOpen(true);
        return;
      }
      if ((e.key === 'h' || e.key === 'H') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        setFindOpen(true);
        return;
      }
      if ((e.key === 'p' || e.key === 'P') && e.shiftKey) {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setQuickOpen(true);
        return;
      }
      if (e.key === '\\' || e.code === 'Backslash') {
        // Ctrl+\ focus mode
        e.preventDefault();
        setFocusMode((v) => !v);
        return;
      }
      if ((e.key === 'd' || e.key === 'D') && e.shiftKey) {
        e.preventDefault();
        setDiffOpen(true);
        return;
      }
      if ((e.key === 'o' || e.key === 'O') && e.shiftKey) {
        e.preventDefault();
        void handleOpenFile();
        return;
      }
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        void handleOpenFolder();
        return;
      }
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        if (activeTabPathRef.current) void handleTabClose(activeTabPathRef.current);
        return;
      }
      if (e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (e.key === '/' || e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if ((e.key === 'b' || e.key === 'B') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleFormat('bold');
        return;
      }
      if ((e.key === 'i' || e.key === 'I') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleFormat('italic');
        return;
      }
      if ((e.key === 'f' || e.key === 'F') && e.altKey && e.shiftKey) {
        e.preventDefault();
        void handleFormatDocument();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleSave, handleSaveAs, handleNewFile, handleOpenFile, handleOpenFolder, handleTabClose, handleFormat, handleFormatDocument]);

  // Initial open
  useEffect(() => {
    if (didHandleInitialOpen.current) return;
    didHandleInitialOpen.current = true;

    void invoke<InitialOpenPath | null>('get_initial_open_path')
      .then((initialPath) => {
        if (!initialPath) return;
        if (initialPath.is_dir) {
          setRootPath(initialPath.path);
          setFileTreeVisible(true);
          setStatusMessage(`已打开文件夹: ${initialPath.path}`);
          return;
        }
        if (initialPath.parent_path) setRootPath(initialPath.parent_path);
        setFileTreeVisible(false);
        void openFileRef.current(initialPath.path);
      })
      .catch(() => undefined);
  }, []);

  // Second-instance opens
  useEffect(() => {
    const unlistenPromise = listen<string[]>('second-instance-open', (event) => {
      const args = event.payload || [];
      for (const arg of args) {
        if (!arg || isFlagArg(arg)) continue;
        const lower = arg.toLowerCase();
        if ((lower.endsWith('.exe') || lower.includes('anyedit')) && !lower.endsWith('.md') && !lower.endsWith('.txt') && !lower.endsWith('.pdf')) {
          if (lower.includes('anyedit') || lower.endsWith('.exe')) continue;
        }
        void openFileRef.current(arg);
      }
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  // Window close guard
    // Drag-drop files/folders from OS
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === 'enter' || payload.type === 'over') {
            setDragActive(true);
            return;
          }
          if (payload.type === 'leave') {
            setDragActive(false);
            return;
          }
          if (payload.type === 'drop') {
            setDragActive(false);
            const paths = payload.paths || [];
            void (async () => {
              for (const p of paths) {
                await openFileRef.current(p);
              }
              if (paths.length) {
                setStatusMessage(`已通过拖放打开 ${paths.length} 项`);
              }
            })();
          }
        });
      } catch {
        // web fallback: no-op
      }
      if (cancelled && unlisten) unlisten();
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onCloseRequested(async (event) => {
          const dirty = tabsRef.current.filter((t) => t.isModified && !t.isBinary);
          if (dirty.length === 0) return;
          event.preventDefault();

          if (dirty.length === 1) {
            const decision = await confirmDiscard(dirty[0]);
            if (decision === 'cancel') return;
            if (decision === 'save') {
              const ok = await handleSave(dirty[0]);
              if (!ok) return;
            }
          } else {
            const proceed = await ask(
              `有 ${dirty.length} 个文件未保存。关闭将丢失未保存的更改。\n是否仍要关闭？`,
              { title: '未保存的更改', kind: 'warning' }
            );
            if (!proceed) return;
          }

          setTabs((prev) => prev.map((t) => ({ ...t, isModified: false })));
          await appWindow.destroy().catch(async () => {
            await appWindow.close();
          });
        });
      } catch {
        // browser/dev
      }
      if (cancelled && unlisten) unlisten();
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [confirmDiscard, handleSave]);

  const encodingLabel =
    activeTab?.encoding ||
    (activeTab?.isBinary
      ? activeTab.extension === 'pdf'
        ? 'PDF'
        : IMAGE_EXTENSIONS.has(activeTab.extension)
          ? 'Image'
          : 'Binary'
      : 'UTF-8');

  const canSave = !!activeTab && !activeTab.isBinary && !activeTab.isReadonly && (activeTab.isModified || !!activeTab.isUntitled);
  const showCodeEditor =
    !!activeTab &&
    !activeTab.isBinary &&
    !(isCsv && csvTableMode) &&
    (!isMarkdown || viewMode === 'code' || viewMode === 'split');

  const commands: CommandItem[] = [
    { id: 'new', title: '新建文档', hint: 'Ctrl+N', run: handleNewFile },
    { id: 'open-file', title: '打开文件', hint: 'Ctrl+Shift+O', run: () => { void handleOpenFile(); } },
    { id: 'open-folder', title: '打开文件夹', hint: 'Ctrl+O', run: () => { void handleOpenFolder(); } },
    { id: 'save', title: '保存', hint: 'Ctrl+S', run: () => { void handleSave(); } },
    { id: 'save-as', title: '另存为', hint: 'Ctrl+Shift+S', run: () => { void handleSaveAs(); } },
    { id: 'find', title: '查找替换', hint: 'Ctrl+F', run: () => setFindOpen(true) },
    { id: 'quick-open', title: '快速打开文件', hint: 'Ctrl+P', run: () => setQuickOpen(true) },
    { id: 'search', title: '在项目中搜索', hint: 'Ctrl+Shift+F', run: () => setSearchOpen(true) },
    { id: 'diff', title: '与磁盘比较', hint: 'Ctrl+Shift+D', run: () => setDiffOpen(true) },
    { id: 'focus', title: '切换专注模式', hint: 'Ctrl+\\', run: () => setFocusMode((v) => !v) },
    { id: 'export-html', title: '导出 HTML', run: () => { void handleExportHtml(); } },
    { id: 'export-pdf', title: '导出/打印 PDF', run: () => { void handleExportPdf(); } },
    { id: 'table', title: '插入 Markdown 表格', run: handleInsertTable },
    { id: 'format-doc', title: '格式化文档', hint: 'Shift+Alt+F', run: () => { void handleFormatDocument(); } },
    { id: 'minify-json', title: '压缩 JSON', run: handleMinifyJson },
    { id: 'bold', title: '加粗', hint: 'Ctrl+B', run: () => handleFormat('bold') },
    { id: 'italic', title: '斜体', hint: 'Ctrl+I', run: () => handleFormat('italic') },
    { id: 'code', title: '行内代码', run: () => handleFormat('code') },
    { id: 'h2', title: '标题 2', run: () => handleFormat('h2') },
    { id: 'link', title: '插入链接', run: () => handleFormat('link') },
    { id: 'history', title: '本地历史版本', run: () => setHistoryOpen(true) },
    { id: 'utf8', title: '以 UTF-8 重新打开', run: () => { void handleReopenEncoding('UTF-8'); } },
    { id: 'gbk', title: '以 GBK 重新打开', run: () => { void handleReopenEncoding('GBK'); } },
    { id: 'settings', title: '打开设置', hint: 'Ctrl+,', run: () => setSettingsOpen(true) },
    { id: 'shortcuts', title: '快捷键帮助', hint: 'Ctrl+/', run: () => setShortcutsOpen(true) },
  ];

    return (
    <div className={`app${focusMode ? ' focus-mode' : ''}${dragActive ? ' drag-active' : ''}`} data-theme={settings.theme}>
      <TitleBar fileName={activeTab?.name || null} isModified={activeTab?.isModified || false} autoSaveEnabled={settings.autoSave} />
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSave={() => {
          void handleSave();
        }}
        onSaveAs={() => {
          void handleSaveAs();
        }}
        onNewFile={handleNewFile}
        onOpenFile={() => {
          void handleOpenFile();
        }}
        onOpenFolder={() => {
          void handleOpenFolder();
        }}
        onFind={() => setFindOpen(true)}
        onQuickOpen={() => setQuickOpen(true)}
        onSearchProject={() => setSearchOpen(true)}
        onExportHtml={() => { void handleExportHtml(); }}
        onExportPdf={() => { void handleExportPdf(); }}
        onFormat={handleFormat}
        onFormatDocument={() => { void handleFormatDocument(); }}
        onMinifyJson={handleMinifyJson}
        isJson={!!activeTab && activeTab.extension === 'json'}
        canFormat={!!activeTab && !activeTab.isBinary && !activeTab.isReadonly}
        onDiff={() => setDiffOpen(true)}
        onFocusMode={() => setFocusMode((v) => !v)}
        focusMode={focusMode}
        onReopenUtf8={() => { void handleReopenEncoding('UTF-8'); }}
        onReopenGbk={() => { void handleReopenEncoding('GBK'); }}
        onShortcuts={() => setShortcutsOpen(true)}
        onToggleCsvView={isCsv ? () => setCsvTableMode((v) => !v) : undefined}
        csvTableMode={csvTableMode}
        onHistory={() => setHistoryOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        canSave={canSave}
        isMarkdown={isMarkdown}
        fileTreeVisible={fileTreeVisible}
        onToggleFileTree={() => setFileTreeVisible(!fileTreeVisible)}
        outlineVisible={outlineVisible}
        onToggleOutline={() => setOutlineVisible(!outlineVisible)}
        hasFileTree={!!rootPath}
        hasOutline={outlineHasContent}
      />

      <div className="app-body">
        {searchOpen && (
          <SearchPanel
            open={searchOpen}
            rootPath={rootPath}
            onClose={() => setSearchOpen(false)}
            onOpenMatch={(path, line) => {
              void handleOpenSearchMatch(path, line);
            }}
          />
        )}
        {fileTreeVisible && rootPath && (
          <div className="sidebar-left">
            <FileTree
              rootPath={rootPath}
              onFileOpen={(path) => {
                void openFile(path);
              }}
              onRootChange={() => {
                void handleOpenFolder();
              }}
              refreshKey={refreshKey}
              onTreeMutated={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        )}

        <div className="main-content">
          <TabBar
            tabs={tabs}
            activeTabPath={activeTabPath}
            onTabClick={setActiveTabPath}
            onTabClose={(path) => {
              void handleTabClose(path);
            }}
            onReorder={handleTabReorder}
          />

          <div className="editor-area">
            <FindReplace
              open={findOpen && showCodeEditor}
              onClose={() => setFindOpen(false)}
              handlers={findHandlers}
              allowReplace
            />

            {!activeTab && (
              <div className="welcome-screen">
                <div className="welcome-content">
                  <div className="welcome-logo">
                    <img src="/favicon.svg" alt="Any Editor" />
                  </div>
                  <h1>Any Editor</h1>
                  <p className="welcome-subtitle">万能文件编辑器</p>
                  <p className="welcome-desc">支持 TXT、Markdown、PDF、JSON、HTML 等所有文本文件</p>
                  <div className="welcome-actions">
                    <button className="welcome-btn primary" onClick={handleNewFile}>
                      新建文档
                    </button>
                    <button className="welcome-btn secondary" onClick={() => void handleOpenFolder()}>
                      打开文件夹
                    </button>
                    <button className="welcome-btn secondary" onClick={() => void handleOpenFile()}>
                      打开文件
                    </button>
                    <button className="welcome-btn secondary" onClick={() => setQuickOpen(true)}>
                      快速打开
                    </button>
                  </div>
                  {recentFiles.length > 0 && (
                    <div className="welcome-recent">
                      <div className="welcome-recent-title">最近文件</div>
                      {recentFiles.slice(0, 6).map((p) => (
                        <button
                          key={p}
                          type="button"
                          className="welcome-recent-item"
                          title={p}
                          onClick={() => void openFile(p)}
                        >
                          {p.replace(/\\/g, '/').split('/').pop()}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="welcome-shortcuts">
                    <span>Ctrl+N 新建</span>
                    <span>Ctrl+P 快速打开</span>
                    <span>Ctrl+Shift+F 搜项目</span>
                    <span>Ctrl+S 保存</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab && isPDF && <PDFPreview filePath={activeTab.path} />}

            {activeTab && isImage && !isPDF && (
              <ImagePreview filePath={activeTab.path} fileName={activeTab.name} />
            )}

            {activeTab && activeTab.isBinary && !isPDF && !isImage && (
              <div className="binary-placeholder">
                <div className="binary-placeholder-card">
                  <div className="binary-icon">BIN</div>
                  <h2>{activeTab.name}</h2>
                  <p>该文件为二进制格式（.{activeTab.extension || 'bin'}），暂不支持在编辑器中打开。</p>
                  <p className="binary-path" title={activeTab.path}>
                    {activeTab.path}
                  </p>
                </div>
              </div>
            )}

            {activeTab && !activeTab.isBinary && isCsv && csvTableMode && (
              <CsvTableView
                content={activeTab.content}
                extension={activeTab.extension}
                onContentChange={handleContentChange}
              />
            )}

            {activeTab && !activeTab.isBinary && !isMarkdown && !(isCsv && csvTableMode) && (
              <EditorPane
                ref={editorPaneRef}
                content={activeTab.content}
                extension={activeTab.extension}
                onContentChange={handleContentChange}
                onCursorChange={setCurrentLine}
                scrollToLine={scrollToLine}
                fontSize={settings.fontSize}
                colorTheme={settings.theme}
                readOnly={!!activeTab?.isReadonly}
                onFindHandlersReady={setFindHandlers}
                onRequestFind={() => setFindOpen(true)}
                onRequestFormat={() => { void handleFormatDocument(); }}
              />
            )}

            {activeTab && isMarkdown && viewMode === 'wysiwyg' && (
              <WysiwygEditor
                key={activeTab.path}
                content={activeTab.content}
                filePath={activeTab.isUntitled ? undefined : activeTab.path}
                scrollToLine={scrollToLine}
                onContentChange={handleWysiwygChange}
                onPasteImage={handlePasteImage}
              />
            )}

            {activeTab && isMarkdown && viewMode === 'code' && (
              <EditorPane
                ref={editorPaneRef}
                content={activeTab.content}
                extension={activeTab.extension}
                onContentChange={handleContentChange}
                onCursorChange={setCurrentLine}
                scrollToLine={scrollToLine}
                fontSize={settings.fontSize}
                colorTheme={settings.theme}
                readOnly={!!activeTab?.isReadonly}
                onFindHandlersReady={setFindHandlers}
                onRequestFind={() => setFindOpen(true)}
                onRequestFormat={() => { void handleFormatDocument(); }}
              />
            )}

            {activeTab && isMarkdown && viewMode === 'preview' && (
              <MarkdownPreview
                content={activeTab.content}
                filePath={activeTab.isUntitled ? undefined : activeTab.path}
                scrollToLine={scrollToLine}
              />
            )}

            {activeTab && isMarkdown && viewMode === 'split' && (
              <div className="split-view">
                <div className="split-editor">
                  <EditorPane
                    ref={editorPaneRef}
                    content={activeTab.content}
                    extension={activeTab.extension}
                    onContentChange={handleContentChange}
                    onCursorChange={setCurrentLine}
                    scrollToLine={scrollToLine}
                    onScroll={setScrollPercent}
                    fontSize={settings.fontSize}
                    colorTheme={settings.theme}
                    readOnly={!!activeTab?.isReadonly}
                    onFindHandlersReady={setFindHandlers}
                onRequestFind={() => setFindOpen(true)}
                onRequestFormat={() => { void handleFormatDocument(); }}
                  />
                </div>
                <div className="split-preview">
                  <MarkdownPreview
                    content={activeTab.content}
                    filePath={activeTab.isUntitled ? undefined : activeTab.path}
                    scrollPercent={scrollPercent}
                    scrollToLine={scrollToLine}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {activeTab && !activeTab.isBinary && (
          <Outline
            content={activeTab.content}
            extension={activeTab.extension}
            currentLine={currentLine}
            onNavigate={handleOutlineNavigate}
            isVisible={outlineVisible}
            onToggle={() => setOutlineVisible(!outlineVisible)}
            onHasContent={handleHasContent}
          />
        )}
      </div>

      <div className="status-bar">
        <span className="status-message">{statusMessage}</span>
        <div className="status-right">
          {activeTab && (
            <>
              <span className="status-item">{activeTab.extension.toUpperCase() || 'TXT'}</span>
              <span className="status-separator">|</span>
              <span className="status-item">行 {currentLine}</span>
              <span className="status-separator">|</span>
              <span className="status-item">{encodingLabel}</span>
              {textStats && (
                <>
                  <span className="status-separator">|</span>
                  <span className="status-item" title="字数 / 字符 / 行数">
                    {textStats.words} 词 · {textStats.charsNoSpace} 字 · {textStats.lines} 行
                  </span>
                  <span className="status-separator">|</span>
                  <span className="status-item" title="约按 400 词/分钟">
                    ~{textStats.readingMinutes} 分钟
                  </span>
                </>
              )}
              {settings.autoSave && (
                <>
                  <span className="status-separator">|</span>
                  <span className="status-item">AUTO</span>
                </>
              )}
              {focusMode && (
                <>
                  <span className="status-separator">|</span>
                  <span className="status-item">专注</span>
                </>
              )}
              {activeTab?.isReadonly && (
                <>
                  <span className="status-separator">|</span>
                  <span className="status-item">只读</span>
                </>
              )}
              {activeTab && diskChangedPaths[activeTab.path] && (
                <>
                  <span className="status-separator">|</span>
                  <span className="status-item" title="磁盘文件已被外部修改">磁盘已变</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
      />
      <HistoryPanel
        open={historyOpen}
        filePath={activeTab && !activeTab.isUntitled ? activeTab.path : null}
        onClose={() => setHistoryOpen(false)}
        onRestore={handleRestoreHistory}
      />
      <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <DiffPanel
        open={diffOpen}
        filePath={activeTab && !activeTab.isUntitled ? activeTab.path : null}
        editorContent={activeTab && !activeTab.isBinary ? activeTab.content : ''}
        encoding={activeTab?.encoding}
        onClose={() => setDiffOpen(false)}
        onReloadDisk={(content) => {
          const path = activeTabPathRef.current;
          if (!path) return;
          setTabs((prev) =>
            prev.map((t) => (t.path === path ? { ...t, content, isModified: false } : t))
          );
          setStatusMessage('已用磁盘版本覆盖编辑器内容');
        }}
      />
      <CommandPalette open={commandOpen} commands={commands} onClose={() => setCommandOpen(false)} />
      <QuickOpen
        open={quickOpen}
        rootPath={rootPath}
        recentFiles={recentFiles}
        onClose={() => setQuickOpen(false)}
        onOpen={(path) => {
          void openFile(path);
        }}
      />
    </div>
  );
};

export default App;
