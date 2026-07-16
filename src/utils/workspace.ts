import type { ViewMode } from '../types';

export interface WorkspaceState {
  rootPath: string;
  openTabs: string[];
  activeTabPath: string | null;
  viewMode: ViewMode;
  fileTreeVisible: boolean;
  recentFiles: string[];
  updatedAt: number;
}

const KEY = 'any-editor.workspace.v1';
const MAX_RECENT = 20;

export function loadWorkspace(): WorkspaceState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkspaceState;
  } catch {
    return null;
  }
}

export function saveWorkspace(state: Omit<WorkspaceState, 'updatedAt' | 'recentFiles'> & { recentFiles?: string[] }): void {
  const prev = loadWorkspace();
  const payload: WorkspaceState = {
    rootPath: state.rootPath,
    openTabs: state.openTabs.filter((p) => !p.startsWith('untitled:')),
    activeTabPath:
      state.activeTabPath && !state.activeTabPath.startsWith('untitled:')
        ? state.activeTabPath
        : null,
    viewMode: state.viewMode,
    fileTreeVisible: state.fileTreeVisible,
    recentFiles: state.recentFiles ?? prev?.recentFiles ?? [],
    updatedAt: Date.now(),
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function pushRecentFile(path: string): string[] {
  if (!path || path.startsWith('untitled:')) {
    return loadWorkspace()?.recentFiles ?? [];
  }
  const prev = loadWorkspace();
  const next = [path, ...(prev?.recentFiles ?? []).filter((p) => p !== path)].slice(0, MAX_RECENT);
  const base = prev ?? {
    rootPath: '',
    openTabs: [],
    activeTabPath: null,
    viewMode: 'wysiwyg' as ViewMode,
    fileTreeVisible: false,
    recentFiles: [],
    updatedAt: Date.now(),
  };
  localStorage.setItem(
    KEY,
    JSON.stringify({
      ...base,
      recentFiles: next,
      updatedAt: Date.now(),
    })
  );
  return next;
}
