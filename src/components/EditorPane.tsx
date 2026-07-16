import { useRef, useCallback, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import type { editor, IDisposable } from 'monaco-editor';
import type { ScrollToLine } from '../types';
import type { FindReplaceHandlers } from './FindReplace';
import './EditorPane.css';

interface EditorPaneProps {
  content: string;
  extension: string;
  onContentChange: (content: string) => void;
  onCursorChange?: (line: number) => void;
  scrollToLine?: ScrollToLine;
  onScroll?: (percent: number) => void;
  fontSize?: number;
  colorTheme?: 'light' | 'dark';
  readOnly?: boolean;
  onFindHandlersReady?: (handlers: FindReplaceHandlers | null) => void;
  onRequestFind?: (replaceMode?: boolean) => void;
  onRequestFormat?: () => void;
}

export interface EditorPaneHandle {
  focus: () => void;
  getFindHandlers: () => FindReplaceHandlers | null;
  getSelectionOffsets: () => { start: number; end: number } | null;
  applyTextEdit: (content: string, selection: { start: number; end: number }) => void;
  formatDocument: () => Promise<boolean>;
}

const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
  java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  cs: 'csharp', swift: 'swift', kt: 'kotlin', scala: 'scala',
  php: 'php', html: 'html', htm: 'html', css: 'css',
  scss: 'scss', less: 'less', xml: 'xml', json: 'json',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini',
  sql: 'sql', graphql: 'graphql', md: 'markdown',
  markdown: 'markdown', sh: 'shell', bash: 'shell',
  zsh: 'shell', bat: 'bat', ps1: 'powershell',
  dockerfile: 'dockerfile', makefile: 'makefile',
  vue: 'html', svelte: 'html', r: 'r', tex: 'latex',
  diff: 'diff', env: 'plaintext', log: 'plaintext',
  txt: 'plaintext', gitignore: 'plaintext',
};

function buildSearchRegex(query: string, opts: { caseSensitive: boolean; regex: boolean }): RegExp | null {
  if (!query) return null;
  try {
    if (opts.regex) {
      return new RegExp(query, opts.caseSensitive ? 'g' : 'gi');
    }
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, opts.caseSensitive ? 'g' : 'gi');
  } catch {
    return null;
  }
}

const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(function EditorPane(
  {
    content,
    extension,
    onContentChange,
    onCursorChange,
    scrollToLine,
    onScroll,
    fontSize = 14,
    colorTheme = 'light',
    readOnly = false,
    onFindHandlersReady,
    onRequestFind,
    onRequestFormat,
  },
  ref
) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const onScrollRef = useRef(onScroll);
  const onCursorChangeRef = useRef(onCursorChange);
  const lastNavTokenRef = useRef<number | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);
  const onRequestFindRef = useRef(onRequestFind);
  const onRequestFormatRef = useRef(onRequestFormat);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onScrollRef.current = onScroll;
    onCursorChangeRef.current = onCursorChange;
    onRequestFindRef.current = onRequestFind;
    onRequestFormatRef.current = onRequestFormat;
  }, [onScroll, onCursorChange, onRequestFind, onRequestFormat]);

  const getFindHandlers = useCallback((): FindReplaceHandlers | null => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return null;
    const model = ed.getModel();
    if (!model) return null;

    return {
      findNext: (query, opts) => {
        const re = buildSearchRegex(query, opts);
        if (!re) return 0;
        const matches = model.findMatches(query, false, opts.regex, opts.caseSensitive, null, true);
        if (matches.length === 0) return 0;
        const pos = ed.getPosition() || { lineNumber: 1, column: 1 };
        const idx =
          matches.findIndex(
            (m) =>
              m.range.startLineNumber > pos.lineNumber ||
              (m.range.startLineNumber === pos.lineNumber && m.range.startColumn > pos.column)
          ) % matches.length;
        const target = matches[idx < 0 ? 0 : idx];
        ed.setSelection(target.range);
        ed.revealRangeInCenter(target.range);
        return matches.length;
      },
      findPrev: (query, opts) => {
        const matches = model.findMatches(query, false, opts.regex, opts.caseSensitive, null, true);
        if (matches.length === 0) return 0;
        const pos = ed.getPosition() || { lineNumber: 1, column: 1 };
        let idx = -1;
        for (let i = matches.length - 1; i >= 0; i--) {
          const m = matches[i];
          if (
            m.range.startLineNumber < pos.lineNumber ||
            (m.range.startLineNumber === pos.lineNumber && m.range.startColumn < pos.column)
          ) {
            idx = i;
            break;
          }
        }
        const target = matches[idx < 0 ? matches.length - 1 : idx];
        ed.setSelection(target.range);
        ed.revealRangeInCenter(target.range);
        return matches.length;
      },
      replaceOne: (query, replacement, opts) => {
        const sel = ed.getSelection();
        if (!sel) return false;
        const selected = model.getValueInRange(sel);
        const re = buildSearchRegex(query, { ...opts, regex: opts.regex });
        if (!re) return false;
        // exact selection match against query
        const testRe = buildSearchRegex(`^${opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, {
          caseSensitive: opts.caseSensitive,
          regex: true,
        });
        if (testRe && testRe.test(selected)) {
          ed.executeEdits('replace-one', [{ range: sel, text: replacement }]);
          return true;
        }
        // otherwise find next and replace
        const matches = model.findMatches(query, false, opts.regex, opts.caseSensitive, null, true);
        if (!matches.length) return false;
        const m = matches[0];
        ed.executeEdits('replace-one', [{ range: m.range, text: replacement }]);
        ed.setPosition({ lineNumber: m.range.startLineNumber, column: m.range.startColumn + replacement.length });
        return true;
      },
      replaceAll: (query, replacement, opts) => {
        const matches = model.findMatches(query, false, opts.regex, opts.caseSensitive, null, true);
        if (!matches.length) return 0;
        ed.executeEdits(
          'replace-all',
          matches.map((m) => ({ range: m.range, text: replacement }))
        );
        return matches.length;
      },
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editorRef.current?.focus(),
      getFindHandlers,
      getSelectionOffsets: () => {
        const ed = editorRef.current;
        const model = ed?.getModel();
        if (!ed || !model) return null;
        const sel = ed.getSelection();
        if (!sel) {
          const pos = ed.getPosition();
          if (!pos) return null;
          const offset = model.getOffsetAt(pos);
          return { start: offset, end: offset };
        }
        const start = model.getOffsetAt(sel.getStartPosition());
        const end = model.getOffsetAt(sel.getEndPosition());
        return { start, end };
      },
      applyTextEdit: (nextContent, selection) => {
        const ed = editorRef.current;
        const model = ed?.getModel();
        if (!ed || !model) return;
        const fullRange = model.getFullModelRange();
        ed.pushUndoStop();
        ed.executeEdits('any-editor-format', [
          {
            range: fullRange,
            text: nextContent,
            forceMoveMarkers: true,
          },
        ]);
        ed.pushUndoStop();
        const startPos = model.getPositionAt(
          Math.max(0, Math.min(selection.start, nextContent.length))
        );
        const endPos = model.getPositionAt(
          Math.max(0, Math.min(selection.end, nextContent.length))
        );
        ed.setSelection({
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        });
        ed.focus();
        onContentChange(nextContent);
      },
      formatDocument: async () => {
        const ed = editorRef.current;
        if (!ed) return false;
        const action = ed.getAction('editor.action.formatDocument');
        if (!action) return false;
        try {
          await action.run();
          return true;
        } catch {
          return false;
        }
      },
    }),
    [getFindHandlers, onContentChange]
  );

  useEffect(() => {
    onFindHandlersReady?.(getFindHandlers());
    return () => onFindHandlersReady?.(null);
  }, [getFindHandlers, onFindHandlersReady, content, extension]);

  const handleEditorMount: OnMount = (editorInstance, monaco) => {
    disposablesRef.current.forEach((d) => d.dispose());
    disposablesRef.current = [];

    editorRef.current = editorInstance;
    monacoRef.current = monaco;

    disposablesRef.current.push(
      editorInstance.onDidChangeCursorPosition((e) => {
        onCursorChangeRef.current?.(e.position.lineNumber);
      })
    );

    disposablesRef.current.push(
      editorInstance.onDidScrollChange(() => {
        const scrollTop = editorInstance.getScrollTop();
        const scrollHeight = editorInstance.getScrollHeight();
        const clientHeight = editorInstance.getLayoutInfo().height;
        const maxScroll = Math.max(scrollHeight - clientHeight, 1);
        const percent = Math.min(Math.max(scrollTop / maxScroll, 0), 1);
        onScrollRef.current?.(percent);
      })
    );

    // Override Monaco/browser find with app FindReplace
    disposablesRef.current.push(
      editorInstance.addAction({
        id: 'any-editor.find',
        label: '查找',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF],
        precondition: undefined,
        keybindingContext: undefined,
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: () => onRequestFindRef.current?.(false),
      })
    );
    disposablesRef.current.push(
      editorInstance.addAction({
        id: 'any-editor.replace',
        label: '替换',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH],
        run: () => onRequestFindRef.current?.(true),
      })
    );

    // Chinese context menu: intercept native + Monaco events
    const dom = editorInstance.getDomNode();
    if (dom) {
      const onDomContextMenu = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        setCtxMenu({ x: ev.clientX, y: ev.clientY });
      };
      dom.addEventListener('contextmenu', onDomContextMenu);
      disposablesRef.current.push({
        dispose: () => dom.removeEventListener('contextmenu', onDomContextMenu),
      });
    }
    disposablesRef.current.push(
      editorInstance.onContextMenu((e) => {
        try {
          e.event.preventDefault();
          e.event.stopPropagation();
        } catch {
          // ignore
        }
        const be = e.event.browserEvent as MouseEvent | undefined;
        const x = be?.clientX ?? (typeof e.event.posx === 'number' ? e.event.posx : 0);
        const y = be?.clientY ?? (typeof e.event.posy === 'number' ? e.event.posy : 0);
        setCtxMenu({ x, y });
      })
    );

    editorInstance.focus();
    onFindHandlersReady?.(getFindHandlers());
  };

  useEffect(() => {
    return () => {
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!scrollToLine || !editorRef.current) return;
    if (lastNavTokenRef.current === scrollToLine.token) return;
    lastNavTokenRef.current = scrollToLine.token;

    const editorInstance = editorRef.current;
    const line = Math.max(1, scrollToLine.line);
    editorInstance.revealLineInCenter(line);
    editorInstance.setPosition({ lineNumber: line, column: 1 });
    editorInstance.focus();
  }, [scrollToLine]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        onContentChange(value);
      }
    },
    [onContentChange]
  );

  const language = LANGUAGE_MAP[extension] || 'plaintext';

  return (
    <div className="editor-pane">
      <Editor
        height="100%"
        language={language}
        value={content}
        onChange={handleChange}
        onMount={handleEditorMount}
        theme={colorTheme === 'dark' ? 'any-editor-dark' : 'any-editor-tech'}
        beforeMount={(monaco) => {
          monaco.editor.defineTheme('any-editor-tech', {
            base: 'vs',
            inherit: true,
            rules: [
              { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' },
              { token: 'keyword', foreground: 'F1953F', fontStyle: 'bold' },
              { token: 'string', foreground: '55B981' },
              { token: 'number', foreground: '4F92C7' },
              { token: 'type', foreground: 'E48A4C', fontStyle: 'bold' },
              { token: 'function', foreground: '1F2937' },
            ],
            colors: {
              'editor.background': '#FFFFFF',
              'editor.foreground': '#20242A',
              'editor.lineHighlightBackground': '#FFF7ED',
              'editor.selectionBackground': '#FFE5C2',
              'editorCursor.foreground': '#F1953F',
              'editorLineNumber.foreground': '#B8C0CC',
              'editorLineNumber.activeForeground': '#F1953F',
              'editorGutter.background': '#FBFCFD',
              'editorIndentGuide.background1': '#E9EDF1',
              'editorIndentGuide.activeBackground1': '#FFB46B',
              'minimap.background': '#FBFCFD',
            },
          });
          monaco.editor.defineTheme('any-editor-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'comment', foreground: '7C8693', fontStyle: 'italic' },
              { token: 'keyword', foreground: 'FFB46B', fontStyle: 'bold' },
              { token: 'string', foreground: '9EDDB6' },
              { token: 'number', foreground: '8EB8D8' },
              { token: 'type', foreground: 'F1953F', fontStyle: 'bold' },
              { token: 'function', foreground: 'E8EDF2' },
            ],
            colors: {
              'editor.background': '#1F242B',
              'editor.foreground': '#E8EDF2',
              'editor.lineHighlightBackground': '#2A313A',
              'editor.selectionBackground': '#3A2C1D',
              'editorCursor.foreground': '#FFB46B',
              'editorLineNumber.foreground': '#7C8693',
              'editorLineNumber.activeForeground': '#FFB46B',
              'editorGutter.background': '#1B2026',
              'editorIndentGuide.background1': '#313944',
              'editorIndentGuide.activeBackground1': '#F1953F',
              'minimap.background': '#1B2026',
            },
          });
        }}
        options={{
          fontSize,
          readOnly,
          fontFamily: "'Cascadia Mono', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          lineNumbers: 'on',
          minimap: { enabled: true, scale: 0.8 },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          autoIndent: 'full',
          formatOnPaste: true,
          smoothScrolling: true,
          padding: { top: 14, bottom: 14 },
          contextmenu: false,
          find: {
            addExtraSpaceOnTop: false,
            autoFindInSelection: 'never',
            seedSearchStringFromSelection: 'never',
          },
        }}
      />
      {ctxMenu && (
        <div
          className="editor-context-backdrop"
          onMouseDown={() => setCtxMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtxMenu(null);
          }}
        >
          <div
            className="editor-context-menu"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="editor-context-item"
              disabled={readOnly}
              onClick={() => {
                editorRef.current?.trigger('menu', 'editor.action.clipboardCutAction', null);
                setCtxMenu(null);
              }}
            >
              <span>剪切</span>
              <kbd>Ctrl+X</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              className="editor-context-item"
              onClick={() => {
                editorRef.current?.trigger('menu', 'editor.action.clipboardCopyAction', null);
                setCtxMenu(null);
              }}
            >
              <span>复制</span>
              <kbd>Ctrl+C</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              className="editor-context-item"
              disabled={readOnly}
              onClick={() => {
                editorRef.current?.trigger('menu', 'editor.action.clipboardPasteAction', null);
                setCtxMenu(null);
              }}
            >
              <span>粘贴</span>
              <kbd>Ctrl+V</kbd>
            </button>
            <div className="editor-context-sep" />
            <button
              type="button"
              role="menuitem"
              className="editor-context-item"
              onClick={() => {
                editorRef.current?.trigger('menu', 'editor.action.selectAll', null);
                setCtxMenu(null);
              }}
            >
              <span>全选</span>
              <kbd>Ctrl+A</kbd>
            </button>
            <div className="editor-context-sep" />
            <button
              type="button"
              role="menuitem"
              className="editor-context-item"
              onClick={() => {
                setCtxMenu(null);
                onRequestFindRef.current?.(false);
              }}
            >
              <span>查找</span>
              <kbd>Ctrl+F</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              className="editor-context-item"
              disabled={readOnly}
              onClick={() => {
                setCtxMenu(null);
                onRequestFindRef.current?.(true);
              }}
            >
              <span>替换</span>
              <kbd>Ctrl+H</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              className="editor-context-item"
              disabled={readOnly}
              onClick={() => {
                setCtxMenu(null);
                onRequestFormatRef.current?.();
              }}
            >
              <span>格式化文档</span>
              <kbd>Shift+Alt+F</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default EditorPane;
