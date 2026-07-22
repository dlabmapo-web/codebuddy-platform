'use client';

import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageBase from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table';
import { TableHeader } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { mergeAttributes } from '@tiptap/react';
import { useEffect, useRef, useCallback, useState } from 'react';
import {
  Bold, Italic, UnderlineIcon, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Table as TableIcon, ImageIcon, Link as LinkIcon,
  Minus, Highlighter, Type, Undo, Redo, Paperclip,
  ArrowDownToLine, ArrowUpToLine, ArrowLeftToLine, ArrowRightToLine,
  Trash2, TableCellsMerge, TableCellsSplit,
} from 'lucide-react';

// ─── Resizable Image NodeView ─────────────────────────────────────────────────

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, width } = node.attrs as { src: string; alt?: string; width?: number };
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startW = useRef(0);
  const [hovering, setHovering] = useState(false);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startW.current = containerRef.current?.offsetWidth ?? (width ?? 400);

    const onMove = (me: MouseEvent) => {
      const newW = Math.max(60, startW.current + (me.clientX - startX.current));
      updateAttributes({ width: newW });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [updateAttributes, width]);

  return (
    <NodeViewWrapper
      as="span"
      style={{ display: 'inline-block', position: 'relative', maxWidth: '100%', lineHeight: 0 }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <span ref={containerRef as React.RefObject<HTMLSpanElement>} style={{ display: 'inline-block', position: 'relative' }}>
        <img
          src={src}
          alt={alt ?? ''}
          style={{
            width: width ? `${width}px` : 'auto',
            maxWidth: '100%',
            borderRadius: 6,
            display: 'block',
            outline: selected ? '2px solid #1B64DA' : (hovering ? '2px solid #93C5FD' : 'none'),
            outlineOffset: 2,
          }}
          draggable={false}
        />
        {(hovering || selected) && (
          <>
            {/* right drag handle */}
            <span
              onMouseDown={onHandleMouseDown}
              style={{
                position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)',
                width: 12, height: 36, borderRadius: 6,
                background: '#1B64DA', cursor: 'ew-resize',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              }}
              title="드래그로 너비 조절"
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{ width: 2, height: 2, borderRadius: '50%', background: 'white' }} />
                ))}
              </span>
            </span>
            {/* width badge */}
            {width && (
              <span style={{
                position: 'absolute', bottom: 6, right: 14,
                background: 'rgba(0,0,0,0.55)', color: '#fff',
                fontSize: 10, padding: '1px 5px', borderRadius: 4,
              }}>
                {width}px
              </span>
            )}
          </>
        )}
      </span>
    </NodeViewWrapper>
  );
}

const ResizableImage = ImageBase.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => {
          const w = el.getAttribute('width') ?? el.style.width?.replace('px', '');
          return w ? parseInt(w, 10) : null;
        },
        renderHTML: attrs => attrs.width ? { width: attrs.width, style: `width:${attrs.width}px` } : {},
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

// ─── Toolbar helpers ──────────────────────────────────────────────────────────

function ToolBtn({
  onClick, active, title, children, danger, disabled,
}: {
  onClick: () => void; active?: boolean; title: string;
  children: React.ReactNode; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick(); }}
      title={title}
      disabled={disabled}
      className="flex items-center justify-center rounded transition-colors shrink-0"
      style={{
        width: 28, height: 28,
        backgroundColor: danger ? '#FEF2F2' : active ? '#EFF6FF' : 'transparent',
        color: danger ? '#DC2626' : active ? '#1B64DA' : '#5A6270',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="shrink-0" style={{ width: 1, height: 20, backgroundColor: '#D1D5DB', margin: '0 3px' }} />;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

const FONT_SIZES = ['12', '14', '16', '18', '20', '24', '28', '32'];
const COLORS = ['#16181D', '#DC2626', '#D97706', '#16A34A', '#1B64DA', '#7C3AED', '#DB2777', '#6B7280'];

// ─── Main Component ───────────────────────────────────────────────────────────

export function RichEditor({ value, onChange, placeholder = '문제 내용을 입력하세요...' }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [inTable, setInTable] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ResizableImage,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer', style: 'color:#1B64DA;text-decoration:underline;' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
      setInTable(editor.isActive('table'));
    },
    onSelectionUpdate({ editor }) {
      setInTable(editor.isActive('table'));
    },
    editorProps: {
      attributes: {
        style: 'min-height: 280px; padding: 16px; outline: none; font-size: 15px; line-height: 1.8; color: #16181D;',
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  const uploadFile = useCallback(async (file: File, asImage: boolean) => {
    if (!editor) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    const json = await res.json();
    if (!json.url) return;
    if (asImage) {
      editor.chain().focus().setImage({ src: json.url, alt: file.name }).run();
    } else {
      editor.chain().focus().insertContent(
        `<a href="${json.url}" target="_blank" rel="noopener noreferrer">${json.name}</a>`
      ).run();
    }
  }, [editor]);

  const handleImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file, true);
    e.target.value = '';
  }, [uploadFile]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file, false);
    e.target.value = '';
  }, [uploadFile]);

  const setLink = useCallback(() => {
    const url = window.prompt('링크 URL을 입력하세요');
    if (!url) return;
    editor?.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  const setFontSize = useCallback((size: string) => {
    editor?.chain().focus().setMark('textStyle', { fontSize: `${size}px` }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>

      {/* ── Main Toolbar ─────────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-0.5 px-3 py-2 bg-white"
        style={{ borderBottom: '1px solid #E5E8EC' }}
      >
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="실행취소 (Ctrl+Z)"><Undo size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="다시실행 (Ctrl+Y)"><Redo size={14} /></ToolBtn>
        <Divider />

        <select
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setFontSize(e.target.value)}
          defaultValue=""
          title="글자 크기"
          className="rounded px-1 text-xs shrink-0"
          style={{ height: 28, border: '1px solid #E5E8EC', color: '#5A6270', fontSize: 12 }}
        >
          <option value="" disabled>크기</option>
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
        </select>
        <Divider />

        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="굵게"><Bold size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="기울임"><Italic size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="밑줄"><UnderlineIcon size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="취소선"><Strikethrough size={14} /></ToolBtn>
        <Divider />

        <div className="flex items-center gap-0.5 shrink-0" title="글자색">
          <Type size={12} style={{ color: '#9CA3AF' }} />
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(c).run(); }}
              className="rounded-full shrink-0"
              style={{ width: 15, height: 15, backgroundColor: c, boxShadow: '0 0 0 1.5px #E5E8EC' }}
              title={c}
            />
          ))}
        </div>
        <Divider />

        <ToolBtn onClick={() => editor.chain().focus().toggleHighlight({ color: '#FEF08A' }).run()} active={editor.isActive('highlight')} title="형광펜"><Highlighter size={14} /></ToolBtn>
        <Divider />

        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="왼쪽 정렬"><AlignLeft size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="가운데 정렬"><AlignCenter size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="오른쪽 정렬"><AlignRight size={14} /></ToolBtn>
        <Divider />

        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="순서 없는 목록"><List size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="번호 목록"><ListOrdered size={14} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="구분선"><Minus size={14} /></ToolBtn>
        <Divider />

        <ToolBtn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="표 삽입 (3×3) — 표 안에서 행/열 추가·삭제 가능"
        >
          <TableIcon size={14} />
        </ToolBtn>
        <ToolBtn onClick={setLink} active={editor.isActive('link')} title="링크 삽입"><LinkIcon size={14} /></ToolBtn>
        <ToolBtn onClick={() => imageInputRef.current?.click()} title="이미지 첨부 (오른쪽 핸들 드래그로 크기 조절)"><ImageIcon size={14} /></ToolBtn>
        <ToolBtn onClick={() => fileInputRef.current?.click()} title="파일 첨부"><Paperclip size={14} /></ToolBtn>
      </div>

      {/* ── Table Context Toolbar ─────────────────────────────────────────── */}
      {inTable && (
        <div
          className="flex items-center gap-0.5 px-3 py-1.5 overflow-x-auto"
          style={{ borderBottom: '1px solid #BFDBFE', background: '#EFF6FF' }}
        >
          {/* label */}
          <span className="shrink-0 flex items-center gap-1 mr-1" style={{ fontSize: 11, color: '#1B64DA', fontWeight: 700 }}>
            <TableIcon size={12} />
            표 편집
          </span>

          {/* row section */}
          <span className="shrink-0" style={{ fontSize: 10, color: '#93C5FD', marginRight: 1 }}>행</span>
          <ToolBtn onClick={() => editor.chain().focus().addRowBefore().run()} title="위에 행 추가">
            <ArrowUpToLine size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="아래에 행 추가">
            <ArrowDownToLine size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().deleteRow().run()} title="현재 행 삭제" danger>
            <Trash2 size={12} />
          </ToolBtn>

          <Divider />

          {/* col section */}
          <span className="shrink-0" style={{ fontSize: 10, color: '#93C5FD', marginRight: 1 }}>열</span>
          <ToolBtn onClick={() => editor.chain().focus().addColumnBefore().run()} title="왼쪽에 열 추가">
            <ArrowLeftToLine size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title="오른쪽에 열 추가">
            <ArrowRightToLine size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().deleteColumn().run()} title="현재 열 삭제" danger>
            <Trash2 size={12} />
          </ToolBtn>

          <Divider />

          {/* cell section */}
          <span className="shrink-0" style={{ fontSize: 10, color: '#93C5FD', marginRight: 1 }}>셀</span>
          <ToolBtn onClick={() => editor.chain().focus().mergeCells().run()} title="셀 병합">
            <TableCellsMerge size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().splitCell().run()} title="셀 분리">
            <TableCellsSplit size={13} />
          </ToolBtn>

          <Divider />

          {/* delete table */}
          <ToolBtn onClick={() => editor.chain().focus().deleteTable().run()} title="표 전체 삭제" danger>
            <Trash2 size={13} />
          </ToolBtn>
          <span className="shrink-0" style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>표 삭제</span>
        </div>
      )}

      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      <div className="bg-white">
        <EditorContent editor={editor} />
      </div>

      <style>{`
        /* ── editor typography ─────────────────────────── */
        .tiptap p { margin: 0.4em 0; }
        .tiptap h1 { font-size: 1.6em; font-weight: 700; margin: 0.8em 0 0.4em; }
        .tiptap h2 { font-size: 1.3em; font-weight: 700; margin: 0.7em 0 0.3em; }
        .tiptap h3 { font-size: 1.1em; font-weight: 600; margin: 0.6em 0 0.3em; }
        .tiptap ul { padding-left: 1.4em; list-style-type: disc; }
        .tiptap ol { padding-left: 1.4em; list-style-type: decimal; }
        .tiptap li { margin: 0.2em 0; }
        .tiptap blockquote { border-left: 3px solid #E5E8EC; padding-left: 12px; color: #5A6270; margin: 0.6em 0; }
        .tiptap code { background: #F3F4F6; padding: 1px 5px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
        .tiptap pre { background: #1E1E1E; color: #D4D4D4; padding: 12px 16px; border-radius: 8px; overflow-x: auto; }
        .tiptap pre code { background: none; color: inherit; }
        .tiptap hr { border: none; border-top: 1px solid #E5E8EC; margin: 1em 0; }
        .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #BCC0C7; pointer-events: none; float: left; height: 0; }

        /* ── table ─────────────────────────────────────── */
        .tiptap table { border-collapse: collapse; width: 100%; margin: 0.8em 0; table-layout: fixed; }
        .tiptap th { background: #F0F7FF; font-weight: 600; padding: 8px 12px; border: 1px solid #BFDBFE; text-align: left; }
        .tiptap td { padding: 8px 12px; border: 1px solid #E5E8EC; vertical-align: top; }
        .tiptap td, .tiptap th { position: relative; min-width: 40px; }
        .tiptap .selectedCell:after {
          z-index: 2; position: absolute; content: "";
          left: 0; right: 0; top: 0; bottom: 0;
          background: rgba(27,100,218,0.12); pointer-events: none;
        }

        /* ── column resize handle (prosemirror-tables) ── */
        .tiptap .column-resize-handle {
          position: absolute; right: -3px; top: 0; bottom: 0;
          width: 5px; cursor: col-resize;
          background: transparent; z-index: 10;
        }
        .tiptap .column-resize-handle:hover,
        .tiptap.resize-cursor .column-resize-handle {
          background: #1B64DA;
          opacity: 0.5;
        }
        .tiptap.resize-cursor { cursor: col-resize !important; }
      `}</style>
    </div>
  );
}
