import { useEffect, useRef, useState, type FC } from 'react';
import type { ViewMode } from '../types';
import type { FormatAction } from '../utils/markdownFormat';
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
  onFormat?: (action: FormatAction) => void;
  onFormatDocument?: () => void;
  onMinifyJson?: () => void;
  isJson?: boolean;
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
  canFormat?: boolean;
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

type MenuKey = 'file' | 'format' | 'edit' | 'export' | 'more' | null;

interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  hidden?: boolean;
  separator?: boolean;
}

function MenuDropdown({
  label,
  open,
  onToggle,
  items,
  align = 'left',
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  items: MenuItem[];
  align?: 'left' | 'right';
}) {
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  return (
    <div className={`toolbar-menu ${open ? 'open' : ''}`}>
      <button
        type="button"
        className={`toolbar-btn toolbar-menu-trigger ${open ? 'active' : ''}`}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <span className="toolbar-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className={`toolbar-menu-panel align-${align}`} role="menu">
          {visible.map((item) =>
            item.separator ? (
              <div key={item.id} className="toolbar-menu-sep" role="separator" />
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`toolbar-menu-item ${item.active ? 'active' : ''} ${item.danger ? 'danger' : ''}`}
                onClick={() => {
                  item.onClick?.();
                }}
              >
                <span>{item.label}</span>
                {item.hint && <kbd>{item.hint}</kbd>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

const VIEW_MODES: Array<{ id: ViewMode; label: string; title: string }> = [
  { id: 'wysiwyg', label: '实时', title: '所见即所得' },
  { id: 'code', label: '源码', title: 'Markdown 源码' },
  { id: 'preview', label: '预览', title: '纯预览' },
  { id: 'split', label: '分屏', title: '源码 + 预览' },
];

const Toolbar: FC<ToolbarProps> = ({
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
  onFormat,
  onFormatDocument,
  onMinifyJson,
  isJson = false,
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
  canFormat = true,
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
  const [menu, setMenu] = useState<MenuKey>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const closeAnd = (fn?: () => void) => () => {
    setMenu(null);
    fn?.();
  };

  const toggle = (key: Exclude<MenuKey, null>) => {
    setMenu((cur) => (cur === key ? null : key));
  };

  const format = (action: FormatAction) => closeAnd(() => onFormat?.(action));

  const fileItems: MenuItem[] = [
    { id: 'new', label: '新建文档', hint: 'Ctrl+N', onClick: closeAnd(onNewFile), hidden: !onNewFile },
    { id: 'open-file', label: '打开文件', hint: 'Ctrl+Shift+O', onClick: closeAnd(onOpenFile) },
    { id: 'open-folder', label: '打开文件夹', hint: 'Ctrl+O', onClick: closeAnd(onOpenFolder) },
    { id: 'quick', label: '快速打开…', hint: 'Ctrl+P', onClick: closeAnd(onQuickOpen), hidden: !onQuickOpen },
    { id: 'save-as', label: '另存为', hint: 'Ctrl+Shift+S', onClick: closeAnd(onSaveAs), hidden: !onSaveAs },
    { id: 'history', label: '本地历史', onClick: closeAnd(onHistory), hidden: !onHistory },
  ];

  const formatItems: MenuItem[] = [
    { id: 'format-doc', label: '格式化文档', hint: 'Shift+Alt+F', onClick: closeAnd(onFormatDocument), hidden: !onFormatDocument },
    { id: 'minify-json', label: '压缩 JSON', onClick: closeAnd(onMinifyJson), hidden: !isJson || !onMinifyJson },
    { id: 'sep-0', label: '', separator: true, hidden: !isMarkdown || !onFormat },
    { id: 'bold', label: '加粗', hint: 'Ctrl+B', onClick: format('bold'), hidden: !isMarkdown || !onFormat },
    { id: 'italic', label: '斜体', hint: 'Ctrl+I', onClick: format('italic'), hidden: !isMarkdown || !onFormat },
    { id: 'strike', label: '删除线', onClick: format('strike'), hidden: !isMarkdown || !onFormat },
    { id: 'code', label: '行内代码', onClick: format('code'), hidden: !isMarkdown || !onFormat },
    { id: 'highlight', label: '高亮', onClick: format('highlight'), hidden: !isMarkdown || !onFormat },
    { id: 'sep-1', label: '', separator: true, hidden: !isMarkdown || !onFormat },
    { id: 'h1', label: '标题 1', onClick: format('h1'), hidden: !isMarkdown || !onFormat },
    { id: 'h2', label: '标题 2', onClick: format('h2'), hidden: !isMarkdown || !onFormat },
    { id: 'h3', label: '标题 3', onClick: format('h3'), hidden: !isMarkdown || !onFormat },
    { id: 'sep-2', label: '', separator: true, hidden: !isMarkdown || !onFormat },
    { id: 'ul', label: '无序列表', onClick: format('ul'), hidden: !isMarkdown || !onFormat },
    { id: 'ol', label: '有序列表', onClick: format('ol'), hidden: !isMarkdown || !onFormat },
    { id: 'task', label: '任务列表', onClick: format('task'), hidden: !isMarkdown || !onFormat },
    { id: 'quote', label: '引用', onClick: format('quote'), hidden: !isMarkdown || !onFormat },
    { id: 'sep-3', label: '', separator: true, hidden: !isMarkdown || !onFormat },
    { id: 'link', label: '链接', onClick: format('link'), hidden: !isMarkdown || !onFormat },
    { id: 'image', label: '图片', onClick: format('image'), hidden: !isMarkdown || !onFormat },
    { id: 'codeblock', label: '代码块', onClick: format('codeblock'), hidden: !isMarkdown || !onFormat },
    { id: 'hr', label: '分隔线', onClick: format('hr'), hidden: !isMarkdown || !onFormat },
    { id: 'table', label: '表格', onClick: format('table'), hidden: !isMarkdown || !onFormat },
  ];

  const editItems: MenuItem[] = [
    {
      id: 'focus',
      label: focusMode ? '退出专注' : '专注模式',
      hint: 'Ctrl+\\',
      onClick: closeAnd(onFocusMode),
      active: !!focusMode,
      hidden: !onFocusMode,
    },
    {
      id: 'csv',
      label: csvTableMode ? 'CSV 源码视图' : 'CSV 表格视图',
      onClick: closeAnd(onToggleCsvView),
      active: !!csvTableMode,
      hidden: !onToggleCsvView,
    },
    { id: 'diff', label: '与磁盘比较', hint: 'Ctrl+Shift+D', onClick: closeAnd(onDiff), hidden: !onDiff },
    { id: 'utf8', label: '以 UTF-8 重开', onClick: closeAnd(onReopenUtf8), hidden: !onReopenUtf8 },
    { id: 'gbk', label: '以 GBK 重开', onClick: closeAnd(onReopenGbk), hidden: !onReopenGbk },
  ];

  const exportItems: MenuItem[] = [
    { id: 'html', label: '导出 HTML', onClick: closeAnd(onExportHtml), hidden: !onExportHtml },
    { id: 'pdf', label: '导出 / 打印 PDF', onClick: closeAnd(onExportPdf), hidden: !onExportPdf },
  ];

  const moreItems: MenuItem[] = [
    { id: 'search', label: '项目搜索', hint: 'Ctrl+Shift+F', onClick: closeAnd(onSearchProject), hidden: !onSearchProject },
    { id: 'shortcuts', label: '快捷键', hint: 'Ctrl+/', onClick: closeAnd(onShortcuts), hidden: !onShortcuts },
  ];

  return (
    <div className="toolbar" ref={rootRef}>
      <div className="toolbar-left">
        {hasFileTree && (
          <button
            className={`toolbar-btn toolbar-btn-icon ${fileTreeVisible ? 'active' : ''}`}
            onClick={onToggleFileTree}
            title={fileTreeVisible ? '隐藏文件目录' : '显示文件目录'}
            type="button"
          >
            目录
          </button>
        )}

        <MenuDropdown
          label="文件"
          open={menu === 'file'}
          onToggle={() => toggle('file')}
          items={fileItems}
        />

        <button
          className={`toolbar-btn toolbar-btn-primary ${!canSave ? 'disabled' : ''}`}
          onClick={onSave}
          disabled={!canSave}
          title="保存 (Ctrl+S)"
          type="button"
        >
          保存
        </button>

        {onFind && (
          <button className="toolbar-btn" onClick={onFind} title="查找替换 (Ctrl+F)" type="button">
            查找
          </button>
        )}

        <div className="toolbar-divider" />

        {(onFormat || onFormatDocument) && (
          <MenuDropdown
            label="格式"
            open={menu === 'format'}
            onToggle={() => toggle('format')}
            items={formatItems}
          />
        )}

        {isMarkdown && onFormat && (
          <div className="toolbar-format-quick" aria-label="常用格式">
            <button
              type="button"
              className="toolbar-btn toolbar-format-btn"
              title="加粗 (Ctrl+B)"
              disabled={!canFormat}
              onClick={() => onFormat('bold')}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-format-btn"
              title="斜体 (Ctrl+I)"
              disabled={!canFormat}
              onClick={() => onFormat('italic')}
            >
              <em>I</em>
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-format-btn"
              title="行内代码"
              disabled={!canFormat}
              onClick={() => onFormat('code')}
            >
              {'</>'}
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-format-btn"
              title="标题 2"
              disabled={!canFormat}
              onClick={() => onFormat('h2')}
            >
              H2
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-format-btn"
              title="无序列表"
              disabled={!canFormat}
              onClick={() => onFormat('ul')}
            >
              ••
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-format-btn"
              title="链接"
              disabled={!canFormat}
              onClick={() => onFormat('link')}
            >
              链
            </button>
          </div>
        )}

        {onFormatDocument && (
          <button
            type="button"
            className={`toolbar-btn ${!canFormat ? 'disabled' : ''}`}
            disabled={!canFormat}
            title="格式化文档 (Shift+Alt+F)"
            onClick={onFormatDocument}
          >
            格式化
          </button>
        )}

        <MenuDropdown
          label="编辑"
          open={menu === 'edit'}
          onToggle={() => toggle('edit')}
          items={editItems}
        />
        <MenuDropdown
          label="导出"
          open={menu === 'export'}
          onToggle={() => toggle('export')}
          items={exportItems}
        />
        <MenuDropdown
          label="更多"
          open={menu === 'more'}
          onToggle={() => toggle('more')}
          items={moreItems}
        />
      </div>

      <div className="toolbar-center">
        {isMarkdown ? (
          <div className="toolbar-view-modes" role="tablist" aria-label="Markdown 视图">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={viewMode === mode.id}
                className={`view-mode-btn ${viewMode === mode.id ? 'active' : ''}`}
                onClick={() => onViewModeChange(mode.id)}
                title={mode.title}
              >
                {mode.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="toolbar-view-placeholder">编辑器</div>
        )}

        <div className="toolbar-file-meta">
          {fileName ? (
            <>
              <span className="toolbar-file-info">
                {isModified && <span className="modified-dot">●</span>}
                <span className="toolbar-file-name" title={fileName}>
                  {fileName}
                </span>
              </span>
              <div className="toolbar-file-flags">
                {autoSaveEnabled && <span className="autosave-badge">自动保存</span>}
                {focusMode && <span className="focus-badge">专注</span>}
              </div>
            </>
          ) : (
            <span className="toolbar-file-empty">未打开文件</span>
          )}
        </div>
      </div>

      <div className="toolbar-right">
        {hasOutline && (
          <button
            className={`toolbar-btn toolbar-btn-icon ${outlineVisible ? 'active' : ''}`}
            onClick={onToggleOutline}
            title={outlineVisible ? '隐藏大纲' : '显示大纲'}
            type="button"
          >
            大纲
          </button>
        )}
        {onSettings && (
          <button
            className="toolbar-btn toolbar-btn-icon"
            onClick={onSettings}
            title="设置"
            type="button"
          >
            设置
          </button>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
