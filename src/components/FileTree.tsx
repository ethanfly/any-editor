import React, { useState, useEffect, useCallback } from 'react';
import type { FileEntry } from '../types';
import './FileTree.css';

interface FileTreeProps {
  rootPath: string;
  onFileOpen: (path: string, name: string) => void;
  onRootChange: () => void;
  refreshKey: number;
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

  const getIcon = () => {
    if (entry.is_dir) {
      return isExpanded ? '📂' : '📁';
    }
    const ext = entry.extension;
    const iconMap: Record<string, string> = {
      md: '📝', markdown: '📝', txt: '📄', pdf: '📕',
      json: '📋', html: '🌐', htm: '🌐', css: '🎨',
      js: '📜', jsx: '📜', ts: '📘', tsx: '📘',
      py: '🐍', rs: '🦀', go: '🔵', java: '☕',
      yml: '⚙️', yaml: '⚙️', toml: '⚙️', xml: '📰',
      svg: '🖼️', png: '🖼️', jpg: '🖼️', jpeg: '🖼️',
      gif: '🖼️', ico: '🖼️', sh: '💻', bash: '💻',
      log: '📊', env: '🔑', lock: '🔒', sql: '🗄️',
    };
    return iconMap[ext] || '📄';
  };

  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-item ${!entry.is_dir ? 'file-item' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        title={entry.path}
      >
        <span className="file-icon">{getIcon()}</span>
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
        <span className="file-tree-title">📁 文件浏览</span>
        <button
          className="icon-button"
          onClick={onRootChange}
          title="切换目录"
        >
          📂
        </button>
        <button
          className="icon-button"
          onClick={loadTree}
          title="刷新"
        >
          🔄
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
