import { mountTacoOverlay, unmountTacoOverlay, isOverlayMounted } from './mount';

const BUTTON_ID = 'taco-nav-button';
const NAVY = '#0A1F44';
const TEXT = '#E8EEFA';

function injectNavButton(): void {
  if (document.getElementById(BUTTON_ID)) return;
  const sidebar = document.querySelector<HTMLElement>('[data-testid="page-layout.sidebar"]');
  if (!sidebar) return;

  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.type = 'button';
  btn.title = 'Open Taco overview (Cmd/Ctrl+Shift+J)';
  btn.innerHTML = `<span class="taco-nav-icon">🌮</span><span>Taco</span>`;
  const icon = btn.querySelector<HTMLElement>('.taco-nav-icon');
  if (icon) {
    // Absolute-positioned so the text can sit centered in the button without
    // the emoji shifting it off-center.
    Object.assign(icon.style, {
      display: 'block',
      fontSize: '18px',
      lineHeight: '1',
      position: 'absolute',
      left: '12px',
      top: '50%',
      transform: 'translateY(-50%)',
    });
  }
  Object.assign(btn.style, {
    appearance: 'none',
    position: 'relative',
    display: 'block',
    width: 'calc(100% - 16px)',
    margin: '8px',
    background: NAVY,
    color: TEXT,
    border: 'none',
    borderRadius: '3px',
    padding: '8px 12px',
    fontSize: '14px',
    fontWeight: '500',
    textAlign: 'center',
    cursor: 'pointer',
    boxSizing: 'border-box',
  } satisfies Partial<CSSStyleDeclaration>);
  btn.addEventListener('click', toggleOverlay);
  sidebar.prepend(btn);
}

function toggleOverlay(): void {
  if (isOverlayMounted()) unmountTacoOverlay();
  else mountTacoOverlay();
}

const observer = new MutationObserver(() => injectNavButton());
observer.observe(document.documentElement, { childList: true, subtree: true });
injectNavButton();

document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl + Shift + J toggles the overview
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    toggleOverlay();
  }
});
