import React from 'react';
import type { ViewMode } from '../types';
import './Toolbar.css';

interface ToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSave: () => void;
  onSaveAs?: () => void;
  onNewFile?: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onFind?: () => void;
  onQuickOpen?: () => void;
  onSearchProject?: () => void;
  onExportHtml?: () => void;
  onExportPdf?: () => void;
  onInsertTable?: () => void;
  onDiff?: () => void;
  onFocusMode?: () => void;
  focusMode?: boolean;
  onReopenUtf8?: () => void;
  onReopenGbk?: () => void;
  onShortcuts?: () => void;
  onToggleCsvView?: () => void;
  csvTableMode?: boolean;
  onHistory?: () => void;
  onSettings?: () => void;
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
  autoSaveEnabled?: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({
  viewMode,
  onViewModeChange,
  onSave,
  onSaveAs,
  onNewFile,
  onOpenFile,
  onOpenFolder,
  onFind,
  onQuickOpen,
  onSearchProject,
  onExportHtml,
  onExportPdf,
  onInsertTable,
  onDiff,
  onFocusMode,
  focusMode,
  onReopenUtf8,
  onReopenGbk,
  onShortcuts,
  onToggleCsvView,
  csvTableMode,
  onHistory,
  onSettings,
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
  autoSaveEnabled,
}) => {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {hasFileTree && (
          <button
            className={`toolbar-btn toolbar-btn-icon ${fileTreeVisible ? 'active' : ''}`}
            onClick={onToggleFileTree}
            title={fileTreeVisible ? '隐藏文件目录' : '显示文件目录'}
            type="button"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4.5h4.5l1.5-2h4.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V5a.5.5 0 0 1 .5-.5Z"/>
            </svg>
            目录
          </button>
        )}
        {onNewFile && (
          <button className="toolbar-btn" onClick={onNewFile} title="新建文件 (Ctrl+N)" type="button">
            新建
          </button>
        )}
        <button className="toolbar-btn" onClick={onOpenFolder} title="打开文件夹 (Ctrl+O)" type="button">
          打开文件夹
        </button>
        <button className="toolbar-btn" onClick={onOpenFile} title="打开文件 (Ctrl+Shift+O)" type="button">
          打开文件
        </button>
        <div className="toolbar-divider" />
        <button
          className={`toolbar-btn toolbar-btn-primary ${!canSave ? 'disabled' : ''}`}
          onClick={onSave}
          disabled={!canSave}
          title="保存 (Ctrl+S)"
          type="button"
        >
          保存
        </button>
        {onSaveAs && (
          <button className="toolbar-btn" onClick={onSaveAs} title="另存为 (Ctrl+Shift+S)" type="button">
            另存为
          </button>
        )}
        {onFind && (
          <button className="toolbar-btn" onClick={onFind} title="查找替换 (Ctrl+F)" type="button">
            查找
          </button>
        )}
        {onQuickOpen && (
          <button className="toolbar-btn" onClick={onQuickOpen} title="快速打开 (Ctrl+P)" type="button">
            打开…
          </button>
        )}
        {onSearchProject && (
          <button className="toolbar-btn" onClick={onSearchProject} title="在文件中搜索 (Ctrl+Shift+F)" type="button">
            搜项目
          </button>
        )}
        {onInsertTable && (
          <button className="toolbar-btn" onClick={onInsertTable} title="插入 Markdown 表格" type="button">
            表格
          </button>
        )}
        {onExportHtml && (
          <button className="toolbar-btn" onClick={onExportHtml} title="导出 HTML" type="button">
            HTML
          </button>
        )}
        {onExportPdf && (
          <button className="toolbar-btn" onClick={onExportPdf} title="导出/打印 PDF" type="button">
            PDF
          </button>
        )}
        {onDiff && (
          <button className="toolbar-btn" onClick={onDiff} title="与磁盘比较 (Ctrl+Shift+D)" type="button">
            比较
          </button>
        )}
        {onFocusMode && (
          <button
            className={`toolbar-btn ${focusMode ? 'active' : ''}`}
            onClick={onFocusMode}
            title="专注模式 (Ctrl+\\)"
            type="button"
          >
            专注
          </button>
        )}
        {onReopenUtf8 && (
          <button className="toolbar-btn" onClick={onReopenUtf8} title="以 UTF-8 重新打开" type="button">
            UTF-8
          </button>
        )}
        {onReopenGbk && (
          <button className="toolbar-btn" onClick={onReopenGbk} title="以 GBK 重新打开" type="button">
            GBK
          </button>
        )}
        {onToggleCsvView && (
          <button
            className={`toolbar-btn ${csvTableMode ? 'active' : ''}`}
            onClick={onToggleCsvView}
            title="切换 CSV 表格/源码视图"
            type="button"
          >
            {csvTableMode ? 'CSV源码' : 'CSV表格'}
          </button>
        )}
        {onShortcuts && (
          <button className="toolbar-btn" onClick={onShortcuts} title="快捷键 (Ctrl+/)" type="button">
            快捷键
          </button>
        )}
        {onHistory && (
          <button className="toolbar-btn" onClick={onHistory} title="本地历史版本" type="button">
            历史
          </button>
        )}
      </div>

      <div className="toolbar-center">
        {fileName && (
          <span className="toolbar-file-info">
            {isModified && <span className="modified-dot">●</span>}
            {fileName}
            {autoSaveEnabled && <span className="autosave-badge">自动保存</span>}
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
              type="button"
            >
              实时
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'code' ? 'active' : ''}`}
              onClick={() => onViewModeChange('code')}
              title="源码模式"
              type="button"
            >
              源码
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => onViewModeChange('preview')}
              title="纯预览模式"
              type="button"
            >
              预览
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => onViewModeChange('split')}
              title="分屏模式（代码 + 预览）"
              type="button"
            >
              分屏
            </button>
          </div>
        )}
        {hasOutline && (
          <button
            className={`toolbar-btn toolbar-btn-icon ${outlineVisible ? 'active' : ''}`}
            onClick={onToggleOutline}
            title={outlineVisible ? '隐藏大纲' : '显示大纲'}
            type="button"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4h12M2 8h8M2 12h5"/>
            </svg>
            大纲
          </button>
        )}
        {onSettings && (
          <button className="toolbar-btn toolbar-btn-icon" onClick={onSettings} title="设置" type="button">
            设置
          </button>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
