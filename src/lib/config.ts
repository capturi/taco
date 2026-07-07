import { useCallback, useSyncExternalStore } from 'react';
import type { Issue, IssueType, ProductDomain, User } from '../api/types';

// User-controlled settings persisted in localStorage under `taco.config`.
// All fields are optional on disk so new fields can be added without
// invalidating older stored configs — defaults are merged in on read.
//
// Array order is meaningful for favoriteStatuses — it controls how status
// groups are ordered in the overview table (all statuses), and how the shown
// subset is ordered in the create dialog, table popover, and detail sidebar.
export type StatusPref = {
  name: string;
  category: Issue['status']['category'];
  // Whether this status appears in the create dialog and status-change
  // dropdowns. The table sort uses every entry regardless of this flag.
  // Legacy configs lack the field; treat missing as shown (see `s.shown !== false`).
  shown: boolean;
};

export type Config = {
  // Jira project keys the user works in. The overview query pulls issues from
  // all of them. The first key is "the" project for things that are
  // inherently single-project: the default for new tickets, and settings
  // lookups (statuses, boards, components). Empty array means "not configured
  // yet".
  projectKeys: string[];
  favoriteUsers: User[];
  favoriteProductDomains: ProductDomain[];
  // Optional emoji icon per domain, keyed by domain id. Shown next to the
  // domain name in the create dialog and the detail editor dropdown.
  productDomainIcons: Record<string, string>;
  favoriteStatuses: StatusPref[];
  // Issue types shown in the create dialog and in what order. Empty = show all
  // non-subtask types reported by the project.
  favoriteIssueTypes: IssueType[];
  // Name of the status that's pre-selected when opening the create dialog.
  // Stored as a name (case-insensitive match) so it survives reordering and
  // doesn't have to be one of the favorites — but in practice it always is,
  // since the settings UI only lets you star a favorite.
  defaultCreateStatus: string | null;
  // Board id whose sprints power the "Current sprint" filter and the sprint
  // picker in the create / table editors. Null = pick the project's first
  // scrum board (the legacy auto-detect behaviour).
  sprintBoardId: number | null;
  // Saved filter presets shown as toggle buttons in the toolbar. Each one
  // bundles a selection of people, domains and components; activating it
  // narrows the overview to issues matching all of its non-empty dimensions.
  customFilters: CustomFilter[];
  // Width (px) of the issue detail sidebar; persisted so the user's preferred
  // size survives reopening the panel and reloads.
  detailWidth: number;
};

// A named filter preset. Within a dimension the selected values are OR'd
// (any of these people); across dimensions they're AND'd (one of these people
// AND one of these domains). Empty dimensions impose no constraint.
export type CustomFilter = {
  id: string;
  name: string;
  assigneeAccountIds: string[];
  productDomainIds: string[];
  componentIds: string[];
};

const STORAGE_KEY = 'taco.config';
const DEFAULT_CONFIG: Config = {
  projectKeys: [],
  favoriteUsers: [],
  favoriteProductDomains: [],
  productDomainIcons: {},
  favoriteStatuses: [],
  favoriteIssueTypes: [],
  defaultCreateStatus: null,
  sprintBoardId: null,
  customFilters: [],
  detailWidth: 480,
};

let cache: Partial<Config> = readFromStorage();
const subscribers = new Set<() => void>();

function readFromStorage(): Partial<Config> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw != null) return JSON.parse(raw) as Partial<Config>;
  } catch {
    // ignore — fall through to empty
  }
  return {};
}

function writeToStorage(value: Partial<Config>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // quota / serialisation errors — best effort, drop silently
  }
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function getSnapshot(): Partial<Config> {
  return cache;
}

function setConfig(patch: Partial<Config>): void {
  cache = { ...cache, ...patch };
  writeToStorage(cache);
  for (const s of subscribers) s();
}

function replaceConfig(next: Partial<Config>): void {
  cache = next;
  writeToStorage(cache);
  for (const s of subscribers) s();
}

export function useConfig(): {
  config: Config;
  update: (patch: Partial<Config>) => void;
  replace: (next: Partial<Config>) => void;
} {
  const stored = useSyncExternalStore(subscribe, getSnapshot);
  const update = useCallback((patch: Partial<Config>) => setConfig(patch), []);
  const replace = useCallback((next: Partial<Config>) => replaceConfig(next), []);
  return { config: { ...DEFAULT_CONFIG, ...stored, projectKeys: migrateProjectKeys(stored) }, update, replace };
}

// Older configs stored a single `projectKey: string` — fold it into the new
// array field so existing users don't lose their configured project.
function migrateProjectKeys(stored: Partial<Config> & { projectKey?: string }): string[] {
  if (stored.projectKeys) return stored.projectKeys;
  if (stored.projectKey) return [stored.projectKey];
  return DEFAULT_CONFIG.projectKeys;
}
