import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function markdownToHtmlDocument(title: string, markdown: string): string {
  const body = marked.parse(markdown, { async: false }) as string;
  const safe = DOMPurify.sanitize(body, {
    ADD_ATTR: ['target', 'rel', 'align', 'width', 'height'],
  });
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0 auto;
      max-width: 860px;
      padding: 40px 24px 80px;
      font: 16px/1.75 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #20242a;
      background: #fff;
    }
    h1,h2,h3 { line-height: 1.3; }
    pre { background: #f6f8fa; padding: 12px 14px; border-radius: 10px; overflow: auto; }
    code { font-family: Consolas, "Cascadia Mono", monospace; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #dce3e8; padding: 8px 10px; }
    th { background: #f2f5f4; }
    img { max-width: 100%; }
    blockquote { border-left: 4px solid #f1953f; margin: 0; padding: 4px 12px; color: #5e6673; }
    @media print {
      body { max-width: none; padding: 0; }
    }
  </style>
</head>
<body>
${safe}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const SAMPLE_TABLE = `| 列1 | 列2 | 列3 |
| --- | --- | --- |
| A | B | C |
| D | E | F |
`;
