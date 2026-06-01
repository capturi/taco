import { useCallback, useSyncExternalStore } from 'react';
import type { Issue, IssueType, ProductDomain, User } from '../api/types';

// User-controlled settings persisted in localStorage under `taco.config`.
// All fields are optional on disk so new fields can be added without
// invalidating older stored configs — defaults are merged in on read.
//
// Array order is meaningful for favoriteStatuses — it controls how
// statuses are ordered in the create dialog, table popover, and detail
// sidebar.
export type Config = {
  // Jira project key the user works in. Used as the default project for new
  // tickets, settings lookups (statuses, boards, components), and to seed the
  // initial JQL on first run. Empty string means "not configured yet".
  projectKey: string;
  favoriteUsers: User[];
  favoriteProductDomains: ProductDomain[];
  favoriteStatuses: Issue['status'][];
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
  projectKey: '',
  favoriteUsers: [],
  favoriteProductDomains: [],
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
  return { config: { ...DEFAULT_CONFIG, ...stored }, update, replace };
}
