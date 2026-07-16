import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './SearchPanel.css';

interface SearchMatch {
  path: string;
  line: number;
  preview: string;
}

interface SearchPanelProps {
  open: boolean;
  rootPath: string;
  onClose: () => void;
  onOpenMatch: (path: string, line: number) => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ open, rootPath, onClose, onOpenMatch }) => {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const runSearch = async () => {
    if (!rootPath) {
      setError('请先打开文件夹');
      return;
    }
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await invoke<SearchMatch[]>('search_in_files', {
        root: rootPath,
        query,
        maxResults: 200,
        caseSensitive,
      });
      setResults(list);
    } catch (err) {
      setError(String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <strong>在文件中搜索</strong>
        <button type="button" className="search-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </div>
      <div className="search-controls">
        <input
          className="search-input"
          placeholder="搜索内容"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void runSearch();
          }}
        />
        <label className="search-check">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          大小写
        </label>
        <button type="button" className="search-run" onClick={() => void runSearch()}>
          搜索
        </button>
      </div>
      <div className="search-results">
        {loading && <div className="search-empty">搜索中…</div>}
        {error && <div className="search-empty">{error}</div>}
        {!loading && !error && results.length === 0 && (
          <div className="search-empty">输入关键词后回车搜索</div>
        )}
        {results.map((r, i) => (
          <button
            key={`${r.path}:${r.line}:${i}`}
            type="button"
            className="search-item"
            onClick={() => onOpenMatch(r.path, r.line)}
            title={r.path}
          >
            <div className="search-item-meta">
              <span className="search-item-file">{r.path.replace(/\\/g, '/').split('/').pop()}</span>
              <span className="search-item-line">:{r.line}</span>
            </div>
            <div className="search-item-preview">{r.preview}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SearchPanel;
