import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { HistoryEntry } from '../types';
import './HistoryPanel.css';

interface HistoryPanelProps {
  open: boolean;
  filePath: string | null;
  onClose: () => void;
  onRestore: (content: string) => void;
}

function formatTime(ms: number): string {
  if (!ms) return '-';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ open, filePath, onClose, onRestore }) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canLoad = open && !!filePath && !filePath.startsWith('untitled:');

  useEffect(() => {
    if (!canLoad || !filePath) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await invoke<HistoryEntry[]>('list_history', { path: filePath });
        if (!cancelled) setEntries(list);
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setEntries([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canLoad, filePath]);

  if (!open) return null;

  return (
    <div className="history-overlay" onClick={onClose} role="presentation">
      <div className="history-panel" role="dialog" aria-label="历史版本" onClick={(e) => e.stopPropagation()}>
        <div className="history-header">
          <div>
            <h2>本地历史</h2>
            <p className="history-path" title={filePath || ''}>
              {filePath || '未选择文件'}
            </p>
          </div>
          <button type="button" className="history-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="history-body">
          {!canLoad && <div className="history-empty">请先保存文件后再查看历史版本。</div>}
          {canLoad && loading && <div className="history-empty">加载中…</div>}
          {canLoad && error && <div className="history-empty">{error}</div>}
          {canLoad && !loading && !error && entries.length === 0 && (
            <div className="history-empty">暂无历史快照。保存文件后会自动记录。</div>
          )}
          {canLoad &&
            entries.map((entry) => (
              <div key={entry.id} className="history-item">
                <div className="history-meta">
                  <strong>{formatTime(entry.saved_at)}</strong>
                  <span>{entry.size} bytes</span>
                </div>
                <p className="history-preview">{entry.preview || '（空内容）'}</p>
                <button
                  type="button"
                  className="history-restore"
                  onClick={() => {
                    void invoke<string>('read_history_snapshot', {
                      path: filePath,
                      id: entry.id,
                    }).then((content) => {
                      onRestore(content);
                      onClose();
                    });
                  }}
                >
                  恢复此版本
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default HistoryPanel;
