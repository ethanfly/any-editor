import React, { useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import './EditorPane.css';

interface EditorPaneProps {
  content: string;
  extension: string;
  onContentChange: (content: string) => void;
  onCursorChange?: (line: number) => void;
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
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Listen to cursor position changes
    editor.onDidChangeCursorPosition((e) => {
      onCursorChange?.(e.position.lineNumber);
    });

    editor.focus();
  };

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
        theme="any-editor-pixel"
        beforeMount={(monaco) => {
          // Define custom theme
          monaco.editor.defineTheme('any-editor-pixel', {
            base: 'vs',
            inherit: true,
            rules: [
              { token: 'comment', foreground: '8c9388', fontStyle: 'italic' },
              { token: 'keyword', foreground: '9a7d58', fontStyle: 'bold' },
              { token: 'string', foreground: '6f967d' },
              { token: 'number', foreground: '7d9bad' },
              { token: 'type', foreground: 'aa7774', fontStyle: 'bold' },
              { token: 'function', foreground: '4f6158' },
            ],
            colors: {
              'editor.background': '#fffaf0',
              'editor.foreground': '#425049',
              'editor.lineHighlightBackground': '#e9f1e8',
              'editor.selectionBackground': '#d8e7dc',
              'editorCursor.foreground': '#8eaa9c',
              'editorLineNumber.foreground': '#a39d91',
              'editorLineNumber.activeForeground': '#8eaa9c',
              'editorGutter.background': '#f1eadc',
              'editorIndentGuide.background1': '#ded4c3',
              'editorIndentGuide.activeBackground1': '#8eaa9c',
              'minimap.background': '#f1eadc',
            },
          });
        }}
        options={{
          fontSize: 14,
          fontFamily: "'Fusion Pixel 12px Monospaced', 'Zpix', 'Fixedsys', 'Cascadia Mono', 'Consolas', monospace",
          lineNumbers: 'on',
          minimap: { enabled: true, scale: 0.8 },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          autoIndent: 'full',
          formatOnPaste: true,
          smoothScrolling: false,
          padding: { top: 14, bottom: 14 },
        }}
      />
    </div>
  );
};

export default EditorPane;
