export const CURSOR_COLORS: Record<string, string> = {
  teacher: '#7C3AED',
  student: '#1B64DA',
};

export function injectCursorStyles() {
  if (document.getElementById('paircode-cursor-styles')) return;
  const style = document.createElement('style');
  style.id = 'paircode-cursor-styles';
  style.textContent = `
    .remote-cursor-teacher {
      border-left: 2px solid #7C3AED !important;
      margin-left: -1px;
    }
    .remote-cursor-student {
      border-left: 2px solid #1B64DA !important;
      margin-left: -1px;
    }
    .remote-cursor-label {
      padding: 1px 5px;
      border-radius: 3px 3px 3px 0;
      font-size: 10px;
      font-weight: 700;
      color: white;
      white-space: nowrap;
      pointer-events: none;
      line-height: 16px;
    }
  `;
  document.head.appendChild(style);
}
