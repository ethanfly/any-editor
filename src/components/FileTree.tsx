import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileEntry } from '../types';
import { pathsEqual } from '../utils/pathUtils';
import './FileTree.css';

interface FileTreeProps {
  rootPath: string;
  onFileOpen: (path: string, name?: string) => void;
  onRootChange: () => void;
  refreshKey: number;
  onTreeMutated?: () => void;
  activeFilePath?: string | null;
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  /** Return false to abort delete before disk removal (e.g. dirty tabs). */
  onBeforePathDelete?: (path: string) => boolean | Promise<boolean>;
}

interface FileVisualMeta {
  kind: string;
  label: string;
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.endsWith('\\') || dir.endsWith('/') ? `${dir}${name}` : `${dir}${sep}${name}`;
}

function getFileVisualMeta(entry: FileEntry, isExpanded: boolean): FileVisualMeta {
  if (entry.is_dir) {
    return {
      kind: isExpanded ? 'folder-open' : 'folder',
      label: isExpanded ? '展开文件夹' : '文件夹',
    };
  }
  const ext = entry.extension.toLowerCase();
  const extensionMap: Record<string, FileVisualMeta> = {
    md: { kind: 'markdown', label: 'Markdown' },
    markdown: { kind: 'markdown', label: 'Markdown' },
    pdf: { kind: 'pdf', label: 'PDF' },
    json: { kind: 'json', label: 'JSON' },
    js: { kind: 'javascript', label: 'JavaScript' },
    ts: { kind: 'typescript', label: 'TypeScript' },
    tsx: { kind: 'typescript', label: 'TypeScript' },
    py: { kind: 'python', label: 'Python' },
    rs: { kind: 'rust', label: 'Rust' },
    go: { kind: 'go', label: 'Go' },
    html: { kind: 'html', label: 'HTML' },
    css: { kind: 'css', label: 'CSS' },
    txt: { kind: 'text', label: 'Text' },
    png: { kind: 'image', label: 'Image' },
    jpg: { kind: 'image', label: 'Image' },
    jpeg: { kind: 'image', label: 'Image' },
    gif: { kind: 'image', label: 'Image' },
    webp: { kind: 'image', label: 'Image' },
    svg: { kind: 'image', label: 'Image' },
    bmp: { kind: 'image', label: 'Image' },
    ico: { kind: 'image', label: 'Image' },
  };
  return extensionMap[ext] || { kind: 'file', label: 'File' };
}

function FileTypeIcon({ kind, label }: { kind: string; label: string }) {
  return (
    <span className={`file-icon ${kind}`} aria-hidden="true" title={label}>
      <FileIconSvg kind={kind} />
    </span>
  );
}

function FileIconSvg({ kind }: { kind: string }) {
  if (kind === 'folder' || kind === 'folder-open') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M1.5 3.5h4l1.2 1.5H14.5v8H1.5z" opacity="0.9" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M4 1.5h5.5L13 5v9.5H4z" fillOpacity="0.18" />
      <path d="M9.5 1.5V5H13" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

type MenuState = { x: number; y: number; entry: FileEntry } | null;

const FileTreeNode: React.FC<{
  entry: FileEntry;
  depth: number;
  onFileOpen: (path: string, name?: string) => void;
  onContext: (e: React.MouseEvent, entry: FileEntry) => void;
  activeFilePath?: string | null;
}> = ({ entry, depth, onFileOpen, onContext, activeFilePath }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  // null = not loaded yet; [] = loaded and truly empty
  const [children, setChildren] = useState<FileEntry[] | null>(
    entry.is_dir ? (entry.children && entry.children.length > 0 ? entry.children : null) : null
  );
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [loaded, setLoaded] = useState(
    !entry.is_dir || !!(entry.children && entry.children.length > 0)
  );

  const loadChildren = useCallback(async (force = false) => {
    if (!entry.is_dir) return;
    if (!force && loaded) return;
    setLoadingChildren(true);
    try {
      const entries = await invoke<FileEntry[]>('read_dir', { path: entry.path });
      setChildren(entries);
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load children:', err);
      setChildren([]);
      setLoaded(true);
    } finally {
      setLoadingChildren(false);
    }
  }, [entry.is_dir, entry.path, loaded]);

  const handleClick = () => {
    if (entry.is_dir) {
      const next = !isExpanded;
      setIsExpanded(next);
      if (next) void loadChildren();
    } else {
      onFileOpen(entry.path, entry.name);
    }
  };

  const visualMeta = getFileVisualMeta(entry, isExpanded);
  const selected =
    !entry.is_dir && !!activeFilePath && pathsEqual(entry.path, activeFilePath);

  return (
    <div className="file-tree-node" role="treeitem" aria-expanded={entry.is_dir ? isExpanded : undefined}>
      <div
        className={`file-tree-item${!entry.is_dir ? ' file-item' : ''}${selected ? ' selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContext(e, entry)}
        title={entry.path}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <FileTypeIcon kind={visualMeta.kind} label={visualMeta.label} />
        <span className="file-name">{entry.name}</span>
        {loadingChildren && <span className="file-loading-dot">…</span>}
      </div>
      {entry.is_dir && isExpanded && (
        <div className="file-tree-children" role="group">
          {loadingChildren && (
            <div className="file-tree-empty-dir" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              加载中…
            </div>
          )}
          {children?.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onFileOpen={onFileOpen}
              onContext={onContext}
              activeFilePath={activeFilePath}
            />
          ))}
          {loaded && !loadingChildren && children && children.length === 0 && (
            <div className="file-tree-empty-dir" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              空目录
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const FileTree: React.FC<FileTreeProps> = ({
  rootPath,
  onFileOpen,
  onRootChange,
  refreshKey,
  onTreeMutated,
  activeFilePath,
  onPathRenamed,
  onPathDeleted,
  onBeforePathDelete,
}) => {
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [status, setStatus] = useState('');
  const [opsOpen, setOpsOpen] = useState(false);
  const opsRef = useRef<HTMLDivElement>(null);

  const loadTree = useCallback(async () => {
    if (!rootPath) return;
    setLoading(true);
    setError(null);
    try {
      const entries = await invoke<FileEntry[]>('read_dir', { path: rootPath });
      setTree(entries);
    } catch (err) {
      console.error('Failed to load directory:', err);
      setError(`无法加载目录: ${String(err)}`);
      setTree([]);
    }
    setLoading(false);
  }, [rootPath]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!rootPath) return;
      setLoading(true);
      setError(null);
      try {
        const entries = await invoke<FileEntry[]>('read_dir', { path: rootPath });
        if (!cancelled) setTree(entries);
      } catch (err) {
        if (!cancelled) {
          setError(`无法加载目录: ${String(err)}`);
          setTree([]);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [rootPath, refreshKey]);

  useEffect(() => {
    if (!menu && !opsOpen) return;
    const close = (e: MouseEvent) => {
      if (opsOpen && opsRef.current && !opsRef.current.contains(e.target as Node)) {
        setOpsOpen(false);
      }
      if (menu) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpsOpen(false);
        setMenu(null);
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, opsOpen]);

  const mutateDone = async () => {
    await loadTree();
    onTreeMutated?.();
    setMenu(null);
  };

  const createIn = async (dirPath: string, isDir: boolean) => {
    const name = window.prompt(isDir ? '新建文件夹名称' : '新建文件名称', isDir ? 'new-folder' : 'untitled.md');
    if (!name) return;
    const target = joinPath(dirPath, name);
    try {
      if (isDir) await invoke('create_dir', { path: target });
      else await invoke('create_file', { path: target, content: '' });
      setStatus(`已创建: ${name}`);
      await mutateDone();
      if (!isDir) onFileOpen(target, name);
    } catch (err) {
      setStatus(`创建失败: ${String(err)}`);
    }
  };

  const renameEntry = async (entry: FileEntry) => {
    const name = window.prompt('重命名为', entry.name);
    if (!name || name === entry.name) return;
    const parent = entry.path.replace(/[\\/][^\\/]+$/, '');
    const target = joinPath(parent, name);
    try {
      await invoke('rename_path', { from: entry.path, to: target });
      onPathRenamed?.(entry.path, target);
      setStatus(`已重命名: ${name}`);
      await mutateDone();
    } catch (err) {
      setStatus(`重命名失败: ${String(err)}`);
    }
  };

  const deleteEntry = async (entry: FileEntry) => {
    const ok = window.confirm(`确定删除「${entry.name}」？此操作不可撤销。`);
    if (!ok) return;
    try {
      if (onBeforePathDelete) {
        const allowed = await onBeforePathDelete(entry.path);
        if (!allowed) {
          setStatus('已取消删除');
          setMenu(null);
          return;
        }
      }
      await invoke('delete_path', { path: entry.path });
      onPathDeleted?.(entry.path);
      setStatus(`已删除: ${entry.name}`);
      await mutateDone();
    } catch (err) {
      setStatus(`删除失败: ${String(err)}`);
    }
  };

  const copyPath = async (entry: FileEntry) => {
    try {
      await navigator.clipboard.writeText(entry.path);
      setStatus('路径已复制');
    } catch {
      setStatus(entry.path);
    }
    setMenu(null);
  };

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="file-tree-title" title={rootPath}>
          文件浏览
        </span>
        <div className="file-tree-actions">
          <div className={`file-tree-ops ${opsOpen ? 'open' : ''}`} ref={opsRef}>
            <button
              className={`icon-button ${opsOpen ? 'active' : ''}`}
              onClick={() => setOpsOpen((v) => !v)}
              title="新建操作"
              type="button"
              aria-haspopup="menu"
              aria-expanded={opsOpen}
            >
              操作
              <span className="file-tree-ops-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {opsOpen && (
              <div className="file-tree-ops-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="file-tree-ops-item"
                  onClick={() => {
                    setOpsOpen(false);
                    void createIn(rootPath, false);
                  }}
                >
                  新建文件
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="file-tree-ops-item"
                  onClick={() => {
                    setOpsOpen(false);
                    void createIn(rootPath, true);
                  }}
                >
                  新建文件夹
                </button>
              </div>
            )}
          </div>
          <button className="icon-button" onClick={() => void loadTree()} title="刷新" type="button">
            刷新
          </button>
        </div>
      </div>
      {status && <div className="file-tree-status">{status}</div>}
      <div className="file-tree-body" role="tree" aria-label="文件树">
        {loading ? (
          <div className="file-tree-loading">加载中...</div>
        ) : error ? (
          <div className="file-tree-empty">
            <p>{error}</p>
            <button className="btn-select-folder" onClick={() => void loadTree()} type="button">
              重试
            </button>
          </div>
        ) : tree.length === 0 ? (
          <div className="file-tree-empty">
            <p>请选择一个文件夹开始</p>
            <button className="btn-select-folder" onClick={onRootChange} type="button">
              选择文件夹
            </button>
          </div>
        ) : (
          tree.map((entry) => (
            <FileTreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              onFileOpen={onFileOpen}
              activeFilePath={activeFilePath}
              onContext={(e, ent) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ x: e.clientX, y: e.clientY, entry: ent });
              }}
            />
          ))
        )}
      </div>

      {menu && (
        <div className="file-context-menu" style={{ left: menu.x, top: menu.y }}>
          {!menu.entry.is_dir && (
            <button type="button" onClick={() => { onFileOpen(menu.entry.path, menu.entry.name); setMenu(null); }}>
              打开
            </button>
          )}
          {menu.entry.is_dir && (
            <>
              <button type="button" onClick={() => void createIn(menu.entry.path, false)}>新建文件</button>
              <button type="button" onClick={() => void createIn(menu.entry.path, true)}>新建文件夹</button>
            </>
          )}
          <button type="button" onClick={() => void renameEntry(menu.entry)}>重命名</button>
          <button type="button" onClick={() => void copyPath(menu.entry)}>复制路径</button>
          <button type="button" className="danger" onClick={() => void deleteEntry(menu.entry)}>删除</button>
        </div>
      )}
    </div>
  );
};

export default FileTree;
