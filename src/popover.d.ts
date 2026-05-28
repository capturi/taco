// React 18's HTMLAttributes don't yet declare the `popover` attribute (added in
// React 19's types). Augment locally so we can use the native popover API on JSX
// elements without `as any` casts.
import 'react';

declare module 'react' {
  interface HTMLAttributes<T> {
    popover?: 'auto' | 'manual' | '' | undefined;
  }
}
