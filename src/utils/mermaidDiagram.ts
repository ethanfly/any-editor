/**
 * Mermaid / flowchart fence recognition and lazy SVG rendering.
 * Dynamic import is intentional: mermaid is large and only needed when diagrams exist.
 */

import type mermaidApi from 'mermaid';

type Mermaid = typeof mermaidApi;

const MERMAID_LANGS: Record<string, true> = {
  mermaid: true,
  flowchart: true,
  graph: true,
  sequence: true,
  sequencediagram: true,
  class: true,
  classdiagram: true,
  state: true,
  statediagram: true,
  'statediagram-v2': true,
  er: true,
  erdiagram: true,
  journey: true,
  gantt: true,
  pie: true,
  mindmap: true,
  timeline: true,
  gitgraph: true,
  c4context: true,
  c4container: true,
  c4component: true,
  c4dynamic: true,
  c4deployment: true,
  quadrantchart: true,
  requirementdiagram: true,
  'sankey-beta': true,
  'xychart-beta': true,
  'block-beta': true,
  'packet-beta': true,
  kanban: true,
  'architecture-beta': true,
};

const DIAGRAM_START_RE =
  /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|quadrantChart|requirementDiagram|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture-beta)\b/i;

const FENCE_LANG_HEADER: Record<string, string> = {
  flowchart: 'flowchart TD',
  graph: 'graph TD',
  sequence: 'sequenceDiagram',
  sequencediagram: 'sequenceDiagram',
  class: 'classDiagram',
  classdiagram: 'classDiagram',
  state: 'stateDiagram-v2',
  statediagram: 'stateDiagram-v2',
  'statediagram-v2': 'stateDiagram-v2',
  er: 'erDiagram',
  erdiagram: 'erDiagram',
  journey: 'journey',
  gantt: 'gantt',
  pie: 'pie',
  mindmap: 'mindmap',
  timeline: 'timeline',
  gitgraph: 'gitGraph',
  c4context: 'C4Context',
  c4container: 'C4Container',
  c4component: 'C4Component',
  c4dynamic: 'C4Dynamic',
  c4deployment: 'C4Deployment',
  quadrantchart: 'quadrantChart',
  requirementdiagram: 'requirementDiagram',
  'sankey-beta': 'sankey-beta',
  'xychart-beta': 'xychart-beta',
  'block-beta': 'block-beta',
  'packet-beta': 'packet-beta',
  kanban: 'kanban',
  'architecture-beta': 'architecture-beta',
};

export const FLOWCHART_SNIPPET = `\`\`\`mermaid
flowchart TD
  Start([开始]) --> Decision{条件判断}
  Decision -->|是| Process[处理步骤]
  Decision -->|否| Alt[备选路径]
  Process --> End([结束])
  Alt --> End
\`\`\`
`;

export const SEQUENCE_SNIPPET = `\`\`\`mermaid
sequenceDiagram
  participant U as 用户
  participant A as 应用
  U->>A: 请求
  A-->>U: 响应
\`\`\`
`;

let mermaidReady: Promise<Mermaid> | null = null;
let lastTheme: string | null = null;

function normalizeLang(lang: string | undefined | null): string {
  return (lang || '').trim().toLowerCase().replace(/^language-/, '');
}

/** True when fence language is a known mermaid diagram alias. */
export function isMermaidLanguage(lang: string | undefined | null): boolean {
  const l = normalizeLang(lang);
  return !!l && (!!MERMAID_LANGS[l] || l.startsWith('mermaid'));
}

/** True when source body itself starts with a mermaid diagram keyword. */
export function looksLikeMermaidSource(text: string): boolean {
  const first = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('%%'));
  return !!first && DIAGRAM_START_RE.test(first);
}

/** Detect mermaid fences in raw markdown. */
export function hasMermaidDiagram(src: string): boolean {
  if (
    /```\s*(mermaid|flowchart|graph|sequence|class|state|er|journey|gantt|pie|mindmap|timeline|gitgraph)\b/i.test(
      src
    )
  ) {
    return true;
  }
  return /```[^\n]*\n\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram)\b/i.test(src);
}

/**
 * Normalize fence language + body into a mermaid-renderable source string.
 * ```flowchart A-->B becomes "flowchart TD\nA-->B" when body lacks a header.
 */
export function normalizeMermaidSource(lang: string | undefined | null, text: string): string {
  const source = text.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim();
  if (!source) return source;

  const l = normalizeLang(lang);
  if (l === 'mermaid' || l.startsWith('mermaid')) return source;

  const firstLine =
    source
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('%%')) || '';
  if (DIAGRAM_START_RE.test(firstLine)) return source;

  const header = FENCE_LANG_HEADER[l];
  if (header) return `${header}\n${source}`;
  return source;
}

/** Prefer mermaid fence for round-trip; keep flowchart/graph alias if used. */
export function mermaidFenceLanguage(lang: string | undefined | null): string {
  const l = normalizeLang(lang);
  if (!l || l === 'mermaid' || l.startsWith('mermaid')) return 'mermaid';
  if (l === 'flowchart' || l === 'graph') return l;
  return 'mermaid';
}

export function shouldRenderAsMermaid(lang: string | undefined | null, text: string): boolean {
  if (isMermaidLanguage(lang)) return true;
  const l = normalizeLang(lang);
  if (!l || l === 'text' || l === 'plain' || l === 'plaintext') {
    return looksLikeMermaidSource(text);
  }
  return false;
}

function resolveMermaidTheme(): 'dark' | 'neutral' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'neutral';
}

async function getMermaid(): Promise<Mermaid> {
  const theme = resolveMermaidTheme();
  if (!mermaidReady || lastTheme !== theme) {
    lastTheme = theme;
    // Lazy-load: mermaid is heavy; only pull when a diagram is present.
    mermaidReady = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme,
        fontFamily: 'inherit',
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          padding: 12,
        },
        themeVariables:
          theme === 'dark'
            ? {
                primaryColor: '#2a313a',
                primaryTextColor: '#e8ecf1',
                primaryBorderColor: '#4a5563',
                lineColor: '#8b95a5',
                secondaryColor: '#242a32',
                tertiaryColor: '#1f242b',
                background: '#1f242b',
                mainBkg: '#2a313a',
                nodeBorder: '#4a5563',
                clusterBkg: '#242a32',
                titleColor: '#e8ecf1',
                edgeLabelBackground: '#242a32',
              }
            : undefined,
      });
      return mermaid;
    });
  }
  return mermaidReady;
}

function uniqueRenderId(prefix = 'mmd'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface MermaidRenderTarget {
  el: HTMLElement;
  source: string;
  id?: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build a preview placeholder div for a mermaid fence. */
export function mermaidPlaceholderHtml(lang: string | undefined | null, text: string): string {
  const id = uniqueRenderId('mmd');
  const source = normalizeMermaidSource(lang, text);
  const fenceLang = mermaidFenceLanguage(lang);
  return `<div class="mermaid-src mermaid-pending" data-mermaid-id="${id}" data-mermaid-lang="${escapeHtml(fenceLang)}" data-mermaid-source="${encodeURIComponent(source)}">${escapeHtml(source)}</div>\n`;
}

/**
 * Render mermaid diagrams into target elements.
 * Skips nodes already marked data-rendered="1" unless force=true.
 */
export async function renderMermaidTargets(
  targets: MermaidRenderTarget[],
  options: { force?: boolean; signal?: { cancelled: boolean } } = {}
): Promise<void> {
  const pending = targets.filter((t) => options.force || t.el.dataset.rendered !== '1');
  if (!pending.length) return;

  const mermaid = await getMermaid();
  if (options.signal?.cancelled) return;

  for (const target of pending) {
    if (options.signal?.cancelled) return;
    const source = target.source.trim();
    if (!source) {
      target.el.innerHTML = '<pre class="mermaid-error">流程图内容为空</pre>';
      target.el.dataset.rendered = '1';
      target.el.classList.add('mermaid-rendered');
      continue;
    }

    const id = uniqueRenderId(target.id || 'mmd');
    try {
      const { svg } = await mermaid.render(id, source);
      if (options.signal?.cancelled) return;
      target.el.innerHTML = svg;
      target.el.dataset.rendered = '1';
      target.el.classList.add('mermaid-rendered');
      target.el.classList.remove('mermaid-pending');
    } catch (err) {
      if (options.signal?.cancelled) return;
      const msg = err instanceof Error ? err.message : String(err);
      target.el.innerHTML = `<pre class="mermaid-error">流程图渲染失败:\n${escapeHtml(msg)}</pre>`;
      target.el.dataset.rendered = '1';
      target.el.classList.add('mermaid-rendered');
      target.el.classList.remove('mermaid-pending');
    }
  }
}

/** Collect mermaid nodes under root and render them. */
export async function renderMermaidInRoot(
  root: HTMLElement,
  options: { force?: boolean; signal?: { cancelled: boolean } } = {}
): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-src, .md-mermaid-canvas'));
  if (!nodes.length) return;

  const targets: MermaidRenderTarget[] = nodes.map((el) => {
    const encoded = el.getAttribute('data-mermaid-source') || el.dataset.mermaidSource;
    let source = '';
    if (encoded) {
      try {
        source = decodeURIComponent(encoded);
      } catch {
        source = encoded;
      }
    }
    if (!source) source = el.textContent || '';
    return {
      el,
      source,
      id: el.dataset.mermaidId || el.getAttribute('data-mermaid-id') || undefined,
    };
  });

  await renderMermaidTargets(targets, options);
}
