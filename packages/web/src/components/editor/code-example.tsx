'use client';
import { useEffect, useRef, useState } from 'react';
import CodeBlock from '@tiptap/extension-code-block';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { Check, Copy } from 'lucide-react';
import {
  explanationCodeLanguage,
  explanationCodeLanguages,
} from '@cove/shared';
import { useEditorTranslation } from './use-editor-translation';
import styles from './code-example.module.css';

function CodeExampleView({ node, updateAttributes, editor }: NodeViewProps) {
  const { t } = useEditorTranslation();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const language = explanationCodeLanguage(node.attrs.language);
  async function copy() {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      setFailed(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setFailed(true);
    }
  }
  return (
    <NodeViewWrapper
      className={styles.window}
      data-code-example="true"
      data-language={language}
    >
      <div className={styles.header} contentEditable={false}>
        <select
          aria-label={t('code_language')}
          value={language}
          disabled={!editor.isEditable}
          onChange={(event) =>
            updateAttributes({ language: event.target.value })
          }
          className={styles.language}
        >
          {explanationCodeLanguages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id === 'plaintext' ? t('plain_text') : item.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.copy}
          onClick={() => void copy()}
          aria-label={t('copy_code')}
          title={failed ? t('copy_failed') : t('copy_code')}
        >
          {copied ? (
            <Check aria-hidden size={15} />
          ) : (
            <Copy aria-hidden size={15} />
          )}
          <span aria-live="polite">
            {t(copied ? 'copied' : failed ? 'copy_failed' : 'copy_code')}
          </span>
        </button>
      </div>
      <div className={styles.body}>
        <div
          className={styles.numbers}
          contentEditable={false}
          aria-hidden="true"
        >
          {node.textContent
            .split('\n')
            .map((_, index) => index + 1)
            .join('\n')}
        </div>
        <NodeViewContent<'pre'>
          as="pre"
          className={styles.source}
          spellCheck={false}
          style={{ whiteSpace: 'pre' }}
        />
      </div>
    </NodeViewWrapper>
  );
}

/** Store ordinary pre/code HTML, never the interactive node-view furniture. */
export const CodeExample = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: 'python',
        parseHTML: (element) =>
          explanationCodeLanguage(
            element.getAttribute('data-language') ??
              element
                .querySelector('code')
                ?.className.replace(/^language-/, ''),
          ),
        renderHTML: (attributes) => ({
          'data-language': explanationCodeLanguage(attributes.language),
        }),
      },
    };
  },
  renderHTML({ node }) {
    const language = explanationCodeLanguage(node.attrs.language);
    return [
      'pre',
      { 'data-language': language },
      ['code', { class: `language-${language}` }, 0],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeExampleView, {
      contentDOMElementTag: 'code',
    });
  },
});
