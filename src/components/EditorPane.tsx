import React, { useRef, useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import './EditorPane.css';

interface EditorPaneProps {
  content: string;
  extension: string;
  onContentChange: (content: string) => void;
  onCursorChange?: (line: number) => void;
  scrollToLine?: number;
  onScroll?: (percent: number) => void;
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

const EditorPane: React.FC<EditorPaneProps> = ({
  content,
  extension,
  onContentChange,
  onCursorChange,
  scrollToLine,
  onScroll,
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Listen to cursor position changes
    editor.onDidChangeCursorPosition((e) => {
      onCursorChange?.(e.position.lineNumber);
    });

    // Listen to scroll changes for synced preview
    editor.onDidScrollChange(() => {
      const scrollTop = editor.getScrollTop();
      const scrollHeight = editor.getScrollHeight();
      const clientHeight = editor.getLayoutInfo().height;
      const maxScroll = Math.max(scrollHeight - clientHeight, 1);
      const percent = Math.min(Math.max(scrollTop / maxScroll, 0), 1);
      onScrollRef.current?.(percent);
    });

    editor.focus();
  };

  // Navigate to a specific line when scrollToLine changes
  useEffect(() => {
    if (scrollToLine && editorRef.current) {
      const editor = editorRef.current;
      editor.revealLineInCenter(scrollToLine);
      editor.setPosition({ lineNumber: scrollToLine, column: 1 });
      editor.focus();
    }
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
        theme="any-editor-tech"
        beforeMount={(monaco) => {
          // Define custom theme
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
        }}
        options={{
          fontSize: 14,
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
        }}
      />
    </div>
  );
};

export default EditorPane;
