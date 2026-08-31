import { mountTacoOverlay, unmountTacoOverlay, isOverlayMounted } from './mount';

const BUTTON_ID = 'taco-nav-button';
const NAVY = '#0A1F44';
const TEXT = '#E8EEFA';

// Jira reshuffles its shell markup without warning (the 2026 home rewrite dropped
// `page-layout.sidebar` entirely), so probe a list of candidates instead of one
// selector, and fall back to a floating button when none of them match. The button
// must never silently disappear — it is the only discoverable entry point besides
// the Cmd/Ctrl+Shift+J hotkey.
const SIDEBAR_SELECTORS = [
  '[data-testid="page-layout.sidebar"]',
  '[data-testid="ak-side-navigation"]',
  '[data-testid="side-navigation"]',
  '#ak-side-navigation',
  'nav[aria-label="Sidebar" i]',
  'nav[aria-label*="side navigation" i]',
  '[data-vc*="side-nav"]',
  '[role="navigation"][data-testid*="nav" i]',
] as const;

const SIDEBAR_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'relative',
  display: 'block',
  width: 'calc(100% - 16px)',
  margin: '8px',
  bottom: 'auto',
  left: 'auto',
  zIndex: 'auto',
  boxShadow: 'none',
  // Text centred in the full width; the emoji is absolutely positioned over it.
  padding: '8px 12px',
  textAlign: 'center',
};

const FLOATING_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  display: 'block',
  width: 'auto',
  margin: '0',
  bottom: '16px',
  left: '16px',
  // Below the overlay host (2147483646) so it can't cover Taco itself.
  zIndex: '2147483000',
  boxShadow: '0 2px 8px rgba(9, 30, 66, 0.25)',
  // Shrink-wrapped, so the label needs room to clear the absolute emoji.
  padding: '8px 12px 8px 36px',
  textAlign: 'left',
};

let button: HTMLButtonElement | null = null;

function createButton(): HTMLButtonElement {
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
    background: NAVY,
    color: TEXT,
    border: 'none',
    borderRadius: '3px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    boxSizing: 'border-box',
  } satisfies Partial<CSSStyleDeclaration>);
  btn.addEventListener('click', toggleOverlay);
  return btn;
}

function findSidebar(): HTMLElement | null {
  for (const selector of SIDEBAR_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;
    // Collapsed/hidden nav shells still exist in the DOM on the new home page;
    // treating one as a mount point would hide the button.
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

function placeNavButton(): void {
  if (!document.body) return;
  if (!button) button = createButton();

  const sidebar = findSidebar();
  const target = sidebar ?? document.body;
  Object.assign(button.style, sidebar ? SIDEBAR_STYLE : FLOATING_STYLE);

  if (button.parentElement === target) return;
  if (sidebar) sidebar.prepend(button);
  else document.body.appendChild(button);
}

function toggleOverlay(): void {
  if (isOverlayMounted()) unmountTacoOverlay();
  else mountTacoOverlay();
}

// Jira re-renders its shell constantly; coalesce to one placement check per frame
// so the observer doesn't run the selector sweep on every mutation record.
let pending = false;
const observer = new MutationObserver(() => {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    placeNavButton();
  });
});
observer.observe(document.documentElement, { childList: true, subtree: true });
placeNavButton();

document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl + Shift + J toggles the overview
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    toggleOverlay();
  }
});
