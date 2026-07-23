export const CURSOR_COLORS: Record<string, string> = {
  teacher: '#7C3AED',
  student: '#1B64DA',
};

export function injectCursorStyles() {
  const existing = document.getElementById('cove-cursor-styles');
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.id = 'cove-cursor-styles';
  style.textContent = `
    .remote-cursor-widget {
      position: relative;
      pointer-events: none;
      width: 0;
      height: 0;
    }
    .remote-cursor-caret {
      position: absolute;
      top: 0;
      left: 0;
      width: 2px;
      height: 18px;
      pointer-events: none;
    }
    .remote-cursor-label {
      position: absolute;
      left: 0;
      top: -15px;
      padding: 1px 5px;
      border-radius: 3px 3px 3px 0;
      font-size: 10px;
      font-weight: 700;
      color: white;
      white-space: nowrap;
      pointer-events: none;
      line-height: 14px;
    }
  `;
  document.head.appendChild(style);
}
