import { useMemo, useState, useEffect } from 'react';
import './CsvTableView.css';

interface CsvTableViewProps {
  content: string;
  extension: string;
  onContentChange: (content: string) => void;
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  row.push(cell);
  // avoid trailing empty row from final newline only when file ends with newline and empty
  if (!(row.length === 1 && row[0] === '' && s.endsWith('\n'))) {
    rows.push(row);
  } else if (rows.length === 0) {
    rows.push(['']);
  }
  return rows.length ? rows : [['']];
}

function serializeCsv(rows: string[][], delimiter: string): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const needsQuote =
            cell.includes('"') || cell.includes('\n') || cell.includes('\r') || cell.includes(delimiter);
          if (!needsQuote) return cell;
          return `"${cell.replace(/"/g, '""')}"`;
        })
        .join(delimiter)
    )
    .join('\n');
}

const CsvTableView: React.FC<CsvTableViewProps> = ({ content, extension, onContentChange }) => {
  const delimiter = extension === 'tsv' ? '\t' : ',';
  const [rows, setRows] = useState<string[][]>(() => parseCsv(content, delimiter));
  const [sourceMode, setSourceMode] = useState(false);

  useEffect(() => {
    setRows(parseCsv(content, delimiter));
  }, [content, delimiter]);

  const colCount = useMemo(
    () => Math.max(1, ...rows.map((r) => r.length)),
    [rows]
  );

  const normalized = useMemo(
    () => rows.map((r) => {
      const copy = [...r];
      while (copy.length < colCount) copy.push('');
      return copy;
    }),
    [rows, colCount]
  );

  const commit = (next: string[][]) => {
    setRows(next);
    onContentChange(serializeCsv(next, delimiter));
  };

  const updateCell = (r: number, c: number, value: string) => {
    const next = normalized.map((row, ri) =>
      row.map((cell, ci) => (ri === r && ci === c ? value : cell))
    );
    commit(next);
  };

  const addRow = () => {
    commit([...normalized, Array.from({ length: colCount }, () => '')]);
  };

  const addCol = () => {
    commit(normalized.map((row) => [...row, '']));
  };

  if (sourceMode) {
    return (
      <div className="csv-view">
        <div className="csv-toolbar">
          <button type="button" className="csv-btn active" onClick={() => setSourceMode(false)}>
            表格视图
          </button>
          <span className="csv-meta">{extension.toUpperCase()} · 源码模式</span>
        </div>
        <textarea
          className="csv-source"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="csv-view">
      <div className="csv-toolbar">
        <button type="button" className="csv-btn" onClick={addRow}>
          + 行
        </button>
        <button type="button" className="csv-btn" onClick={addCol}>
          + 列
        </button>
        <button type="button" className="csv-btn" onClick={() => setSourceMode(true)}>
          源码
        </button>
        <span className="csv-meta">
          {normalized.length} 行 · {colCount} 列 · {extension.toUpperCase()}
        </span>
      </div>
      <div className="csv-scroll">
        <table className="csv-table">
          <tbody>
            {normalized.map((row, ri) => (
              <tr key={ri}>
                <th className="csv-row-no">{ri + 1}</th>
                {row.map((cell, ci) => (
                  <td key={ci}>
                    <input
                      className="csv-cell"
                      value={cell}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CsvTableView;
