export type ThemeMode = 'light' | 'dark';
export type DefaultViewMode = 'wysiwyg' | 'code' | 'preview' | 'split';

export interface AppSettings {
  theme: ThemeMode;
  fontSize: number;
  autoSave: boolean;
  autoSaveIntervalMs: number;
  historyEnabled: boolean;
  historyLimit: number;
  defaultMarkdownView: DefaultViewMode;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  fontSize: 14,
  autoSave: true,
  autoSaveIntervalMs: 2000,
  historyEnabled: true,
  historyLimit: 30,
  defaultMarkdownView: 'wysiwyg',
};

const STORAGE_KEY = 'any-editor.settings.v1';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
