import React from 'react';
import type { AppSettings, DefaultViewMode, ThemeMode } from '../types/settings';
import './SettingsModal.css';

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, settings, onChange, onClose }) => {
  if (!open) return null;

  const patch = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="settings-overlay" onClick={onClose} role="presentation">
      <div
        className="settings-modal"
        role="dialog"
        aria-label="设置"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <h2>设置</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="settings-body">
          <label className="settings-row">
            <span>主题</span>
            <select
              value={settings.theme}
              onChange={(e) => patch('theme', e.target.value as ThemeMode)}
            >
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>

          <label className="settings-row">
            <span>编辑器字号</span>
            <input
              type="number"
              min={12}
              max={28}
              value={settings.fontSize}
              onChange={(e) => patch('fontSize', Number(e.target.value) || 14)}
            />
          </label>

          <label className="settings-row">
            <span>软件界面字号</span>
            <input
              type="number"
              min={11}
              max={20}
              value={settings.uiFontSize}
              onChange={(e) => patch('uiFontSize', Number(e.target.value) || 13)}
              title="影响顶部菜单、文件树、大纲、标签页、状态栏等，不影响中间编辑器"
            />
          </label>

          <label className="settings-row">
            <span>Markdown 默认视图</span>
            <select
              value={settings.defaultMarkdownView}
              onChange={(e) => patch('defaultMarkdownView', e.target.value as DefaultViewMode)}
            >
              <option value="wysiwyg">实时</option>
              <option value="code">源码</option>
              <option value="preview">预览</option>
              <option value="split">分屏</option>
            </select>
          </label>

          <label className="settings-row checkbox">
            <span>自动保存</span>
            <input
              type="checkbox"
              checked={settings.autoSave}
              onChange={(e) => patch('autoSave', e.target.checked)}
            />
          </label>

          <label className="settings-row">
            <span>自动保存间隔 (ms)</span>
            <input
              type="number"
              min={500}
              max={30000}
              step={500}
              disabled={!settings.autoSave}
              value={settings.autoSaveIntervalMs}
              onChange={(e) => patch('autoSaveIntervalMs', Number(e.target.value) || 2000)}
            />
          </label>

          <label className="settings-row checkbox">
            <span>本地历史版本</span>
            <input
              type="checkbox"
              checked={settings.historyEnabled}
              onChange={(e) => patch('historyEnabled', e.target.checked)}
            />
          </label>

          <label className="settings-row">
            <span>每文件保留快照数</span>
            <input
              type="number"
              min={5}
              max={100}
              disabled={!settings.historyEnabled}
              value={settings.historyLimit}
              onChange={(e) => patch('historyLimit', Number(e.target.value) || 30)}
            />
          </label>
        </div>

        <div className="settings-footer">
          <button type="button" className="settings-done" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
