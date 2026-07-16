import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { diffLines } from '../utils/lineDiff';
import './DiffPanel.css';

interface DiffPanelProps {
  open: boolean;
  filePath: string | null;
  editorContent: string;
  encoding?: string;
  onClose: () => void;
  onReloadDisk: (content: string) => void;
}

const DiffPanel: React.FC<DiffPanelProps> = ({
  open,
  filePath,
  editorContent,
  encoding,
  onClose,
  onReloadDisk,
}) => {
  const [diskContent, setDiskContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !filePath || filePath.startsWith('untitled:')) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<{ content: string }>('read_file', {
          path: filePath,
          encoding: encoding || null,
        });
        if (!cancelled) setDiskContent(result.content);
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setDiskContent(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, filePath, encoding]);

  const lines = useMemo(() => {
    if (diskContent == null) return [];
    return diffLines(diskContent, editorContent);
  }, [diskContent, editorContent]);

  const stats = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const l of lines) {
      if (l.kind === 'add') add += 1;
      if (l.kind === 'del') del += 1;
    }
    return { add, del };
  }, [lines]);

  if (!open) return null;

  return (
    <div className="diff-overlay" onClick={onClose} role="presentation">
      <div className="diff-panel" role="dialog" aria-label="与磁盘比较" onClick={(e) => e.stopPropagation()}>
        <div className="diff-header">
          <div>
            <h2>与磁盘版本比较</h2>
            <p className="diff-path">{filePath}</p>
          </div>
          <button type="button" className="diff-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="diff-toolbar">
          <span className="diff-stat add">+{stats.add}</span>
          <span className="diff-stat del">-{stats.del}</span>
          {diskContent != null && (
            <button
              type="button"
              className="diff-reload"
              onClick={() => {
                onReloadDisk(diskContent);
                onClose();
              }}
            >
              用磁盘版本覆盖编辑器
            </button>
          )}
        </div>

        <div className="diff-body">
          {loading && <div className="diff-empty">读取磁盘文件…</div>}
          {error && <div className="diff-empty">{error}</div>}
          {!loading && !error && diskContent != null && lines.every((l) => l.kind === 'same') && (
            <div className="diff-empty">与磁盘内容一致</div>
          )}
          {!loading &&
            !error &&
            lines.map((l, idx) => (
              <div key={idx} className={`diff-line ${l.kind}`}>
                <span className="diff-gutter">
                  {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}
                </span>
                <span className="diff-no">{l.rightLine ?? l.leftLine ?? ''}</span>
                <span className="diff-text">{l.text || ' '}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default DiffPanel;
