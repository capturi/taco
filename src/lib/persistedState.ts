import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

// localStorage-backed useState. Reads on first mount, writes whenever the value
// changes. Simple synchronous persistence — fine for small bits of UI state like
// filters, sort, and group selection. The key is stored on the Jira origin's
// localStorage; a "taco." prefix avoids colliding with Atlassian's own keys.

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const fullKey = `taco.${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      // ignore — fall through to default
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(value));
    } catch {
      // quota / serialisation errors — best effort, drop silently
    }
  }, [fullKey, value]);

  return [value, setValue];
}
