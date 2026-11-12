// Sunglasses at Night: the "Removed … / Undo" toast shared by the popup and
// the options page (#toast in both, styled in ui.css). One at a time. The
// removal is already saved when it shows; Undo (or Cmd/Ctrl+Z) puts it back.

export const UNDO_MS = 6000;

export function createUndoToast(doc, ms = UNDO_MS) {
  const box = doc.getElementById('toast');
  let undo = null;
  let timer;
  const hide = () => {
    clearTimeout(timer);
    undo = null;
    box.classList.remove('show');
  };
  const arm = () => {
    // Never take it away from under a pointer or the keyboard focus.
    timer = setTimeout(() => (box.matches(':hover, :focus-within') ? arm() : hide()), ms);
  };
  const run = () => {
    const fn = undo;
    hide();
    fn?.();
  };
  doc.getElementById('toast-undo').addEventListener('click', run);
  doc.addEventListener('keydown', (e) => {
    if (!undo || e.key !== 'z' || e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
    if (e.target.matches?.('textarea, input[type="time"]')) return; // their own undo
    e.preventDefault();
    run();
  });
  // iOS Safari only shows :active (the pressed states in ui.css) on pages with a touch listener.
  doc.addEventListener('touchstart', () => {}, { passive: true });
  return {
    show(text, fn) {
      hide();
      doc.getElementById('toast-text').textContent = text;
      undo = fn;
      box.classList.add('show');
      arm();
    },
    hide,
  };
}
