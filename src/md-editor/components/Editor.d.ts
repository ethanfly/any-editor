import type { ComponentType } from 'react';

export type HorseMdEditorApi = {
  focus?: () => void;
  jumpToLine?: (line: number) => void;
  getMarkdown?: () => string;
  replaceMarkdown?: (md: string) => boolean;
  setBlock?: (id: string) => void;
  convertList?: (targetType: string, listPos?: number) => boolean;
  applyTextFormat?: (format: string, selection?: unknown) => boolean;
  applyReviewMarkup?: (kind: string, selection?: unknown) => boolean;
};

export type HorseMdEditorProps = {
  initialContent?: string;
  docPath?: string;
  imageUploadCommand?: string;
  spellcheck?: boolean;
  inlineMathDeleteMode?: string;
  selectionToolbar?: boolean;
  readOnly?: boolean;
  effectiveKeybindings?: unknown;
  onChange?: (markdown: string, external?: boolean) => void;
  onReady?: (api: HorseMdEditorApi | null) => void;
  onActiveBlock?: (blockId: string | null) => void;
  onStructureChange?: () => void;
  onLoadingChange?: (loading: boolean) => void;
};

declare const Editor: ComponentType<HorseMdEditorProps>;
export default Editor;
