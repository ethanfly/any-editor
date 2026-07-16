import './ShortcutsHelp.css';

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: '文件',
    items: [
      ['Ctrl+N', '新建文档'],
      ['Ctrl+O', '打开文件夹'],
      ['Ctrl+Shift+O', '打开文件'],
      ['Ctrl+S', '保存'],
      ['Ctrl+Shift+S', '另存为'],
      ['Ctrl+W', '关闭标签'],
    ],
  },
  {
    title: '导航',
    items: [
      ['Ctrl+P', '快速打开'],
      ['Ctrl+Shift+F', '项目搜索'],
      ['Ctrl+F', '当前文件查找'],
      ['Ctrl+,', '设置'],
    ],
  },
  {
    title: '写作 / 格式',
    items: [
      ['Ctrl+B', '加粗'],
      ['Ctrl+I', '斜体'],
      ['Shift+Alt+F', '格式化文档'],
      ['Ctrl+\\', '专注模式'],
      ['Ctrl+Shift+D', '与磁盘比较'],
      ['工具栏 格式', '标题/列表/链接/表格等'],
    ],
  },
  {
    title: '编码',
    items: [
      ['工具栏 UTF-8', '以 UTF-8 重开'],
      ['工具栏 GBK', '以 GBK 重开'],
    ],
  },
];

const ShortcutsHelp: React.FC<ShortcutsHelpProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="shortcuts-overlay" onClick={onClose} role="presentation">
      <div
        className="shortcuts-modal"
        role="dialog"
        aria-label="快捷键"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-header">
          <h2>快捷键</h2>
          <button type="button" className="shortcuts-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="shortcuts-body">
          {GROUPS.map((g) => (
            <section key={g.title} className="shortcuts-group">
              <h3>{g.title}</h3>
              <ul>
                {g.items.map(([k, v]) => (
                  <li key={k + v}>
                    <kbd>{k}</kbd>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="shortcuts-footer">按 Ctrl+/ 再次打开 · Esc 关闭</div>
      </div>
    </div>
  );
};

export default ShortcutsHelp;
