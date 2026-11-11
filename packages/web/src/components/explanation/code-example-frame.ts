import {
  explanationCodeLanguage,
  explanationCodeLanguages,
} from '@cove/shared';
export type CodeExampleLabels = {
  copy: string;
  copied: string;
  copyFailed: string;
  plainText: string;
};

/** Parent-owned controls enhance a script-disabled iframe using DOM/text APIs. */
export function enhanceCodeExamples(
  document: Document,
  labels: CodeExampleLabels,
  writeText: (text: string) => Promise<void> = async (text) => {
    await navigator.clipboard.writeText(text);
  },
): () => void {
  const cleanup: Array<() => void> = [];
  for (const pre of document.querySelectorAll<HTMLPreElement>('pre')) {
    if (pre.dataset.codeExampleReady) continue;
    const code = pre.querySelector('code');
    const source = code?.textContent ?? pre.textContent ?? '';
    const language = explanationCodeLanguage(
      pre.dataset.language ?? code?.className.replace(/^language-/, ''),
    );
    const window = document.createElement('section');
    window.className = 'cove-code-example';
    const originalClass = pre.className;
    pre.replaceWith(window);
    pre.dataset.codeExampleReady = 'true';
    pre.className = 'cove-code-source';
    const header = document.createElement('div');
    header.className = 'cove-code-header';
    const label = document.createElement('span');
    label.textContent =
      language === 'plaintext'
        ? labels.plainText
        : explanationCodeLanguages.find((item) => item.id === language)!.label;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cove-code-copy';
    button.setAttribute('aria-label', labels.copy);
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('width', '15');
    icon.setAttribute('height', '15');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.7');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M9 9h11v11H9zM5 15H3V3h12v2');
    icon.append(path);
    const buttonLabel = document.createElement('span');
    buttonLabel.setAttribute('aria-live', 'polite');
    buttonLabel.textContent = labels.copy;
    button.append(icon, buttonLabel);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const copy = () => {
      void writeText(source)
        .then(() => {
          if (!button.isConnected) return;
          buttonLabel.textContent = labels.copied;
          clearTimeout(timer);
          timer = setTimeout(() => {
            buttonLabel.textContent = labels.copy;
          }, 1800);
        })
        .catch(() => {
          if (button.isConnected) {
            buttonLabel.textContent = labels.copyFailed;
            button.title = labels.copyFailed;
          }
        });
    };
    button.addEventListener('click', copy);
    cleanup.push(() => {
      button.removeEventListener('click', copy);
      clearTimeout(timer);
      window.replaceWith(pre);
      delete pre.dataset.codeExampleReady;
      pre.className = originalClass;
    });
    header.append(label, button);
    const body = document.createElement('div');
    body.className = 'cove-code-body';
    const numbers = document.createElement('div');
    numbers.className = 'cove-code-numbers';
    numbers.setAttribute('aria-hidden', 'true');
    numbers.textContent = source
      .split('\n')
      .map((_, index) => index + 1)
      .join('\n');
    body.append(numbers, pre);
    window.append(header, body);
  }
  return () => cleanup.forEach((dispose) => dispose());
}

export const codeExampleFrameStyles = `
.cove-code-example{margin:1.25em 0;border:1px solid #3b3d41;border-radius:12px;overflow:hidden;background:#1e1e1e;color:#e2e8f0;color-scheme:dark}
.cove-code-header{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:7px 16px;border-bottom:1px solid #3b3d41;background:#2a2a2a;font:12px ui-monospace,Menlo,Consolas,monospace;color:#cbd5e1}
.cove-code-copy{display:inline-flex;align-items:center;gap:7px;flex-shrink:0;border:0;border-radius:5px;padding:5px 7px;background:transparent;color:#a8b2c1;font:11px system-ui,sans-serif;cursor:pointer;max-width:65%}
.cove-code-copy:hover{background:#3b3d41;color:white}.cove-code-copy:focus-visible{outline:2px solid #5b93f5;outline-offset:2px}
.cove-code-body{display:flex;min-width:0}.cove-code-numbers{flex-shrink:0;min-width:3.5em;white-space:pre;padding:16px 12px;border-right:1px solid #ffffff0d;color:#707987;text-align:right;font:14px/1.75 ui-monospace,Menlo,Consolas,monospace;user-select:none}
.cove-code-example .cove-code-source{flex:1;min-width:0;overflow-x:auto;margin:0;border-radius:0;background:transparent;color:inherit;padding:16px;white-space:pre;tab-size:4;font:14px/1.75 ui-monospace,Menlo,Consolas,monospace}
.cove-code-source code{background:transparent;padding:0;color:inherit;font:inherit;white-space:pre}
`;
