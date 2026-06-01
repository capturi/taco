import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Issue, IssueType, ProductDomain, User } from '../api/types';
import { useConfig, type Config } from '../lib/config';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { getClient } from './cache';
import { UserAvatar } from './UserAvatar';

type Props = {
  projectKey: string;
  onClose: () => void;
};

export function SettingsDialog({ projectKey, onClose }: Props) {
  const { config, update } = useConfig();
  const [jsonOpen, setJsonOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="taco-modal-backdrop" onClick={onClose}>
      <div className="taco-modal-panel" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="taco-modal-header">
          <h2 className="taco-modal-title">Settings</h2>
          <button
            className="taco-button"
            aria-pressed={jsonOpen}
            onClick={() => setJsonOpen((o) => !o)}
          >
            {jsonOpen ? 'Hide JSON' : 'Show JSON'}
          </button>
          <button className="taco-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {jsonOpen && <JsonImportExport />}

        <div className="taco-modal-body">
          <ProjectKeySection
            projectKey={config.projectKey}
            onChange={(projectKey) => update({ projectKey })}
          />
          <FavoritePeopleSection
            favorites={config.favoriteUsers}
            onChange={(favoriteUsers) => update({ favoriteUsers })}
          />
          <FavoriteProductDomainsSection
            favorites={config.favoriteProductDomains}
            onChange={(favoriteProductDomains) => update({ favoriteProductDomains })}
          />
          <FavoriteIssueTypesSection
            projectKey={projectKey}
            favorites={config.favoriteIssueTypes}
            onChange={(favoriteIssueTypes) => update({ favoriteIssueTypes })}
          />
          <FavoriteStatusesSection
            projectKey={projectKey}
            favorites={config.favoriteStatuses}
            defaultCreateStatus={config.defaultCreateStatus}
            onChange={(favoriteStatuses) => update({ favoriteStatuses })}
            onDefaultChange={(defaultCreateStatus) => update({ defaultCreateStatus })}
          />
          <SprintSourceSection
            projectKey={projectKey}
            sprintBoardId={config.sprintBoardId}
            onChange={(sprintBoardId) => update({ sprintBoardId })}
          />
        </div>

        <footer className="taco-modal-footer">
          <button className="taco-button primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

function JsonImportExport() {
  const { config, replace } = useConfig();
  const initial = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const apply = () => {
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object');
      }
      replace(parsed as Partial<Config>);
      setMessage({ tone: 'success', text: 'Applied.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Invalid JSON' });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setMessage({ tone: 'success', text: 'Copied to clipboard.' });
    } catch {
      setMessage({ tone: 'error', text: 'Clipboard copy failed — select the text and copy manually.' });
    }
  };

  const reset = () => {
    setDraft(initial);
    setMessage(null);
  };

  return (
    <div className="taco-settings-json">
      <textarea
        className="taco-input taco-jql-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={10}
        spellCheck={false}
      />
      <div className="taco-settings-json-actions">
        <button type="button" className="taco-button" onClick={copy}>
          Copy
        </button>
        <button type="button" className="taco-button primary" onClick={apply}>
          Apply
        </button>
        <button type="button" className="taco-button" onClick={reset} disabled={draft === initial}>
          Reset to current
        </button>
        {message && (
          <span
            className={message.tone === 'error' ? 'taco-cell-error' : undefined}
            style={message.tone === 'success' ? { color: '#006644', padding: 0 } : { padding: 0 }}
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

function ProjectKeySection({
  projectKey,
  onChange,
}: {
  projectKey: string;
  onChange: (next: string) => void;
}) {
  return (
    <section className="taco-modal-field">
      <span className="taco-modal-label">Project key</span>
      <p className="taco-settings-help">
        The Jira project you work in. Used as the default for new tickets, settings lookups, and to
        seed your JQL on first run. Already-saved JQL is left alone.
      </p>
      <input
        className="taco-input"
        value={projectKey}
        onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
        placeholder="e.g. ABC"
        spellCheck={false}
        autoCapitalize="characters"
      />
    </section>
  );
}

type SprintSourceSectionProps = {
  projectKey: string;
  sprintBoardId: number | null;
  onChange: (next: number | null) => void;
};

function SprintSourceSection({ projectKey, sprintBoardId, onChange }: SprintSourceSectionProps) {
  const client = getClient();
  const boardsQuery = useQuery({
    queryKey: ['project-boards', projectKey],
    queryFn: () => client.getProjectBoards(projectKey),
    staleTime: 60 * 60_000,
    // Settings should reflect Jira as it is right now; refetch every time the
    // dialog opens (cached data still renders instantly while it revalidates).
    refetchOnMount: 'always',
  });

  const boards = (boardsQuery.data ?? []).toSorted((a, b) => a.name.localeCompare(b.name));
  // Stale id (configured board no longer exists) — surface it so the user can
  // notice and pick a different one.
  const configuredBoardMissing =
    sprintBoardId !== null && boards.length > 0 && !boards.some((b) => b.id === sprintBoardId);

  return (
    <section className="taco-modal-field">
      <span className="taco-modal-label">Sprint source</span>
      <p className="taco-settings-help">
        Which board's sprints drive the "Current sprint" filter and the sprint picker. Default
        picks the project's first scrum board — change this if your project has several boards.
      </p>

      {boardsQuery.isPending && <div className="taco-cell-loading">Loading boards…</div>}
      {boardsQuery.isError && (
        <div className="taco-cell-error">
          Couldn't load boards:{' '}
          {boardsQuery.error instanceof Error ? boardsQuery.error.message : 'unknown'}
        </div>
      )}

      {boardsQuery.isSuccess && (
        <select
          className="taco-select"
          value={sprintBoardId ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Default (first scrum board in {projectKey})</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.type ? ` (${b.type})` : ''}
            </option>
          ))}
        </select>
      )}

      {configuredBoardMissing && (
        <p className="taco-cell-error" style={{ padding: 0, marginTop: 4 }}>
          The previously selected board (id {sprintBoardId}) wasn't returned for project{' '}
          {projectKey}. Pick a different one above, or switch to Default.
        </p>
      )}
    </section>
  );
}

type FavoriteIssueTypesSectionProps = {
  projectKey: string;
  favorites: IssueType[];
  onChange: (next: IssueType[]) => void;
};

function FavoriteIssueTypesSection({
  projectKey,
  favorites,
  onChange,
}: FavoriteIssueTypesSectionProps) {
  const client = getClient();
  const typesQuery = useQuery({
    queryKey: ['issue-types', projectKey],
    queryFn: () => client.getIssueTypes(projectKey),
    staleTime: Infinity,
    refetchOnMount: 'always',
  });

  const favoriteNames = useMemo(
    () => new Set(favorites.map((t) => t.name.toLowerCase())),
    [favorites],
  );
  const available = (typesQuery.data ?? []).filter(
    (t) => !t.subtask && !favoriteNames.has(t.name.toLowerCase()),
  );

  const move = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= favorites.length) return;
    const next = favorites.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  const sortAlphabetically = () =>
    onChange([...favorites].sort((a, b) => a.name.localeCompare(b.name)));
  const add = (t: IssueType) => onChange([...favorites, t]);
  const remove = (idx: number) => onChange(favorites.filter((_, i) => i !== idx));

  return (
    <section className="taco-modal-field">
      <span className="taco-modal-label">Ticket types</span>
      <p className="taco-settings-help">
        Controls which issue types appear and in what order in the create dialog. Leave empty to
        show every non-subtask type in the project. The first one is the default when creating.
      </p>

      {typesQuery.isPending && <div className="taco-cell-loading">Loading types…</div>}
      {typesQuery.isError && (
        <div className="taco-cell-error">
          Couldn't load types:{' '}
          {typesQuery.error instanceof Error ? typesQuery.error.message : 'unknown'}
        </div>
      )}

      {favorites.length === 0 ? (
        <p className="taco-detail-empty">No favorites configured.</p>
      ) : (
        <>
          {favorites.length > 1 && (
            <div>
              <button type="button" className="taco-button" onClick={sortAlphabetically}>
                Sort A–Z
              </button>
            </div>
          )}
          <ol className="taco-settings-status-list">
            {favorites.map((t, idx) => (
              <li key={t.id ?? t.name}>
                <span className="taco-issue-type">
                  {t.iconUrl && <img src={t.iconUrl} alt="" width={16} height={16} />}
                  {t.name}
                </span>
                <button
                  type="button"
                  className="taco-button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Move ${t.name} up`}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="taco-button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === favorites.length - 1}
                  aria-label={`Move ${t.name} down`}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="taco-pill-clear"
                  onClick={() => remove(idx)}
                  aria-label={`Remove ${t.name}`}
                  title="Remove"
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      {available.length > 0 && (
        <div className="taco-settings-domain-grid">
          {available.map((t) => (
            <button
              key={t.id ?? t.name}
              type="button"
              className="taco-button"
              onClick={() => add(t)}
              title={`Add ${t.name} to favorites`}
            >
              + {t.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

type FavoriteStatusesSectionProps = {
  projectKey: string;
  favorites: Issue['status'][];
  defaultCreateStatus: string | null;
  onChange: (next: Issue['status'][]) => void;
  onDefaultChange: (next: string | null) => void;
};

function FavoriteStatusesSection({
  projectKey,
  favorites,
  defaultCreateStatus,
  onChange,
  onDefaultChange,
}: FavoriteStatusesSectionProps) {
  const client = getClient();
  const statusesQuery = useQuery({
    queryKey: ['project-statuses', projectKey],
    queryFn: () => client.getProjectStatuses(projectKey),
    staleTime: 60 * 60_000,
    refetchOnMount: 'always',
  });

  const favoriteNames = useMemo(
    () => new Set(favorites.map((s) => s.name.toLowerCase())),
    [favorites],
  );
  const available = (statusesQuery.data ?? []).filter(
    (s) => !favoriteNames.has(s.name.toLowerCase()),
  );

  const move = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= favorites.length) return;
    const next = favorites.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  const add = (s: Issue['status']) => onChange([...favorites, s]);
  const remove = (idx: number) => {
    const removed = favorites[idx];
    onChange(favorites.filter((_, i) => i !== idx));
    // Clear the default if the user just removed it, to avoid a stale reference.
    if (
      removed &&
      defaultCreateStatus &&
      removed.name.toLowerCase() === defaultCreateStatus.toLowerCase()
    ) {
      onDefaultChange(null);
    }
  };

  return (
    <section className="taco-modal-field">
      <span className="taco-modal-label">Favorite statuses</span>
      <p className="taco-settings-help">
        Controls which statuses appear and in what order in the create dialog, table status
        editor, and detail sidebar. Star is the default when creating.
      </p>

      {statusesQuery.isPending && <div className="taco-cell-loading">Loading statuses…</div>}
      {statusesQuery.isError && (
        <div className="taco-cell-error">
          Couldn't load statuses:{' '}
          {statusesQuery.error instanceof Error ? statusesQuery.error.message : 'unknown'}
        </div>
      )}

      {favorites.length === 0 ? (
        <p className="taco-detail-empty">No favorites configured.</p>
      ) : (
        <ol className="taco-settings-status-list">
          {favorites.map((s, idx) => {
            const isDefault =
              !!defaultCreateStatus &&
              defaultCreateStatus.toLowerCase() === s.name.toLowerCase();
            return (
              <li key={s.name}>
                <span className={`taco-status ${s.category}`}>{s.name}</span>
                <button
                  type="button"
                  className="taco-button"
                  aria-pressed={isDefault}
                  onClick={() => onDefaultChange(isDefault ? null : s.name)}
                  aria-label={
                    isDefault
                      ? `${s.name} is the default for new tickets — click to clear`
                      : `Set ${s.name} as default for new tickets`
                  }
                  title={
                    isDefault
                      ? 'Default for new tickets — click to clear'
                      : 'Make default for new tickets'
                  }
                >
                  {isDefault ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  className="taco-button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Move ${s.name} up`}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="taco-button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === favorites.length - 1}
                  aria-label={`Move ${s.name} down`}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="taco-pill-clear"
                  onClick={() => remove(idx)}
                  aria-label={`Remove ${s.name}`}
                  title="Remove"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {available.length > 0 && (
        <div className="taco-settings-domain-grid">
          {available.map((s) => (
            <button
              key={s.name}
              type="button"
              className="taco-button"
              onClick={() => add(s)}
              title={`Add ${s.name} to favorites`}
            >
              + {s.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

type FavoriteProductDomainsSectionProps = {
  favorites: ProductDomain[];
  onChange: (next: ProductDomain[]) => void;
};

function FavoriteProductDomainsSection({
  favorites,
  onChange,
}: FavoriteProductDomainsSectionProps) {
  const client = getClient();
  const optionsQuery = useQuery({
    queryKey: ['product-domain-options'],
    queryFn: () => client.getProductDomainOptions(),
    staleTime: 60 * 60_000,
    refetchOnMount: 'always',
  });

  // Union the fetched options with already-favorited ones, so a favorite that
  // was removed from the field config still appears here and can be unticked.
  const all = useMemo(() => {
    const seen = new Map<string, ProductDomain>();
    for (const d of [...favorites, ...(optionsQuery.data ?? [])]) {
      if (!seen.has(d.id)) seen.set(d.id, d);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [favorites, optionsQuery.data]);

  const favoriteIds = useMemo(() => new Set(favorites.map((d) => d.id)), [favorites]);

  const toggle = (domain: ProductDomain) => {
    if (favoriteIds.has(domain.id)) {
      onChange(favorites.filter((d) => d.id !== domain.id));
    } else {
      onChange([...favorites, domain]);
    }
  };

  return (
    <section className="taco-modal-field">
      <span className="taco-modal-label">Favorite product domains</span>
      <p className="taco-settings-help">
        These appear as filter buttons in the toolbar. Leave empty to show every domain found in
        currently loaded tickets.
      </p>

      {optionsQuery.isPending && <div className="taco-cell-loading">Loading domains…</div>}
      {optionsQuery.isError && (
        <div className="taco-cell-error">
          Couldn't load domains:{' '}
          {optionsQuery.error instanceof Error ? optionsQuery.error.message : 'unknown error'}
        </div>
      )}
      {optionsQuery.isSuccess && all.length === 0 && (
        <p className="taco-detail-empty">No domain options available.</p>
      )}
      {all.length > 0 && (
        <div className="taco-settings-domain-grid">
          {all.map((d) => {
            const selected = favoriteIds.has(d.id);
            return (
              <button
                key={d.id}
                type="button"
                className="taco-button"
                aria-pressed={selected}
                onClick={() => toggle(d)}
              >
                {d.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

type FavoritePeopleSectionProps = {
  favorites: User[];
  onChange: (next: User[]) => void;
};

function FavoritePeopleSection({ favorites, onChange }: FavoritePeopleSectionProps) {
  const client = getClient();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim());
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number; width: number } | null>(
    null,
  );

  const searchQuery = useQuery({
    queryKey: ['user-picker', debounced],
    queryFn: () => client.searchUsers(debounced),
    enabled: debounced.length > 0,
    staleTime: 60_000,
  });

  const favoriteIds = useMemo(() => new Set(favorites.map((u) => u.accountId)), [favorites]);
  const results = (searchQuery.data ?? []).filter((u) => !favoriteIds.has(u.accountId));

  const showPopover = debounced.length > 0;

  // Anchor the popover to the input via getBoundingClientRect — pinned across
  // modal scroll and window resize. Using the popover API (showPopover) lifts
  // the element into the top layer so it escapes the modal body's overflow.
  useLayoutEffect(() => {
    if (!showPopover) {
      setPopoverPos(null);
      return;
    }
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const next = { left: r.left, top: r.bottom + 4, width: r.width };
      // Guard against the listener firing on every scroll/resize tick when the
      // rect hasn't actually moved.
      setPopoverPos((prev) =>
        prev && prev.left === next.left && prev.top === next.top && prev.width === next.width
          ? prev
          : next,
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showPopover]);

  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    if (showPopover) {
      if (!el.matches(':popover-open')) el.showPopover();
    } else {
      if (el.matches(':popover-open')) el.hidePopover();
    }
  }, [showPopover]);

  const add = (user: User) => {
    onChange([...favorites, user]);
    setQuery('');
    inputRef.current?.focus();
  };

  const remove = (accountId: string) => {
    onChange(favorites.filter((u) => u.accountId !== accountId));
  };

  const move = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= favorites.length) return;
    const next = favorites.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const sortAlphabetically = () =>
    onChange([...favorites].sort((a, b) => a.displayName.localeCompare(b.displayName)));

  return (
    <section className="taco-modal-field">
      <span className="taco-modal-label">Favorite people</span>
      <p className="taco-settings-help">
        These people appear in the user filter and assignee picker. Leave empty to fall back to whoever
        is assigned to currently loaded tickets.
      </p>

      <input
        ref={inputRef}
        className="taco-input"
        placeholder="Search people to add…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      <div
        ref={popoverRef}
        popover="manual"
        className="taco-settings-results"
        style={
          popoverPos
            ? { left: popoverPos.left, top: popoverPos.top, width: popoverPos.width }
            : undefined
        }
      >
        {searchQuery.isPending && <div className="taco-cell-loading">Searching…</div>}
        {searchQuery.isError && (
          <div className="taco-cell-error">
            Search failed: {searchQuery.error instanceof Error ? searchQuery.error.message : 'unknown'}
          </div>
        )}
        {searchQuery.isSuccess && results.length === 0 && (
          <div className="taco-cell-loading">No matches.</div>
        )}
        {results.map((u) => (
          <button
            key={u.accountId}
            type="button"
            className="taco-cell-option"
            onClick={() => add(u)}
          >
            <UserAvatar user={u} />
            <span>{u.displayName}</span>
          </button>
        ))}
      </div>

      {favorites.length === 0 ? (
        <p className="taco-detail-empty">No favorites yet.</p>
      ) : (
        <>
          {favorites.length > 1 && (
            <div>
              <button type="button" className="taco-button" onClick={sortAlphabetically}>
                Sort A–Z
              </button>
            </div>
          )}
          <ul className="taco-settings-favorites">
            {favorites.map((u, idx) => (
              <li key={u.accountId}>
                <UserAvatar user={u} />
                <span style={{ flex: 1 }}>{u.displayName}</span>
                <button
                  type="button"
                  className="taco-button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Move ${u.displayName} up`}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="taco-button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === favorites.length - 1}
                  aria-label={`Move ${u.displayName} down`}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="taco-pill-clear"
                  aria-label={`Remove ${u.displayName} from favorites`}
                  onClick={() => remove(u.accountId)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
