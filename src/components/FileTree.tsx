import React, { useState, useEffect, useCallback } from 'react';
import type { FileEntry } from '../types';
import './FileTree.css';

interface FileTreeProps {
  rootPath: string;
  onFileOpen: (path: string, name: string) => void;
  onRootChange: () => void;
  refreshKey: number;
}

interface FileVisualMeta {
  kind: string;
  label: string;
}

function getFileVisualMeta(entry: FileEntry, isExpanded: boolean): FileVisualMeta {
  if (entry.is_dir) {
    return {
      kind: isExpanded ? 'folder-open' : 'folder',
      label: isExpanded ? 'OPEN' : 'DIR',
    };
  }

  const ext = entry.extension.toLowerCase();
  const extensionMap: Record<string, FileVisualMeta> = {
    md: { kind: 'markdown', label: 'MD' },
    markdown: { kind: 'markdown', label: 'MD' },
    mdown: { kind: 'markdown', label: 'MD' },
    mkd: { kind: 'markdown', label: 'MD' },
    txt: { kind: 'text', label: 'TXT' },
    log: { kind: 'text', label: 'LOG' },
    json: { kind: 'json', label: 'JSON' },
    jsonc: { kind: 'json', label: 'JSON' },
    html: { kind: 'web', label: 'HTML' },
    htm: { kind: 'web', label: 'HTML' },
    css: { kind: 'style', label: 'CSS' },
    scss: { kind: 'style', label: 'SCSS' },
    less: { kind: 'style', label: 'LESS' },
    js: { kind: 'script', label: 'JS' },
    jsx: { kind: 'script', label: 'JSX' },
    ts: { kind: 'typescript', label: 'TS' },
    tsx: { kind: 'typescript', label: 'TSX' },
    py: { kind: 'python', label: 'PY' },
    rs: { kind: 'rust', label: 'RS' },
    go: { kind: 'go', label: 'GO' },
    java: { kind: 'java', label: 'JAVA' },
    yml: { kind: 'config', label: 'YML' },
    yaml: { kind: 'config', label: 'YML' },
    toml: { kind: 'config', label: 'TOML' },
    xml: { kind: 'config', label: 'XML' },
    ini: { kind: 'config', label: 'INI' },
    env: { kind: 'secret', label: 'ENV' },
    lock: { kind: 'lock', label: 'LOCK' },
    pdf: { kind: 'pdf', label: 'PDF' },
    png: { kind: 'image', label: 'IMG' },
    jpg: { kind: 'image', label: 'IMG' },
    jpeg: { kind: 'image', label: 'IMG' },
    gif: { kind: 'image', label: 'IMG' },
    svg: { kind: 'image', label: 'SVG' },
    ico: { kind: 'image', label: 'ICO' },
    sh: { kind: 'shell', label: 'SH' },
    bash: { kind: 'shell', label: 'SH' },
    zsh: { kind: 'shell', label: 'SH' },
    bat: { kind: 'shell', label: 'BAT' },
    ps1: { kind: 'shell', label: 'PS' },
    sql: { kind: 'database', label: 'SQL' },
    zip: { kind: 'archive', label: 'ZIP' },
    rar: { kind: 'archive', label: 'RAR' },
    '7z': { kind: 'archive', label: '7Z' },
  };

  return extensionMap[ext] || {
    kind: 'file',
    label: ext ? ext.slice(0, 4).toUpperCase() : 'FILE',
  };
}

function FileTypeIcon({ kind, label }: { kind: string; label: string }) {
  return (
    <span className={`file-icon ${kind}`} aria-hidden="true" title={label}>
      <FileIconSvg kind={kind} />
      <span className="file-icon-label">{label}</span>
    </span>
  );
}

function FileIconSvg({ kind }: { kind: string }) {
  switch (kind) {
    case 'folder':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.5 3.5h4.5l1.5-1.5h5a1 1 0 0 1 1 1V6h-12V3.5Z" opacity="0.5"/>
          <path d="M1.5 5.5h13a.5.5 0 0 1 .5.5v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5.5Z"/>
        </svg>
      );
    case 'folder-open':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.5 3.5h4.5l1.5-1.5h5a1 1 0 0 1 1 1V5H2.2a.8.8 0 0 0-.8.7l-.7 6.8 1-8.5Z" opacity="0.5"/>
          <path d="M2.2 5h11.6a.8.8 0 0 1 .8.7l.9 7.5a.5.5 0 0 1-.5.55H2.2a.7.7 0 0 1-.7-.6L.5 5.7A.5.5 0 0 1 1 5h1.2Z"/>
        </svg>
      );
    case 'typescript':
    case 'script':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 2h12l-1 12-5.5 1.5L2 14V2Z" opacity="0.15"/>
          <path d="M3 3h10v1H3V3Zm0 2h8v1H3V5Zm0 2h9v1H3V7Zm0 2h7v1H3V9Zm0 2h5v1H3v-1Z"/>
        </svg>
      );
    case 'python':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1C5.5 1 5.3 2 5.3 2v2.5h3V5H4.5C3 5 2.5 6 2.5 6v2s-.1 1.5 1.5 1.5H5v-1.5c0-1 .9-1.8 1.8-1.8h2.7s1.5 0 1.5-1.5V2.2C11 2.2 11.2 1 8 1Z" opacity="0.6"/>
          <path d="M8 15c2.5 0 2.7-1 2.7-1v-2.5h-3V11h3.5c1.5 0 2-1 2-1V8s.1-1.5-1.5-1.5H11v1.5c0 1-.9 1.8-1.8 1.8H6.5S5 9.8 5 11.3v2.5c0 0-.2 1.2 3 1.2Z" opacity="0.6"/>
        </svg>
      );
    case 'rust':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="6" opacity="0.15"/>
          <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.5A4.5 4.5 0 1 1 3.5 8 4.5 4.5 0 0 1 8 3.5Z"/>
          <circle cx="8" cy="8" r="2"/>
        </svg>
      );
    case 'go':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="6" opacity="0.12"/>
          <path d="M5.5 5h1.8c.8 0 1.2.4 1.2 1s-.4 1-1.2 1H5.5V5Zm0 3h2c.8 0 1.3.4 1.3 1s-.5 1-1.3 1H5.5V8Zm3.8-3h1.2v5H9.3V5Z"/>
        </svg>
      );
    case 'java':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="2" width="12" height="12" rx="2" opacity="0.12"/>
          <path d="M5.5 4h1.8c1.2 0 1.8.6 1.8 1.5 0 .8-.5 1.3-1.3 1.5.9.1 1.4.7 1.4 1.5 0 1-.7 1.5-1.9 1.5H5.5V4Zm2.4 3h.6c.6 0 1-.3 1-.8s-.4-.7-1-.7h-.6V7Zm0 2.5h.7c.7 0 1.1-.3 1.1-.9s-.4-.9-1.1-.9h-.7v1.8Z"/>
        </svg>
      );
    case 'markdown':
    case 'text':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="1" width="12" height="14" rx="2" opacity="0.15"/>
          <rect x="4" y="4" width="8" height="1" rx="0.5"/>
          <rect x="4" y="6" width="8" height="1" rx="0.5" opacity="0.7"/>
          <rect x="4" y="8" width="6" height="1" rx="0.5" opacity="0.5"/>
          <rect x="4" y="10" width="7" height="1" rx="0.5" opacity="0.5"/>
        </svg>
      );
    case 'json':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M5 3H3.5a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5H5v-1H4V4h1V3Zm6 0h1.5a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H11v-1h1V4h-1V3Z"/>
          <circle cx="5.5" cy="6" r="0.7"/>
          <circle cx="5.5" cy="10" r="0.7"/>
          <circle cx="10.5" cy="6" r="0.7"/>
          <circle cx="10.5" cy="10" r="0.7"/>
        </svg>
      );
    case 'style':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="14" height="14" rx="2" opacity="0.12"/>
          <path d="M4 4h2v1H5v6h1v1H4V4Zm4 0h2v1H9v2h1v1H9v3H8V4Zm3 0h2v1h-1v2h1v1h-1v3h-1V4Z"/>
        </svg>
      );
    case 'web':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="6" opacity="0.12"/>
          <ellipse cx="8" cy="8" rx="3" ry="6" opacity="0.15"/>
          <path d="M2 8h12M8 2v12"/>
        </svg>
      );
    case 'config':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="3" opacity="0.15"/>
          <path d="M8 2.5a.8.8 0 0 1 .8.8v1.2a4 4 0 0 1 1 .4l.9-.9a.8.8 0 0 1 1.1 0l.8.8a.8.8 0 0 1 0 1.1l-.9.9a4 4 0 0 1 .4 1h1.2a.8.8 0 0 1 .8.8v1.1a.8.8 0 0 1-.8.8h-1.2a4 4 0 0 1-.4 1l.9.9a.8.8 0 0 1 0 1.1l-.8.8a.8.8 0 0 1-1.1 0l-.9-.9a4 4 0 0 1-1 .4v1.2a.8.8 0 0 1-.8.8H7.2a.8.8 0 0 1-.8-.8v-1.2a4 4 0 0 1-1-.4l-.9.9a.8.8 0 0 1-1.1 0l-.8-.8a.8.8 0 0 1 0-1.1l.9-.9a4 4 0 0 1-.4-1H1.5a.8.8 0 0 1-.8-.8V9.2a.8.8 0 0 1 .8-.8h1.2a4 4 0 0 1 .4-1l-.9-.9a.8.8 0 0 1 0-1.1l.8-.8a.8.8 0 0 1 1.1 0l.9.9a4 4 0 0 1 1-.4V3.3a.8.8 0 0 1 .8-.8H8Z"/>
        </svg>
      );
    case 'image':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="2" width="14" height="12" rx="2" opacity="0.12"/>
          <circle cx="5.5" cy="6" r="1.5" opacity="0.4"/>
          <path d="M1 11l4-4 2.5 2.5 3-3L15 11v1a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-1Z" opacity="0.3"/>
        </svg>
      );
    case 'pdf':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="1" width="12" height="14" rx="2" opacity="0.15"/>
          <rect x="4" y="3" width="8" height="10" rx="1" opacity="0.2"/>
          <text x="8" y="10.5" textAnchor="middle" fontSize="5.5" fontWeight="800" fill="currentColor" opacity="0.8">PDF</text>
        </svg>
      );
    case 'secret':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="6" r="3" opacity="0.15"/>
          <rect x="3" y="8" width="10" height="5" rx="1" opacity="0.15"/>
          <path d="M8 9v2M5.5 9.5h5"/>
        </svg>
      );
    case 'lock':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="3" y="6" width="10" height="8" rx="1.5"/>
          <path d="M5.5 6V4.5a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="currentColor" strokeWidth="1.3"/>
          <circle cx="8" cy="10" r="1.2"/>
        </svg>
      );
    case 'database':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <ellipse cx="8" cy="3" rx="5" ry="2" opacity="0.2"/>
          <path d="M3 3v10c0 1.1 2.2 2 5 2s5-.9 5-2V3" opacity="0.15"/>
          <ellipse cx="8" cy="8" rx="5" ry="1.8" fill="none" stroke="currentColor" strokeWidth="0.8"/>
          <path d="M3 3c0 1.1 2.2 2 5 2s5-.9 5-2" fill="none" stroke="currentColor" strokeWidth="0.8"/>
        </svg>
      );
    case 'shell':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="2" width="14" height="12" rx="2" opacity="0.12"/>
          <path d="M3.5 5.5 6 8l-2.5 2.5M7 11h5"/>
        </svg>
      );
    case 'archive':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="1" width="12" height="14" rx="1.5" opacity="0.12"/>
          <path d="M2 5h12v2H2V5Z" opacity="0.2"/>
          <rect x="6" y="7" width="4" height="1" opacity="0.4"/>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="1" width="12" height="14" rx="2" opacity="0.15"/>
          <rect x="4" y="5" width="8" height="1" rx="0.5" opacity="0.5"/>
          <rect x="4" y="7" width="6" height="1" rx="0.5" opacity="0.4"/>
          <rect x="4" y="9" width="7" height="1" rx="0.5" opacity="0.4"/>
        </svg>
      );
  }
}

const FileTreeNode: React.FC<{
  entry: FileEntry;
  depth: number;
  onFileOpen: (path: string, name: string) => void;
}> = ({ entry, depth, onFileOpen }) => {
  const [isExpanded, setIsExpanded] = useState(depth < 1);

  const handleClick = () => {
    if (entry.is_dir) {
      setIsExpanded(!isExpanded);
    } else {
      onFileOpen(entry.path, entry.name);
    }
  };

  const visualMeta = getFileVisualMeta(entry, isExpanded);

  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-item ${!entry.is_dir ? 'file-item' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        title={entry.path}
      >
        <FileTypeIcon kind={visualMeta.kind} label={visualMeta.label} />
        <span className="file-name">{entry.name}</span>
      </div>
      {entry.is_dir && isExpanded && entry.children && (
        <div className="file-tree-children">
          {entry.children.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onFileOpen={onFileOpen}
            />
          ))}
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
}) => {
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTree = useCallback(async () => {
    if (!rootPath) return;
    setLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const entries = await invoke<FileEntry[]>('read_dir_recursive', {
        path: rootPath,
      });
      setTree(entries);
    } catch (err) {
      console.error('Failed to load directory:', err);
    }
    setLoading(false);
  }, [rootPath]);

  useEffect(() => {
    loadTree();
  }, [loadTree, refreshKey]);

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="file-tree-title">文件浏览</span>
        <button
          className="icon-button"
          onClick={onRootChange}
          title="切换目录"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4.5h4.5l1.5-2h4.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V5a.5.5 0 0 1 .5-.5Z"/>
          </svg>
          目录
        </button>
        <button
          className="icon-button"
          onClick={loadTree}
          title="刷新"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8a6 6 0 0 1 10.47-4M14 8a6 6 0 0 1-10.47 4"/>
            <path d="M14 3v3h-3M2 13v-3h3"/>
          </svg>
          刷新
        </button>
      </div>
      <div className="file-tree-body">
        {loading ? (
          <div className="file-tree-loading">加载中...</div>
        ) : tree.length === 0 ? (
          <div className="file-tree-empty">
            <p>请选择一个文件夹开始</p>
            <button className="btn-select-folder" onClick={onRootChange}>
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
            />
          ))
        )}
      </div>
    </div>
  );
};

export default FileTree;
