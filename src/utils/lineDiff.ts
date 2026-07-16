export type DiffKind = 'same' | 'add' | 'del';

export interface DiffLine {
  kind: DiffKind;
  text: string;
  leftLine?: number;
  rightLine?: number;
}

/**
 * Minimal LCS line diff for editor-vs-disk comparison.
 * Good enough for typical documents; not a full Myers impl.
 */
export function diffLines(left: string, right: string, maxLines = 4000): DiffLine[] {
  const a = left.replace(/\r\n/g, '\n').split('\n').slice(0, maxLines);
  const b = right.replace(/\r\n/g, '\n').split('\n').slice(0, maxLines);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let leftLine = 1;
  let rightLine = 1;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i], leftLine, rightLine });
      i += 1;
      j += 1;
      leftLine += 1;
      rightLine += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'del', text: a[i], leftLine });
      i += 1;
      leftLine += 1;
    } else {
      out.push({ kind: 'add', text: b[j], rightLine });
      j += 1;
      rightLine += 1;
    }
  }
  while (i < n) {
    out.push({ kind: 'del', text: a[i], leftLine });
    i += 1;
    leftLine += 1;
  }
  while (j < m) {
    out.push({ kind: 'add', text: b[j], rightLine });
    j += 1;
    rightLine += 1;
  }
  return out;
}
