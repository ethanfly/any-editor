export interface TextStats {
  chars: number;
  charsNoSpace: number;
  words: number;
  lines: number;
  readingMinutes: number;
}

/** Lightweight stats for status bar / writing UX. */
export function computeTextStats(text: string): TextStats {
  const lines = text.length === 0 ? 0 : text.replace(/\r\n/g, '\n').split('\n').length;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;

  // CJK characters count as words; latin uses whitespace split
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/g)?.length ?? 0;
  const latin = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const words = cjk + latin;
  const readingMinutes = Math.max(1, Math.ceil(words / 400));

  return { chars, charsNoSpace, words, lines, readingMinutes };
}
