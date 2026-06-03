import React from 'react';
import type { ViewMode } from '../types';
import './Toolbar.css';

interface ToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSave: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  canSave: boolean;
  fileName: string | null;
  isModified: boolean;
  isMarkdown: boolean;
  fileTreeVisible: boolean;
  onToggleFileTree: () => void;
  outlineVisible: boolean;
  onToggleOutline: () => void;
  hasFileTree: boolean;
  hasOutline: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({
  viewMode,
  onViewModeChange,
  onSave,
  onOpenFile,
  onOpenFolder,
  canSave,
  fileName,
  isModified,
  isMarkdown,
  fileTreeVisible,
  onToggleFileTree,
  outlineVisible,
  onToggleOutline,
  hasFileTree,
  hasOutline,
}) => {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {hasFileTree && (
          <button
            className={`toolbar-btn toolbar-btn-icon ${fileTreeVisible ? 'active' : ''}`}
            onClick={onToggleFileTree}
            title={fileTreeVisible ? '隐藏文件目录' : '显示文件目录'}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4.5h4.5l1.5-2h4.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V5a.5.5 0 0 1 .5-.5Z"/>
            </svg>
            目录
          </button>
        )}
        <button className="toolbar-btn" onClick={onOpenFolder} title="打开文件夹 (Ctrl+O)">
          打开文件夹
        </button>
        <button className="toolbar-btn" onClick={onOpenFile} title="打开文件 (Ctrl+Shift+O)">
          打开文件
        </button>
        <div className="toolbar-divider" />
        <button
          className={`toolbar-btn toolbar-btn-primary ${!canSave ? 'disabled' : ''}`}
          onClick={onSave}
          disabled={!canSave}
          title="保存 (Ctrl+S)"
        >
          保存
        </button>
      </div>

      <div className="toolbar-center">
        {fileName && (
          <span className="toolbar-file-info">
            {isModified && <span className="modified-dot">●</span>}
            {fileName}
          </span>
        )}
      </div>

      <div className="toolbar-right">
        {isMarkdown && (
          <div className="toolbar-view-modes">
            <button
              className={`view-mode-btn ${viewMode === 'wysiwyg' ? 'active' : ''}`}
              onClick={() => onViewModeChange('wysiwyg')}
              title="所见即所得模式"
            >
              实时
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'code' ? 'active' : ''}`}
              onClick={() => onViewModeChange('code')}
              title="源码模式"
            >
              源码
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => onViewModeChange('preview')}
              title="纯预览模式"
            >
              预览
            </button>
          </div>
        )}
        {hasOutline && (
          <button
            className={`toolbar-btn toolbar-btn-icon ${outlineVisible ? 'active' : ''}`}
            onClick={onToggleOutline}
            title={outlineVisible ? '隐藏大纲' : '显示大纲'}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4h12M2 8h8M2 12h5"/>
            </svg>
            大纲
          </button>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
