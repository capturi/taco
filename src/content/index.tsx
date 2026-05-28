import logoSvg from '../../assets/logo-icon.svg?raw';
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
  btn.innerHTML = `${logoSvg}<span>Taco</span>`;
  const svg = btn.querySelector('svg');
  if (svg) {
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    Object.assign(svg.style, { display: 'block', height: '24px', width: 'auto' });
  }
  Object.assign(btn.style, {
    appearance: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '8px',
    width: 'calc(100% - 16px)',
    margin: '8px',
    background: NAVY,
    color: TEXT,
    border: 'none',
    borderRadius: '3px',
    padding: '8px 12px',
    fontSize: '14px',
    fontWeight: '500',
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
