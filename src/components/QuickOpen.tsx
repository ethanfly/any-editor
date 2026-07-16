import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './CommandPalette.css';

interface ListedFile {
  path: string;
  name: string;
  extension: string;
}

interface QuickOpenProps {
  open: boolean;
  rootPath: string;
  recentFiles?: string[];
  onClose: () => void;
  onOpen: (path: string) => void;
}

function score(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 1;
  if (n === q) return 1000;
  if (n.startsWith(q)) return 500;
  if (n.includes(q)) return 200;
  let i = 0;
  for (const ch of n) {
    if (ch === q[i]) i += 1;
    if (i >= q.length) return 50;
  }
  return 0;
}

const QuickOpen: React.FC<QuickOpenProps> = ({ open, rootPath, recentFiles = [], onClose, onOpen }) => {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<ListedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openToken = useRef(0);

  // Reset query when opening via key change on input defaultValue pattern
  const [session, setSession] = useState(0);
  if (open && openToken.current === 0) {
    openToken.current = 1;
  }
  if (!open && openToken.current !== 0) {
    openToken.current = 0;
  }

  useEffect(() => {
    if (!open) return;
    setSession((s) => s + 1);
    setTimeout(() => inputRef.current?.focus(), 0);
    if (!rootPath) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const list = await invoke<ListedFile[]>('list_files', { root: rootPath, maxFiles: 5000 });
        if (!cancelled) setFiles(list);
      } catch {
        if (!cancelled) setFiles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, rootPath]);

  const results = useMemo(() => {
    // session used to reset active selection when reopening
    void session;
    if (!query.trim()) {
      const recent = recentFiles
        .filter((p) => !rootPath || p.startsWith(rootPath))
        .slice(0, 12)
        .map((path) => ({
          path,
          name: path.replace(/\\/g, '/').split('/').pop() || path,
          extension: '',
        }));
      return recent.length ? recent : files.slice(0, 30);
    }
    return files
      .map((f) => ({ f, s: Math.max(score(f.name, query), score(f.path, query) / 2) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.f);
  }, [files, query, recentFiles, rootPath, session]);

  const safeActive = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = results[safeActive];
        if (item) {
          onOpen(item.path);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, safeActive, onOpen, onClose]);

  if (!open) return null;

  return (
    <div className="palette-overlay" onClick={onClose} role="presentation">
      <div className="palette" role="dialog" aria-label="快速打开" onClick={(e) => e.stopPropagation()}>
        <input
          key={session}
          ref={inputRef}
          className="palette-input"
          placeholder={rootPath ? '输入文件名快速打开…' : '请先打开文件夹'}
          defaultValue=""
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
        <div className="palette-list">
          {loading && <div className="palette-empty">索引文件中…</div>}
          {!loading && results.length === 0 && <div className="palette-empty">无匹配文件</div>}
          {results.map((item, idx) => (
            <button
              key={item.path}
              type="button"
              className={`palette-item ${idx === safeActive ? 'active' : ''}`}
              onMouseEnter={() => setActive(idx)}
              onClick={() => {
                onOpen(item.path);
                onClose();
              }}
            >
              <span className="palette-name">{item.name}</span>
              <span className="palette-path">{item.path}</span>
            </button>
          ))}
        </div>
        <div className="palette-hint">↑↓ 选择 · Enter 打开 · Esc 关闭</div>
      </div>
    </div>
  );
};

export default QuickOpen;
