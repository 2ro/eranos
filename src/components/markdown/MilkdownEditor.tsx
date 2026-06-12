import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  rootCtx,
} from '@milkdown/core';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import {
  commonmark,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/preset-commonmark';
import { gfm, toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { clipboard } from '@milkdown/plugin-clipboard';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { upload, uploadConfig } from '@milkdown/plugin-upload';
import { Decoration } from '@milkdown/prose/view';
import { callCommand, replaceAll } from '@milkdown/utils';

import { cn } from '@/lib/utils';

import { LinkDialog } from './LinkDialog';
import { MilkdownToolbar } from './MilkdownToolbar';

interface MilkdownEditorInnerProps {
  value: string;
  onChange: (markdown: string) => void;
  onUploadImage?: (file: File) => Promise<string | null>;
  onImageButtonClick?: () => void;
  placeholder?: string;
  showToolbar?: boolean;
}

function MilkdownEditorInner({
  value,
  onChange,
  onUploadImage,
  onImageButtonClick,
  placeholder,
  showToolbar = true,
}: MilkdownEditorInnerProps) {
  const initialValueRef = useRef(value);
  const editorRef = useRef<Editor | null>(null);
  const lastExternalValue = useRef(value);
  const onUploadImageRef = useRef(onUploadImage);

  // Link dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedTextForLink, setSelectedTextForLink] = useState<string>('');
  const selectionRef = useRef<{ from: number; to: number } | null>(null);

  // Keep the upload handler ref current without re-initializing the editor.
  useEffect(() => {
    onUploadImageRef.current = onUploadImage;
  }, [onUploadImage]);

  const { get } = useEditor((root) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialValueRef.current);
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          lastExternalValue.current = markdown;
          onChange(markdown);
        });

        // Configure the upload plugin (only meaningful when an upload
        // handler is provided; otherwise images fall back to base64).
        ctx.set(uploadConfig.key, {
          uploader: async (files, schema) => {
            const images: File[] = [];

            for (let i = 0; i < files.length; i++) {
              const file = files.item(i);
              if (!file) continue;
              if (!file.type.includes('image')) continue;
              images.push(file);
            }

            const nodes: ReturnType<typeof schema.nodes.image.createAndFill>[] = [];

            for (const image of images) {
              try {
                if (onUploadImageRef.current) {
                  const url = await onUploadImageRef.current(image);
                  if (url) {
                    const node = schema.nodes.image.createAndFill({
                      src: url,
                      alt: image.name,
                    });
                    if (node) nodes.push(node);
                  }
                } else {
                  const reader = new FileReader();
                  const dataUrl = await new Promise<string>((resolve) => {
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(image);
                  });
                  const node = schema.nodes.image.createAndFill({
                    src: dataUrl,
                    alt: image.name,
                  });
                  if (node) nodes.push(node);
                }
              } catch (error) {
                console.error('Failed to upload image:', error);
              }
            }

            return nodes.filter(
              (node): node is NonNullable<typeof node> => node !== null,
            );
          },
          enableHtmlFileUploader: true,
          uploadWidgetFactory: (pos, spec) => {
            const widgetEl = document.createElement('span');
            widgetEl.className = 'milkdown-upload-placeholder';
            return Decoration.widget(pos, widgetEl, spec);
          },
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(listener)
      .use(upload);

    return editor;
  });

  // Store the editor reference.
  useEffect(() => {
    editorRef.current = get() ?? null;
  }, [get]);

  // Handle external value changes (e.g. resetting / loading a value).
  useEffect(() => {
    const editor = get();
    if (editor && value !== lastExternalValue.current) {
      editor.action(replaceAll(value));
      lastExternalValue.current = value;
    }
  }, [value, get]);

  // Placeholder support via a CSS custom property on the ProseMirror DOM.
  useEffect(() => {
    const editor = get();
    if (editor && placeholder) {
      try {
        const view = editor.ctx.get(editorViewCtx);
        view.dom.style.setProperty('--ph', `"${placeholder.replace(/"/g, '\\"')}"`);
      } catch {
        // Editor not ready yet.
      }
    }
  }, [get, placeholder]);

  // Toggle a `has-content` class on the ProseMirror DOM so the CSS
  // placeholder (`:not(.has-content)`) only shows while genuinely empty.
  useEffect(() => {
    const editor = get();
    if (!editor) return;
    try {
      const view = editor.ctx.get(editorViewCtx);
      view.dom.classList.toggle('has-content', value.trim().length > 0);
    } catch {
      // Editor not ready yet.
    }
  }, [get, value]);

  const handleLinkButtonClick = useCallback(() => {
    const editor = get();
    if (!editor) return;

    try {
      const view = editor.ctx.get(editorViewCtx);
      const { state } = view;
      const { from, to } = state.selection;
      const selectedText = state.doc.textBetween(from, to);

      selectionRef.current = { from, to };
      setSelectedTextForLink(selectedText);
      setLinkDialogOpen(true);
    } catch (error) {
      console.error('Failed to get selection:', error);
    }
  }, [get]);

  const handleLinkSubmit = useCallback(
    (text: string, url: string) => {
      const editor = get();
      if (!editor) return;

      try {
        const view = editor.ctx.get(editorViewCtx);
        const { state, dispatch } = view;
        const { schema } = state;

        const linkMark = schema.marks.link.create({ href: url });
        const linkNode = schema.text(text, [linkMark]);
        const tr = state.tr;

        if (selectionRef.current) {
          const { from, to } = selectionRef.current;
          tr.replaceWith(from, to, linkNode);
        } else {
          const { from } = state.selection;
          tr.insert(from, linkNode);
        }

        dispatch(tr);
        view.focus();
      } catch (error) {
        console.error('Failed to insert link:', error);
      }
    },
    [get],
  );

  const handleCommand = useCallback(
    (command: string) => {
      const editor = get();
      if (!editor) return;

      try {
        const view = editor.ctx.get(editorViewCtx);

        switch (command) {
          case 'toggleBold':
            editor.action(callCommand(toggleStrongCommand.key));
            break;
          case 'toggleItalic':
            editor.action(callCommand(toggleEmphasisCommand.key));
            break;
          case 'toggleStrikethrough':
            editor.action(callCommand(toggleStrikethroughCommand.key));
            break;
          case 'toggleInlineCode':
            editor.action(callCommand(toggleInlineCodeCommand.key));
            break;
          case 'heading1':
            editor.action(callCommand(wrapInHeadingCommand.key, 1));
            break;
          case 'heading2':
            editor.action(callCommand(wrapInHeadingCommand.key, 2));
            break;
          case 'heading3':
            editor.action(callCommand(wrapInHeadingCommand.key, 3));
            break;
          case 'bulletList':
            editor.action(callCommand(wrapInBulletListCommand.key));
            break;
          case 'orderedList':
            editor.action(callCommand(wrapInOrderedListCommand.key));
            break;
          case 'blockquote':
            editor.action(callCommand(wrapInBlockquoteCommand.key));
            break;
          case 'link':
            handleLinkButtonClick();
            return; // Dialog handles refocus.
          case 'hr':
            editor.action(callCommand(insertHrCommand.key));
            break;
          case 'paragraph':
            editor.action(callCommand(turnIntoTextCommand.key));
            break;
        }

        view.focus();
      } catch (error) {
        console.error('Command failed:', error);
      }
    },
    [get, handleLinkButtonClick],
  );

  return (
    <>
      {showToolbar && (
        <MilkdownToolbar
          onCommand={handleCommand}
          onImageUpload={onImageButtonClick}
        />
      )}
      <div className="milkdown-content">
        <Milkdown />
      </div>
      <LinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        selectedText={selectedTextForLink}
        onSubmit={handleLinkSubmit}
      />
    </>
  );
}

interface MilkdownEditorProps {
  /** Current markdown value. */
  value: string;
  /** Called with the new markdown whenever the document changes. */
  onChange: (markdown: string) => void;
  /** Optional handler that uploads an image file and returns its URL. */
  onUploadImage?: (file: File) => Promise<string | null>;
  /** Optional handler for the toolbar image button (omit to hide it). */
  onImageButtonClick?: () => void;
  /** Placeholder shown while the editor is empty and unfocused. */
  placeholder?: string;
  className?: string;
  /** Show the formatting toolbar (default true). */
  showToolbar?: boolean;
}

/**
 * Reusable WYSIWYG Markdown editor built on Milkdown (ProseMirror).
 *
 * Edits render as formatted rich text while the value flows back out as
 * CommonMark + GFM markdown via `onChange`. Pair with `PolicyMarkdown` /
 * `react-markdown` for read-only rendering elsewhere.
 *
 * Styling lives under `.milkdown-editor` in `src/index.css`.
 */
export function MilkdownEditor({
  value,
  onChange,
  onUploadImage,
  onImageButtonClick,
  placeholder,
  className,
  showToolbar = true,
}: MilkdownEditorProps) {
  return (
    <div className={cn('milkdown-editor', className)}>
      <MilkdownProvider>
        <MilkdownEditorInner
          value={value}
          onChange={onChange}
          onUploadImage={onUploadImage}
          onImageButtonClick={onImageButtonClick}
          placeholder={placeholder}
          showToolbar={showToolbar}
        />
      </MilkdownProvider>
    </div>
  );
}

export default MilkdownEditor;
