import React, { useRef } from 'react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import {
  listener,
  listenerCtx,
  ListenerManager,
} from '@milkdown/kit/plugin/listener';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { nord } from '@milkdown/theme-nord';
import './MilkdownEditor.css';

interface MilkdownEditorProps {
  content: string;
  onContentChange: (markdown: string) => void;
}

const MilkdownEditorInner: React.FC<MilkdownEditorProps> = ({
  content,
  onContentChange,
}) => {
  const onChangeRef = useRef(onContentChange);
  onChangeRef.current = onContentChange;
  const initializedRef = useRef(false);

  useEditor((root) => {
    initializedRef.current = false;

    const lm = new ListenerManager();
    lm.markdownUpdated((_ctx, markdown) => {
      // Skip the initial sync to avoid marking file as modified
      if (!initializedRef.current) {
        initializedRef.current = true;
        return;
      }
      onChangeRef.current(markdown ?? '');
    });

    return Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
        ctx.set(listenerCtx, lm);
      })
      .use(commonmark)
      .use(gfm)
      .use(listener);
  }, []);

  return <Milkdown />;
};

const MilkdownEditor: React.FC<MilkdownEditorProps> = ({
  content,
  onContentChange,
}) => {
  return (
    <div className="milkdown-editor-wrapper">
      <MilkdownProvider>
        <MilkdownEditorInner
          content={content}
          onContentChange={onContentChange}
        />
      </MilkdownProvider>
    </div>
  );
};

export default MilkdownEditor;
