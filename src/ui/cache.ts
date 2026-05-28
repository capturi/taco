import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';
import { JiraClient } from '../api/jira';

// Module-level singletons. Lifetime = content-script lifetime, so they survive Taco
// mount/unmount cycles. The QueryClient keeps fetched issues warm; reopening Taco
// renders them instantly while a background refetch lands fresh data.

let client: JiraClient | null = null;

export function getClient(): JiraClient {
  if (!client) client = new JiraClient();
  return client;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // gcTime must be >= the persister's maxAge so the persisted entries are still
      // considered current when restored from IndexedDB on next mount.
      gcTime: 24 * 60 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Async-storage persister backed by IndexedDB via idb-keyval. The query cache is
// dehydrated to JSON and stored under a single key; restored on mount before any
// queries run, so previously-fetched issues / details / transitions render
// instantly across page reloads.
export const persister = createAsyncStoragePersister({
  key: 'taco-online-query-cache',
  storage: {
    getItem: async (k: string) => (await get<string>(k)) ?? null,
    setItem: (k: string, v: string) => set(k, v),
    removeItem: (k: string) => del(k),
  },
});
