import { useEffect, useRef, useState, useCallback } from 'react';
import './FindReplace.css';

export interface FindReplaceHandlers {
  findNext: (query: string, opts: { caseSensitive: boolean; regex: boolean }) => number;
  findPrev: (query: string, opts: { caseSensitive: boolean; regex: boolean }) => number;
  replaceOne: (query: string, replacement: string, opts: { caseSensitive: boolean; regex: boolean }) => boolean;
  replaceAll: (query: string, replacement: string, opts: { caseSensitive: boolean; regex: boolean }) => number;
}

interface FindReplaceProps {
  open: boolean;
  onClose: () => void;
  handlers: FindReplaceHandlers | null;
  allowReplace?: boolean;
}

const FindReplace: React.FC<FindReplaceProps> = ({ open, onClose, handlers, allowReplace = true }) => {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [status, setStatus] = useState('');
  const findRef = useRef<HTMLInputElement>(null);

  const opts = { caseSensitive, regex: useRegex };

  const doFind = useCallback(
    (dir: 'next' | 'prev') => {
      if (!handlers || !query) {
        setStatus('输入搜索内容');
        return;
      }
      const findOpts = { caseSensitive, regex: useRegex };
      const count =
        dir === 'next' ? handlers.findNext(query, findOpts) : handlers.findPrev(query, findOpts);
      setStatus(count > 0 ? `找到 ${count} 处` : '未找到');
    },
    [handlers, query, caseSensitive, useRegex]
  );

  useEffect(() => {
    if (open) {
      setTimeout(() => findRef.current?.select(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        doFind(e.shiftKey ? 'prev' : 'next');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, doFind]);

  if (!open) return null;

  const doReplace = () => {
    if (!handlers || !query) return;
    const ok = handlers.replaceOne(query, replacement, opts);
    setStatus(ok ? '已替换 1 处' : '未找到可替换项');
  };

  const doReplaceAll = () => {
    if (!handlers || !query) return;
    const n = handlers.replaceAll(query, replacement, opts);
    setStatus(n > 0 ? `已全部替换 ${n} 处` : '未找到可替换项');
  };

  return (
    <div className="find-replace" role="dialog" aria-label="查找替换">
      <div className="find-replace-row">
        <input
          ref={findRef}
          className="find-input"
          value={query}
          placeholder="查找"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              doFind(e.shiftKey ? 'prev' : 'next');
            }
          }}
        />
        <button type="button" className="find-btn" onClick={() => doFind('prev')} title="上一个">
          ↑
        </button>
        <button type="button" className="find-btn" onClick={() => doFind('next')} title="下一个">
          ↓
        </button>
        <button type="button" className="find-btn ghost" onClick={onClose} title="关闭">
          ×
        </button>
      </div>

      {allowReplace && (
        <div className="find-replace-row">
          <input
            className="find-input"
            value={replacement}
            placeholder="替换为"
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                doReplace();
              }
            }}
          />
          <button type="button" className="find-btn text" onClick={doReplace}>
            替换
          </button>
          <button type="button" className="find-btn text" onClick={doReplaceAll}>
            全部
          </button>
        </div>
      )}

      <div className="find-replace-row options">
        <label>
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          区分大小写
        </label>
        <label>
          <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
          正则
        </label>
        <span className="find-status">{status}</span>
      </div>
    </div>
  );
};

export default FindReplace;
