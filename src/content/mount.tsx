import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { App } from '../ui/App';
import { persister, queryClient } from '../ui/cache';
import overlayCss from '../ui/overlay.css?inline';

const HOST_ID = 'taco-overlay-host';

let root: Root | null = null;
let host: HTMLElement | null = null;

export function mountTacoOverlay(): void {
  if (host) return;

  host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
  } satisfies Partial<CSSStyleDeclaration>);

  // Stop key events from bubbling out of Taco's host into Jira's document/window-level
  // shortcut listeners (so typing "c" in our inputs doesn't fire Jira's create-issue
  // shortcut, etc.). React's own delegated handlers fire inside the shadow root before
  // this point, so onKeyDown handlers in our components are unaffected.
  const stopPropagation = (e: Event) => e.stopPropagation();
  host.addEventListener('keydown', stopPropagation);
  host.addEventListener('keyup', stopPropagation);
  host.addEventListener('keypress', stopPropagation);

  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = overlayCss;
  shadow.appendChild(styleEl);

  const reactRoot = document.createElement('div');
  reactRoot.id = 'taco-react-root';
  shadow.appendChild(reactRoot);

  document.body.appendChild(host);

  root = createRoot(reactRoot);
  root.render(
    <StrictMode>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: 24 * 60 * 60_000, buster: 'productDomains-v2' }}
      >
        <App onClose={unmountTacoOverlay} />
      </PersistQueryClientProvider>
    </StrictMode>,
  );
}

export function unmountTacoOverlay(): void {
  if (root) {
    root.unmount();
    root = null;
  }
  if (host && host.parentElement) {
    host.parentElement.removeChild(host);
  }
  host = null;
}

export function isOverlayMounted(): boolean {
  return host !== null;
}
