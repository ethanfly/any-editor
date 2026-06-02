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
}) => {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <button className="toolbar-btn" onClick={onOpenFolder} title="打开文件夹 (Ctrl+O)">
          📂 打开文件夹
        </button>
        <button className="toolbar-btn" onClick={onOpenFile} title="打开文件 (Ctrl+Shift+O)">
          📄 打开文件
        </button>
        <div className="toolbar-divider" />
        <button
          className={`toolbar-btn toolbar-btn-primary ${!canSave ? 'disabled' : ''}`}
          onClick={onSave}
          disabled={!canSave}
          title="保存 (Ctrl+S)"
        >
          💾 保存
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
              className={`view-mode-btn ${viewMode === 'code' ? 'active' : ''}`}
              onClick={() => onViewModeChange('code')}
              title="编辑模式"
            >
              📝 编辑
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => onViewModeChange('split')}
              title="分屏模式"
            >
              👥 分屏
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => onViewModeChange('preview')}
              title="预览模式"
            >
              👁 预览
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
