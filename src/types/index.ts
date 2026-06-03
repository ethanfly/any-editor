export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
  extension: string;
}

export interface FileContent {
  path: string;
  content: string;
  extension: string;
}

export interface OpenTab {
  path: string;
  name: string;
  extension: string;
  content: string;
  isModified: boolean;
  isBinary: boolean;
}

export interface OutlineItem {
  level: number;
  text: string;
  line: number;
  id: string;
}

export type ViewMode = 'code' | 'preview' | 'split' | 'wysiwyg';

export const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'html', 'htm', 'css', 'js', 'jsx',
  'ts', 'tsx', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'log', 'env', 'gitignore', 'editorconfig', 'sh', 'bash', 'zsh',
  'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go',
  'rs', 'swift', 'kt', 'scala', 'r', 'sql', 'graphql', 'vue', 'svelte',
  'less', 'scss', 'sass', 'styl', 'csv', 'tsv', 'bat', 'cmd', 'ps1',
  'dockerfile', 'makefile', 'cmake', 'tex', 'rst', 'org', 'asciidoc',
  'diff', 'patch', 'lock', 'license', 'readme',
]);

export const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd']);

export const BINARY_EXTENSIONS = new Set([
  'pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp',
  'mp3', 'wav', 'ogg', 'mp4', 'avi', 'mov', 'zip', 'tar', 'gz',
  'rar', '7z', 'exe', 'dll', 'so', 'dylib', 'ttf', 'otf', 'woff',
  'woff2', 'eot', 'db', 'sqlite', 'bin', 'dat', 'class', 'o', 'obj',
]);
