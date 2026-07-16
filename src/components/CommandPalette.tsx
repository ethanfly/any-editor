import { useEffect, useMemo, useRef, useState } from 'react';
import './CommandPalette.css';

export interface CommandItem {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: CommandItem[];
  onClose: () => void;
}

function score(title: string, query: string): number {
  const t = title.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500;
  if (t.includes(q)) return 200;
  return 0;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, commands, onClose }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [session, setSession] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSession((s) => s + 1);
    setQuery('');
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const results = useMemo(() => {
    return commands
      .map((c) => ({ c, s: score(c.title, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }, [commands, query]);

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
          item.run();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, safeActive, onClose]);

  if (!open) return null;

  return (
    <div className="palette-overlay" onClick={onClose} role="presentation">
      <div className="palette" role="dialog" aria-label="命令面板" onClick={(e) => e.stopPropagation()}>
        <input
          key={session}
          ref={inputRef}
          className="palette-input"
          placeholder="输入命令…"
          defaultValue=""
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
        <div className="palette-list">
          {results.length === 0 && <div className="palette-empty">无匹配命令</div>}
          {results.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              className={`palette-item ${idx === safeActive ? 'active' : ''}`}
              onMouseEnter={() => setActive(idx)}
              onClick={() => {
                item.run();
                onClose();
              }}
            >
              <span className="palette-name">{item.title}</span>
              {item.hint && <span className="palette-path">{item.hint}</span>}
            </button>
          ))}
        </div>
        <div className="palette-hint">Ctrl+Shift+P · ↑↓ 选择 · Enter 执行 · Esc 关闭</div>
      </div>
    </div>
  );
};

export default CommandPalette;
