import React, { useRef, useEffect, useCallback, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import './WysiwygEditor.css';

interface WysiwygEditorProps {
  content: string;
  onContentChange: (markdown: string) => void;
  scrollToLine?: number;
}

/* ============================================================
 *  CARET / CURSOR HELPERS
 * ============================================================ */

function getCaretPosition(element: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

function setCaretPosition(element: HTMLElement, position: number) {
  const range = document.createRange();
  const sel = window.getSelection();
  if (!sel) return;
  let charCount = 0;
  let found = false;
  const traverse = (node: Node): boolean => {
    if (found) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (charCount + text.length >= position) {
        range.setStart(node, position - charCount);
        range.collapse(true);
        found = true;
        return true;
      }
      charCount += text.length;
    } else {
      for (const child of Array.from(node.childNodes)) {
        if (traverse(child)) return true;
      }
    }
    return false;
  };
  traverse(element);
  if (!found) {
    range.selectNodeContents(element);
    range.collapse(position <= 0);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function getCurrentLineElement(editor: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.anchorNode;
  while (node && node !== editor) {
    if (node instanceof HTMLElement) {
      if (
        node.classList.contains('md-line') ||
        node.classList.contains('md-blockquote') ||
        node.classList.contains('md-code-block')
      ) {
        return node;
      }
    }
    node = node.parentNode;
  }
  if (editor.children.length > 0) return editor.children[0] as HTMLElement;
  return null;
}

/* ============================================================
 *  HTML ESCAPE
 * ============================================================ */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================
 *  INLINE MARKDOWN PARSER
 * ============================================================ */

const BR_SENTINEL = 'BR';

const HTML_INLINE_TAGS: Array<{
  open: RegExp;
  close: RegExp;
  openRepl: string | ((attrs: string) => string);
  closeRepl: string;
}> = [
  { open: /<br\s*\/?>/gi, close: /<\/br>/gi, openRepl: BR_SENTINEL, closeRepl: '' },
  { open: /<sub(\s[^>]*)?>/gi, close: /<\/sub>/gi, openRepl: '~', closeRepl: '~' },
  { open: /<sup(\s[^>]*)?>/gi, close: /<\/sup>/gi, openRepl: '^', closeRepl: '^' },
  { open: /<b(\s[^>]*)?>/gi, close: /<\/b>/gi, openRepl: '**', closeRepl: '**' },
  { open: /<strong(\s[^>]*)?>/gi, close: /<\/strong>/gi, openRepl: '**', closeRepl: '**' },
  { open: /<i(\s[^>]*)?>/gi, close: /<\/i>/gi, openRepl: '*', closeRepl: '*' },
  { open: /<em(\s[^>]*)?>/gi, close: /<\/em>/gi, openRepl: '*', closeRepl: '*' },
  { open: /<del(\s[^>]*)?>/gi, close: /<\/del>/gi, openRepl: '~~', closeRepl: '~~' },
  { open: /<s(\s[^>]*)?>/gi, close: /<\/s>/gi, openRepl: '~~', closeRepl: '~~' },
  { open: /<strike(\s[^>]*)?>/gi, close: /<\/strike>/gi, openRepl: '~~', closeRepl: '~~' },
  { open: /<mark(\s[^>]*)?>/gi, close: /<\/mark>/gi, openRepl: '==', closeRepl: '==' },
  { open: /<code(\s[^>]*)?>/gi, close: /<\/code>/gi, openRepl: '`', closeRepl: '`' },
  { open: /<kbd(\s[^>]*)?>/gi, close: /<\/kbd>/gi, openRepl: '`', closeRepl: '`' },
];

function expandHtmlInline(text: string): string {
  let result = text;
  for (const tag of HTML_INLINE_TAGS) {
    result = result.replace(tag.open, (_m, attrs) =>
      typeof tag.openRepl === 'function' ? tag.openRepl(attrs || '') : tag.openRepl
    );
    result = result.replace(tag.close, tag.closeRepl);
  }
  return result;
}

function decodeEscapes(text: string): string {
  return text.replace(/\\([\\`*_{}\[\]()#+\-.!>~^=|:])/g, '$1');
}

function parseInlineMarkdown(text: string): string {
  let working = expandHtmlInline(text);

  // Extract code spans first
  const codeSpans: string[] = [];
  working = working.replace(/`([^`\n]+?)`/g, (_match, code: string) => {
    const idx = codeSpans.push(`<code class="md-code">${escapeHtml(code)}</code>`) - 1;
    return `CODE${idx}`;
  });

  working = decodeEscapes(working);
  working = escapeHtml(working);

  // Re-extract after escape (handles code spans that were escaped)
  working = working.replace(/`([^`\n]+?)`/g, (_match, code: string) => {
    const idx = codeSpans.push(`<code class="md-code">${escapeHtml(code)}</code>`) - 1;
    return `CODE${idx}`;
  });

  // Images & Links
  working = working
    .replace(/!\[([^\]]*?)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      (_m, alt: string, url: string, title?: string) =>
        `<img src="${url}" alt="${alt}"${title ? ` title="${title}"` : ''} class="md-image">`)
    .replace(/!\[([^\]]*?)\]\(([^)]+?)\)/g, '<img src="$2" alt="$1" class="md-image">')
    .replace(/\[([^\]]+?)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      (_m, label: string, url: string, title?: string) =>
        `<a href="${url}"${title ? ` title="${title}"` : ''} class="md-link">${label}</a>`)
    .replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, '<a href="$2" class="md-link">$1</a>');

  // Auto-links
  working = working
    .replace(/&lt;(https?:\/\/[^\s<>]+)&gt;/g, '<a href="$1" class="md-link">$1</a>')
    .replace(/&lt;([\w.+-]+@[\w-]+(\.[\w-]+)+)&gt;/g, '<a href="mailto:$1" class="md-link">$1</a>');

  // Inline formatting
  working = working
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong class="md-bold">$1</strong>')
    .replace(/__([^_\n]+?)__/g, '<strong class="md-bold">$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em class="md-italic">$1</em>')
    .replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<em class="md-italic">$1</em>')
    .replace(/~~([^~\n]+?)~~/g, '<del class="md-strike">$1</del>')
    .replace(/==([^=\n]+?)==/g, '<mark class="md-highlight">$1</mark>')
    .replace(/\^([^^\n]+?)\^/g, '<sup class="md-superscript">$1</sup>')
    .replace(/(?<!~)~([^~\n]+?)~(?!~)/g, '<sub class="md-subscript">$1</sub>');

  // Restore code spans
  working = working.replace(/CODE(\d+)/g, (_m, idx: string) => codeSpans[Number(idx)] ?? '');
  working = working.split(BR_SENTINEL).join('<br>');
  return working;
}

/* ============================================================
 *  BLOCK TYPE DETECTION
 * ============================================================ */

interface BlockType {
  type: string;
  prefix: string;
  content: string;
  level?: number;
  checked?: boolean;
  num?: string;
}

function detectBlockType(text: string): BlockType | null {
  const hMatch = text.match(/^(#{1,6})$/);
  if (hMatch) return { type: 'heading', prefix: hMatch[1], content: '', level: hMatch[1].length };

  const ulMatch = text.match(/^([-*])$/);
  if (ulMatch) return { type: 'ul', prefix: ulMatch[1], content: '' };

  const olMatch = text.match(/^(\d+)\.$/);
  if (olMatch) return { type: 'ol', prefix: olMatch[1] + '.', content: '', num: olMatch[1] };

  const taskMatch = text.match(/^- \[([ xX])\]$/);
  if (taskMatch)
    return { type: 'task', prefix: '- [' + taskMatch[1] + ']', content: '', checked: taskMatch[1].toLowerCase() === 'x' };

  if (text === '>') return { type: 'blockquote', prefix: '>', content: '' };
  if (/^(---|\*\*\*|___)$/.test(text)) return { type: 'hr', prefix: text, content: '' };
  if (text === '```') return { type: 'code', prefix: '```', content: '' };
  return null;
}

/* ============================================================
 *  HTML ELEMENT GENERATOR
 * ============================================================ */

function createLineElement(blockType: BlockType, content: string = ''): HTMLElement {
  const div = document.createElement('div');
  div.className = 'md-line';
  switch (blockType.type) {
    case 'heading':
      div.setAttribute('data-type', `h${blockType.level}`);
      div.innerHTML = content ? parseInlineMarkdown(content) : '<br>';
      break;
    case 'ul':
      div.setAttribute('data-type', 'li');
      div.setAttribute('data-list', 'ul');
      div.innerHTML = content ? parseInlineMarkdown(content) : '<br>';
      break;
    case 'ol':
      div.setAttribute('data-type', 'li');
      div.setAttribute('data-list', 'ol');
      div.setAttribute('data-num', blockType.num || '1');
      div.innerHTML = content ? parseInlineMarkdown(content) : '<br>';
      break;
    case 'task':
      div.className = 'md-line md-task';
      div.setAttribute('data-type', 'task');
      div.setAttribute('data-checked', String(blockType.checked || false));
      div.innerHTML =
        `<input type="checkbox" ${blockType.checked ? 'checked' : ''}><span class="md-task-text">${content ? parseInlineMarkdown(content) : ''}</span>`;
      break;
    default:
      div.setAttribute('data-type', 'p');
      div.innerHTML = content ? parseInlineMarkdown(content) : '<br>';
  }
  return div;
}

/* ============================================================
 *  MARKDOWN → HTML (for initial display)
 * ============================================================ */

function parseMarkdownToHtml(md: string): string {
  if (!md) return '<div class="md-line" data-type="p"><br></div>';

  const lines = md.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeLanguage = '';
  let codeLines: string[] = [];
  let headingIndex = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^```(.*)$/);
    if (fenceMatch) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = fenceMatch[1].trim();
        codeLines = [];
      } else {
        result.push(
          `<pre id="block-code-${headingIndex}" class="md-code-block" data-lang="${codeLanguage}"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
        );
        headingIndex += 1;
        inCodeBlock = false;
        codeLanguage = '';
        codeLines = [];
      }
      i += 1;
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      i += 1;
      continue;
    }

    // Heading
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      result.push(
        `<div id="heading-${headingIndex}" class="md-line" data-type="h${hMatch[1].length}">${parseInlineMarkdown(hMatch[2])}</div>`
      );
      headingIndex += 1;
      i += 1;
      continue;
    }

    // Task list
    const taskMatch = line.match(/^([-*])\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      const checked = taskMatch[2].toLowerCase() === 'x';
      result.push(
        `<div class="md-line md-task" data-type="task" data-checked="${checked}"><input type="checkbox" ${checked ? 'checked' : ''}><span class="md-task-text">${parseInlineMarkdown(taskMatch[3])}</span></div>`
      );
      i += 1;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      result.push(
        `<div class="md-line" data-type="li" data-list="ul">${parseInlineMarkdown(ulMatch[1])}</div>`
      );
      i += 1;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      result.push(
        `<div class="md-line" data-type="li" data-list="ol" data-num="${olMatch[1]}">${parseInlineMarkdown(olMatch[2])}</div>`
      );
      i += 1;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      result.push(
        `<blockquote class="md-blockquote">${parseInlineMarkdown(line.slice(2))}</blockquote>`
      );
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)$/.test(line.trim())) {
      result.push('<hr class="md-hr">');
      i += 1;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      result.push('<div class="md-line" data-type="p"><br></div>');
      i += 1;
      continue;
    }

    // Default paragraph
    result.push(
      `<div class="md-line" data-type="p">${parseInlineMarkdown(line)}</div>`
    );
    i += 1;
  }

  if (inCodeBlock) {
    result.push(
      `<pre class="md-code-block" data-lang="${codeLanguage}"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`
    );
  }

  return result.join('');
}

/* ============================================================
 *  HTML → MARKDOWN (serializer)
 * ============================================================ */

function htmlToMarkdown(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const processNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const className = el.className || '';
    const dataType = el.getAttribute('data-type') || '';
    const children = Array.from(el.childNodes).map(processNode).join('');

    // Code block
    if (tag === 'pre' && className.includes('md-code-block')) {
      const lang = el.getAttribute('data-lang') || '';
      const code = el.querySelector('code')?.textContent || '';
      return `\`\`\`${lang}\n${code}\n\`\`\`\n`;
    }

    // Line elements
    if (tag === 'div' && className.includes('md-line')) {
      switch (dataType) {
        case 'h1': return `# ${children}\n`;
        case 'h2': return `## ${children}\n`;
        case 'h3': return `### ${children}\n`;
        case 'h4': return `#### ${children}\n`;
        case 'h5': return `##### ${children}\n`;
        case 'h6': return `###### ${children}\n`;
        case 'li': {
          const listType = el.getAttribute('data-list');
          const num = el.getAttribute('data-num') || '1';
          return listType === 'ol' ? `${num}. ${children}\n` : `- ${children}\n`;
        }
        case 'task': {
          const checked = el.getAttribute('data-checked') === 'true';
          return `- [${checked ? 'x' : ' '}] ${children}\n`;
        }
        case 'p':
        default:
          return `${children}\n`;
      }
    }

    // Blockquote
    if (tag === 'blockquote') return `> ${children}\n`;

    // HR
    if (tag === 'hr') return '---\n';

    // Inline formatting
    if (className.includes('md-bold') || tag === 'strong' || tag === 'b') return `**${children}**`;
    if (className.includes('md-italic') || tag === 'em' || tag === 'i') return `*${children}*`;
    if (className.includes('md-strike') || tag === 'del' || tag === 's' || tag === 'strike') return `~~${children}~~`;
    if (className.includes('md-highlight') || tag === 'mark') return `==${children}==`;
    if (className.includes('md-code') || tag === 'kbd' || (tag === 'code' && !el.closest('pre'))) return `\`${children}\``;
    if (className.includes('md-superscript') || tag === 'sup') return `^${children}^`;
    if (className.includes('md-subscript') || tag === 'sub') return `~${children}~`;
    if (className.includes('md-link') || tag === 'a') {
      const href = el.getAttribute('href') || '';
      return `[${children}](${href})`;
    }
    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '';
      return `![${alt}](${src})`;
    }
    if (tag === 'br') return '';
    if (tag === 'input') return '';
    if (tag === 'span') return children;

    return children;
  };

  return Array.from(temp.childNodes)
    .map(processNode)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ============================================================
 *  SYNTAX HIGHLIGHTING
 * ============================================================ */

function applySyntaxHighlighting(root: HTMLElement): void {
  root.querySelectorAll('.md-code-block code').forEach((block) => {
    const pre = block.parentElement;
    const lang = pre?.getAttribute('data-lang') || '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        const result = hljs.highlight(block.textContent || '', { language: lang });
        block.innerHTML = result.value;
      } catch {
        // highlight.js may throw on edge cases — leave raw text
      }
    }
  });
}

/* ============================================================
 *  HEADING ID SYNC
 * ============================================================ */

function syncHeadingIds(editor: HTMLElement) {
  let headingIndex = 0;
  Array.from(editor.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    const type = child.getAttribute('data-type');
    if (type && /^h[1-6]$/.test(type)) {
      child.id = `heading-${headingIndex}`;
      headingIndex += 1;
    } else if (child.id.startsWith('heading-')) {
      child.removeAttribute('id');
    }
  });
}

/* ============================================================
 *  WYSIWYG EDITOR COMPONENT
 * ============================================================ */

const WysiwygEditor: React.FC<WysiwygEditorProps> = ({ content, onContentChange, scrollToLine }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isInternalChange, setIsInternalChange] = useState(false);
  const onChangeRef = useRef(onContentChange);
  onChangeRef.current = onContentChange;

  // Initialize content
  useEffect(() => {
    if (editorRef.current && !isInternalChange) {
      const currentMd = htmlToMarkdown(editorRef.current.innerHTML);
      if (currentMd !== content) {
        editorRef.current.innerHTML = parseMarkdownToHtml(content);
        syncHeadingIds(editorRef.current);
        applySyntaxHighlighting(editorRef.current);
      }
    }
  }, [content, isInternalChange]);

  // Scroll to line when outline is clicked
  useEffect(() => {
    if (scrollToLine && editorRef.current) {
      const editor = editorRef.current;
      // Try heading ID first
      const headingEl = editor.querySelector(`#heading-${scrollToLine - 1}`);
      if (headingEl) {
        headingEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      // Fallback: scroll to Nth child block
      const blocks = editor.children;
      const idx = Math.min(scrollToLine - 1, blocks.length - 1);
      if (idx >= 0 && blocks[idx]) {
        blocks[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [scrollToLine]);

  // Update content
  const updateContent = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setIsInternalChange(true);
    syncHeadingIds(editor);
    const md = htmlToMarkdown(editor.innerHTML);
    onChangeRef.current(md);
    applySyntaxHighlighting(editor);
    setTimeout(() => setIsInternalChange(false), 0);
  }, []);

  // Handle input
  const handleInput = useCallback(
    (e: React.FormEvent) => {
      const editor = editorRef.current;
      if (!editor) return;

      const lineEl = getCurrentLineElement(editor);
      if (!lineEl) return;

      const text = lineEl.textContent || '';
      const pos = getCaretPosition(lineEl);

      // Check task list inside ul
      if (lineEl.getAttribute('data-type') === 'li' && lineEl.getAttribute('data-list') === 'ul') {
        const taskInListMatch = text.match(/^\s*\[([ xX])\]\s*(.*)$/);
        if (taskInListMatch) {
          const checked = taskInListMatch[1].toLowerCase() === 'x';
          const taskContent = (taskInListMatch[2] || '').replace(/^\s+/, '');
          const taskEl = createLineElement(
            { type: 'task', prefix: `- [${taskInListMatch[1]}]`, content: '', checked },
            taskContent
          );
          lineEl.replaceWith(taskEl);
          const textTarget = taskEl.querySelector('.md-task-text');
          setCaretPosition((textTarget as HTMLElement) || taskEl, taskContent.length);
          updateContent();
          return;
        }
      }

      // Space after markdown prefix → convert block type
      if (e.nativeEvent instanceof InputEvent && e.nativeEvent.data === ' ') {
        const textBeforeSpace = text.substring(0, pos - 1).trim();
        const blockType = detectBlockType(textBeforeSpace);
        if (blockType) {
          const contentAfter = text.substring(pos);
          const newEl = createLineElement(blockType, contentAfter);
          lineEl.replaceWith(newEl);
          setCaretPosition(newEl, contentAfter.length);
          updateContent();
          return;
        }
      }

      updateContent();
    },
    [updateContent]
  );

  // Handle keydown
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const editor = editorRef.current;
      if (!editor) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const lineEl = getCurrentLineElement(editor);

      // Enter: create new paragraph
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (lineEl) {
          const newLine = document.createElement('div');
          newLine.className = 'md-line';
          newLine.setAttribute('data-type', 'p');
          newLine.innerHTML = '<br>';
          lineEl.after(newLine);
          setCaretPosition(newLine, 0);
        }
        updateContent();
        return;
      }

      // Tab: indent
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
        updateContent();
        return;
      }

      // Ctrl+B: bold
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        document.execCommand('bold');
        updateContent();
        return;
      }

      // Ctrl+I: italic
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        document.execCommand('italic');
        updateContent();
        return;
      }
    },
    [updateContent]
  );

  return (
    <div className="wysiwyg-editor">
      <div
        ref={editorRef}
        className="wysiwyg-content"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={updateContent}
        spellCheck={false}
      />
    </div>
  );
};

export default WysiwygEditor;
