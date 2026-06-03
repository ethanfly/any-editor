# Any Editor — 万能文件编辑器

跨平台桌面文件编辑器，支持 Markdown 所见即所得、代码高亮、PDF 预览等多种文件格式。

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-orange)
![Release](https://img.shields.io/github/v/release/any-editor/any-editor?color=%23f1953f)

## 功能

- **Markdown WYSIWYG** — Typora 风格所见即所得编辑，实时渲染
- **代码编辑器** — 基于 Monaco Editor，支持语法高亮、代码折叠、多光标
- **PDF 预览** — 内置 PDF.js，直接预览 PDF 文件
- **文件类型图标** — 18+ 种文件类型 SVG 图标系统，一目了然
- **标签页管理** — 多文件标签页切换，支持拖拽排序
- **单实例运行** — 自动复用已打开的窗口，提升启动速度
- **智能侧边栏** — 文件树自动显隐，最大化编辑区域
- **同步滚动** — 编辑器与预览窗格双向同步滚动

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite |
| 编辑器 | Monaco Editor / Markdown (marked + highlight.js) |
| PDF | pdfjs-dist |
| 桌面框架 | Tauri 2 (Rust) |
| 包管理 | pnpm |

## 安装

从 [GitHub Releases](https://github.com/any-editor/any-editor/releases) 下载对应平台的安装包：

| 平台 | 安装包 | 安装方式 |
|---|---|---|
| Windows | `.msi` | 双击运行，按向导完成安装 |
| macOS | `.dmg` | 打开后拖入「应用程序」文件夹 |
| Linux | `.deb` | `sudo dpkg -i any-editor_*.deb` |

安装完成后即可直接打开任意文本、Markdown、代码文件进行编辑。

## 开发

### 环境要求

- Node.js 22+
- pnpm 9+
- Rust 1.77+
- 系统依赖（Linux）: `libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev`

### 启动开发模式

```bash
pnpm install
pnpm tauri dev
```

### 本地打包

```bash
pnpm tauri build
```

构建产物：
- **Windows**: `src-tauri/target/release/bundle/msi/*.msi`
- **macOS**: `src-tauri/target/release/bundle/dmg/*.dmg`
- **Linux**: `src-tauri/target/release/bundle/deb/*.deb`

### 生成图标

```bash
node scripts/generate-icons.mjs
```

## CI/CD

推送 `main` 分支时自动触发：

```
push main → Bump Version → 创建版本 Tag → Build & Release
                                 ├── Windows (.msi)
                                 ├── macOS (.dmg)
                                 └── Linux (.deb)
```

- **自动版本号**：每次推送自动 bump patch 版本（`0.1.x`），可手动选择 minor/major
- **三平台并行构建**：Windows / macOS / Linux 同时编译
- **自动发布**：构建完成后自动创建 GitHub Release 并上传安装包
- **手动触发**：在 Actions 页面可手动运行 `Bump Version` 或 `Build & Release`
- **跳过 CI**：commit message 包含 `[skip ci]` 可跳过自动版本更新

### Workflows

| 文件 | 触发条件 | 功能 |
|---|---|---|
| `bump-version.yml` | push main / manual | 自动 bump 版本号并创建 tag |
| `build.yml` | tag push / workflow_dispatch | 三平台编译 + 发布 Release |

## 项目结构

```
any-editor/
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   │   ├── EditorPane.tsx  # Monaco 编辑器
│   │   ├── MarkdownPreview.tsx
│   │   ├── PDFPreview.tsx
│   │   ├── FileTree.tsx    # 文件树
│   │   ├── TabBar.tsx      # 标签栏
│   │   └── ...
│   ├── hooks/              # 自定义 Hooks
│   └── types/              # TypeScript 类型
├── src-tauri/              # Rust 后端 (Tauri)
│   ├── src/
│   │   ├── lib.rs
│   │   └── main.rs
│   └── icons/              # 应用图标
├── public/                 # 静态资源
│   ├── favicon.svg
│   └── icons.svg           # 文件类型图标精灵
├── scripts/                # 工具脚本
│   └── generate-icons.mjs  # 图标生成
└── .github/workflows/      # CI/CD
```

## License

MIT
