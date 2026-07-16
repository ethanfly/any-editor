export type FormatAction =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'highlight'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'quote'
  | 'ul'
  | 'ol'
  | 'task'
  | 'link'
  | 'image'
  | 'codeblock'
  | 'hr'
  | 'table'
  | 'formatDoc';

export interface TextSelection {
  start: number;
  end: number;
}

export interface FormatResult {
  content: string;
  selection: TextSelection;
}

const TABLE_SNIPPET = `| 列1 | 列2 | 列3 |
| --- | --- | --- |
|  |  |  |
`;

function lineRangeForOffset(content: string, start: number, end: number): { lineStart: number; lineEnd: number } {
  let lineStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let lineEnd = content.indexOf('\n', end);
  if (lineEnd < 0) lineEnd = content.length;
  // include full lines touched by selection
  if (start !== end) {
    lineStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lastNl = content.indexOf('\n', Math.max(end - 1, 0));
    lineEnd = lastNl < 0 ? content.length : lastNl;
  }
  return { lineStart, lineEnd };
}

function selectedText(content: string, sel: TextSelection): string {
  return content.slice(sel.start, sel.end);
}

function replaceRange(
  content: string,
  start: number,
  end: number,
  replacement: string,
  cursorStart: number,
  cursorEnd: number
): FormatResult {
  return {
    content: content.slice(0, start) + replacement + content.slice(end),
    selection: { start: cursorStart, end: cursorEnd },
  };
}

function wrapInline(
  content: string,
  sel: TextSelection,
  before: string,
  after: string,
  placeholder = '文本'
): FormatResult {
  const text = selectedText(content, sel);
  if (text) {
    // toggle if already wrapped
    if (text.startsWith(before) && text.endsWith(after) && text.length >= before.length + after.length) {
      const inner = text.slice(before.length, text.length - after.length);
      return replaceRange(content, sel.start, sel.end, inner, sel.start, sel.start + inner.length);
    }
    const next = `${before}${text}${after}`;
    return replaceRange(content, sel.start, sel.end, next, sel.start + before.length, sel.start + before.length + text.length);
  }
  const next = `${before}${placeholder}${after}`;
  const start = sel.start + before.length;
  return replaceRange(content, sel.start, sel.end, next, start, start + placeholder.length);
}

function prefixLines(
  content: string,
  sel: TextSelection,
  prefixFor: (line: string, index: number) => string,
  stripRe?: RegExp
): FormatResult {
  const { lineStart, lineEnd } = lineRangeForOffset(content, sel.start, sel.end);
  const block = content.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const nextLines = lines.map((line, i) => {
    const stripped = stripRe ? line.replace(stripRe, '') : line;
    return prefixFor(stripped, i);
  });
  const replacement = nextLines.join('\n');
  return replaceRange(
    content,
    lineStart,
    lineEnd,
    replacement,
    lineStart,
    lineStart + replacement.length
  );
}

function insertBlock(content: string, sel: TextSelection, block: string): FormatResult {
  const needsLead = sel.start > 0 && content[sel.start - 1] !== '\n';
  const needsTrail = sel.end < content.length && content[sel.end] !== '\n';
  const text = selectedText(content, sel);
  let body = block;
  if (text && block.includes('```')) {
    body = `\`\`\`\n${text}\n\`\`\`\n`;
  } else if (text && block.startsWith('[')) {
    body = `[${text}](url)`;
  }
  const insertion = `${needsLead ? '\n\n' : ''}${body}${needsTrail ? '\n' : ''}`;
  const start = sel.start + (needsLead ? 2 : 0);
  return replaceRange(content, sel.start, sel.end, insertion, start, start + body.length);
}

/** Light markdown document cleanup */
export function formatMarkdownDocument(content: string): string {
  let text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // trim trailing spaces (keep 2-space hard breaks as intentional -> reduce 3+ to 0)
  text = text
    .split('\n')
    .map((line) => {
      if (/ {2}$/.test(line)) return line.replace(/ +$/, '  ');
      return line.replace(/[ \t]+$/g, '');
    })
    .join('\n');
  // collapse 3+ blank lines to 2
  text = text.replace(/\n{3,}/g, '\n\n');
  // ensure single trailing newline
  text = text.replace(/\n*$/, '\n');
  return text;
}

export function applyMarkdownFormat(
  content: string,
  sel: TextSelection,
  action: FormatAction
): FormatResult {
  const safeSel: TextSelection = {
    start: Math.max(0, Math.min(sel.start, content.length)),
    end: Math.max(0, Math.min(sel.end, content.length)),
  };
  if (safeSel.end < safeSel.start) {
    const t = safeSel.start;
    safeSel.start = safeSel.end;
    safeSel.end = t;
  }

  switch (action) {
    case 'bold':
      return wrapInline(content, safeSel, '**', '**', '加粗文本');
    case 'italic':
      return wrapInline(content, safeSel, '*', '*', '斜体文本');
    case 'strike':
      return wrapInline(content, safeSel, '~~', '~~', '删除线');
    case 'code':
      return wrapInline(content, safeSel, '`', '`', 'code');
    case 'highlight':
      return wrapInline(content, safeSel, '==', '==', '高亮');
    case 'h1':
      return prefixLines(content, safeSel, (line) => `# ${line.replace(/^#{1,6}\s+/, '')}`, /^#{1,6}\s+/);
    case 'h2':
      return prefixLines(content, safeSel, (line) => `## ${line.replace(/^#{1,6}\s+/, '')}`, /^#{1,6}\s+/);
    case 'h3':
      return prefixLines(content, safeSel, (line) => `### ${line.replace(/^#{1,6}\s+/, '')}`, /^#{1,6}\s+/);
    case 'quote':
      return prefixLines(
        content,
        safeSel,
        (line) => (line.startsWith('> ') ? line : `> ${line}`),
        /^>\s?/
      );
    case 'ul':
      return prefixLines(
        content,
        safeSel,
        (line) => {
          const bare = line.replace(/^\s*([-*+]|\d+\.)\s+/, '').replace(/^\s*\[[ xX]\]\s+/, '');
          return `- ${bare}`;
        },
        /^\s*([-*+]|\d+\.)\s+/
      );
    case 'ol':
      return prefixLines(
        content,
        safeSel,
        (line, i) => {
          const bare = line.replace(/^\s*([-*+]|\d+\.)\s+/, '').replace(/^\s*\[[ xX]\]\s+/, '');
          return `${i + 1}. ${bare}`;
        },
        /^\s*([-*+]|\d+\.)\s+/
      );
    case 'task':
      return prefixLines(
        content,
        safeSel,
        (line) => {
          const bare = line
            .replace(/^\s*([-*+]|\d+\.)\s+/, '')
            .replace(/^\s*\[[ xX]\]\s+/, '');
          return `- [ ] ${bare}`;
        },
        /^\s*([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/
      );
    case 'link': {
      const text = selectedText(content, safeSel) || '链接文字';
      const next = `[${text}](url)`;
      const urlStart = safeSel.start + text.length + 3;
      return replaceRange(content, safeSel.start, safeSel.end, next, urlStart, urlStart + 3);
    }
    case 'image': {
      const text = selectedText(content, safeSel) || '图片描述';
      const next = `![${text}](path)`;
      const pathStart = safeSel.start + text.length + 4;
      return replaceRange(content, safeSel.start, safeSel.end, next, pathStart, pathStart + 4);
    }
    case 'codeblock':
      return insertBlock(content, safeSel, '```\n\n```\n');
    case 'hr':
      return insertBlock(content, safeSel, '---\n');
    case 'table':
      return insertBlock(content, safeSel, TABLE_SNIPPET);
    case 'formatDoc': {
      const next = formatMarkdownDocument(content);
      return { content: next, selection: { start: 0, end: 0 } };
    }
    default:
      return { content, selection: safeSel };
  }
}

export const FORMAT_LABELS: Record<FormatAction, string> = {
  bold: '加粗',
  italic: '斜体',
  strike: '删除线',
  code: '行内代码',
  highlight: '高亮',
  h1: '标题 1',
  h2: '标题 2',
  h3: '标题 3',
  quote: '引用',
  ul: '无序列表',
  ol: '有序列表',
  task: '任务列表',
  link: '链接',
  image: '图片',
  codeblock: '代码块',
  hr: '分隔线',
  table: '表格',
  formatDoc: '格式化文档',
};
