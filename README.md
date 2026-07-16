<p align="center">
  <img src="icon.svg" width="128" alt="Any Editor Icon" />
</p>

<h1 align="center">Any Editor — 万能文件编辑器</h1>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-orange" alt="Platform" />
  <img src="https://img.shields.io/github/v/release/ethanfly/any-editor?color=%23f1953f" alt="Release" />
</p>

<p align="center">跨平台桌面文件编辑器：Markdown 所见即所得、代码高亮、PDF/图片预览、项目搜索与写作增强工具一应俱全。</p>

---

## 功能

| 功能 | 说明 |
| --- | --- |
| Markdown WYSIWYG | Typora 风格实时编辑，支持公式 / Mermaid 按需加载 |
| 代码编辑器 | Monaco Editor：高亮、折叠、多光标、格式化 |
| 格式工具栏 | 加粗/标题/列表/链接/表格等 Markdown 快捷格式 |
| JSON 格式化 | 一键美化 / 压缩，非法 JSON 给出错误提示 |
| PDF 预览 | 内置 PDF.js，支持缩放与翻页 |
| 图片预览 | 打开 png/jpg/gif/webp/svg 等，支持缩放查看 |
| CSV 表格 | 表格视图与源码视图切换 |
| 标签页管理 | 多标签、拖拽排序、横向滚动、自动定位当前标签 |
| 文件树 | 新建/重命名/删除、右键菜单、懒加载目录 |
| 大纲导航 | Markdown 标题大纲，点击跳转 |
| 查找替换 | 当前文件查找替换 |
| 项目搜索 | 在工作区内全文搜索并跳转 |
| 快速打开 | `Ctrl+P` 模糊打开文件 |
| 命令面板 | `Ctrl+Shift+P` 集中执行常用操作 |
| 自动保存 | 可配置间隔自动写盘 |
| 本地历史 | 保存快照，支持回滚 |
| 磁盘变更检测 | 外部修改提示，可比较差异 |
| 深色模式 | 浅色 / 深色主题 |
| 界面字号 | 独立设置「编辑器字号」与「软件界面字号」 |
| 工作区记忆 | 恢复打开目录、标签与窗口几何 |
| 单实例运行 | 二次启动复用已有窗口 |
| 同步滚动 | 分屏模式下编辑与预览滚动联动 |

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+N` | 新建文档 |
| `Ctrl+O` | 打开文件夹 |
| `Ctrl+Shift+O` | 打开文件 |
| `Ctrl+S` / `Ctrl+Shift+S` | 保存 / 另存为 |
| `Ctrl+W` | 关闭标签 |
| `Ctrl+P` | 快速打开 |
| `Ctrl+Shift+P` | 命令面板 |
| `Ctrl+F` | 查找替换 |
| `Ctrl+Shift+F` | 项目搜索 |
| `Ctrl+B` / `Ctrl+I` | 加粗 / 斜体 |
| `Shift+Alt+F` | 格式化文档 |
| `Ctrl+,` | 设置 |
| `Ctrl+/` | 快捷键帮助 |
| `Ctrl+\` | 专注模式 |

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite |
| 编辑器 | Monaco Editor |
| Markdown | marked + highlight.js + KaTeX + Mermaid |
| PDF | pdfjs-dist |
| 桌面框架 | Tauri 2 (Rust) |
| 包管理 | pnpm |

## 安装

从 [GitHub Releases](https://github.com/ethanfly/any-editor/releases) 下载对应平台安装包：

| 平台 | 安装包 | 安装方式 |
| --- | --- | --- |
| Windows | `.exe` (NSIS) | 双击运行，按向导完成安装 |
| macOS | `.dmg` | 打开后拖入「应用程序」文件夹 |
| Linux | `.deb` | `sudo dpkg -i any-editor_*.deb` |

## 开发

### 环境要求

- Node.js 22+
- pnpm 9+
- Rust 1.77+
- Linux 额外依赖：`libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev`

### 启动开发模式

```bash
pnpm install
pnpm tauri dev
```

### 本地打包

```bash
# Windows 安装包
pnpm tauri build --bundles nsis

# 全量打包
pnpm tauri build
```

构建产物：

| 平台 | 安装包路径 |
| --- | --- |
| Windows | `src-tauri/target/release/bundle/nsis/*.exe` |
| macOS | `src-tauri/target/release/bundle/dmg/*.dmg` |
| Linux | `src-tauri/target/release/bundle/deb/*.deb` |

### 生成图标

```bash
node scripts/generate-icons.mjs
```

## CI/CD

推送 `main` 分支时自动触发：

```
push main → Bump Version → 创建版本 Tag → Build & Release
                                 ├── Windows (.exe / NSIS)
                                 ├── macOS (.dmg)
                                 └── Linux (.deb)
```

- **自动版本号**：每次推送自动 bump patch（`0.1.x`），也可手动 minor/major
- **三平台并行构建**：Windows / macOS / Linux
- **自动发布**：构建完成后创建 GitHub Release 并上传安装包
- **手动触发**：Actions 页面可手动运行 `Bump Version` 或 `Build & Release`
- **跳过 CI**：commit message 含 `[skip ci]` 可跳过自动版本更新

### Workflows

| 文件 | 触发条件 | 功能 |
| --- | --- | --- |
| `bump-version.yml` | push main / manual | bump 版本、打 tag，并调用构建 |
| `build.yml` | workflow_call / workflow_dispatch / tag | 三平台编译 + 发布 Release |

## 项目结构

```
any-editor/
├── src/                         # React 前端
│   ├── components/              # UI 组件
│   │   ├── EditorPane.tsx       # Monaco 编辑器
│   │   ├── WysiwygEditor.tsx    # Markdown 实时编辑
│   │   ├── MarkdownPreview.tsx  # Markdown 预览
│   │   ├── PDFPreview.tsx       # PDF 预览
│   │   ├── ImagePreview.tsx     # 图片预览
│   │   ├── FileTree.tsx         # 文件树
│   │   ├── TabBar.tsx           # 标签栏
│   │   ├── Toolbar.tsx          # 工具栏 / 菜单
│   │   ├── Outline.tsx          # 大纲
│   │   └── ...
│   ├── hooks/                   # 自定义 Hooks
│   ├── types/                   # 类型与设置
│   └── utils/                   # 格式化、导出、工作区等工具
├── src-tauri/                   # Rust 后端 (Tauri)
│   ├── src/
│   │   ├── lib.rs
│   │   └── main.rs
│   └── icons/
├── public/                      # 静态资源
├── scripts/                     # 图标生成等脚本
└── .github/workflows/           # CI/CD
```

## License

MIT
