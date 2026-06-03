import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Component, Issue, ProductDomain, Sprint, User } from '../api/types';
import { useConfig } from '../lib/config';
import { epicColorHex } from '../lib/epicColors';
import { projectKeyFromIssueKey } from '../lib/jql';
import { componentDomainPrefix, toKebab } from '../lib/strings';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { orderWithMeFirst } from '../lib/users';
import { getClient } from './cache';
import { useIssueMutations } from './mutations';
import { useProductDomainOptions, useProjectComponents } from './queries';
import { useSession } from './session';
import { useSprints } from './useSprints';

type PopoverProps = {
  trigger: ReactNode;
  triggerClassName?: string;
  children: (close: () => void) => ReactNode;
};

function Popover({ trigger, triggerClassName, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      // composedPath required because Taco lives in a shadow DOM.
      const path = e.composedPath();
      if (wrapRef.current && !path.includes(wrapRef.current)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="taco-cell-edit" ref={wrapRef}>
      <button
        type="button"
        className={`taco-cell-trigger${triggerClassName ? ` ${triggerClassName}` : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && <div className="taco-cell-popover">{children(() => setOpen(false))}</div>}
    </div>
  );
}

type StatusCellProps = { issueKey: string; status: Issue['status'] };

export function StatusCell({ issueKey, status }: StatusCellProps) {
  return (
    <Popover trigger={<span className={`taco-status ${status.category}`}>{status.name}</span>}>
      {(close) => <StatusEditor issueKey={issueKey} close={close} />}
    </Popover>
  );
}

function StatusEditor({ issueKey, close }: { issueKey: string; close: () => void }) {
  const client = getClient();
  const { config } = useConfig();
  // Transitions are workflow-scoped, not issue-scoped. Caching per project means one
  // fetch per project per session — the IDs returned for any issue in that project
  // apply to all of them.
  const projectKey = projectKeyFromIssueKey(issueKey);
  const transitionsQuery = useQuery({
    queryKey: ['transitions', projectKey],
    queryFn: () => client.getTransitions(issueKey),
    staleTime: Infinity,
  });
  const { transition } = useIssueMutations();

  // When the user has favorite statuses, only show those (in favorites order).
  // We still need a transition id for each, so we match transitions to favorite
  // names; transitions without a matching favorite are hidden.
  const orderedTransitions = useMemo(() => {
    const transitions = transitionsQuery.data ?? [];
    const shown = config.favoriteStatuses.filter((s) => s.shown !== false);
    if (shown.length === 0) return transitions;
    return shown
      .map((s) => transitions.find((t) => t.to.name.toLowerCase() === s.name.toLowerCase()))
      .filter((t): t is NonNullable<typeof t> => !!t);
  }, [transitionsQuery.data, config.favoriteStatuses]);

  if (transitionsQuery.isPending) return <div className="taco-cell-loading">Loading…</div>;
  if (transitionsQuery.isError)
    return <div className="taco-cell-error">Failed to load transitions</div>;

  return (
    <ul className="taco-cell-list">
      {orderedTransitions.map((t) => (
        <li key={t.id}>
          <button
            className="taco-cell-option"
            onClick={() => {
              transition.mutate({
                key: issueKey,
                transitionId: t.id,
                newStatus: { name: t.to.name, category: t.to.category },
              });
              close();
            }}
          >
            <span className={`taco-status ${t.to.category}`}>{t.to.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type AssigneeCellProps = { issueKey: string; assignee: User | null };

export function AssigneeCell({ issueKey, assignee }: AssigneeCellProps) {
  return (
    <Popover
      trigger={
        assignee ? (
          <span>
            {assignee.avatarUrl && (
              <img src={assignee.avatarUrl} alt="" className="taco-avatar" />
            )}
            {assignee.displayName}
          </span>
        ) : (
          <span style={{ color: '#5e6c84' }}>Unassigned</span>
        )
      }
    >
      {(close) => <AssigneeEditor issueKey={issueKey} close={close} />}
    </Popover>
  );
}

function AssigneeEditor({ issueKey, close }: { issueKey: string; close: () => void }) {
  const client = getClient();
  const { me, assignees } = useSession();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim());

  const isSearching = debounced.length > 0;
  const usersQuery = useQuery({
    queryKey: ['assignable', issueKey, debounced],
    queryFn: () => client.searchAssignableUsers(issueKey, debounced),
    enabled: isSearching,
    staleTime: 30_000,
  });
  const { setAssignee } = useIssueMutations();

  const list = isSearching ? (usersQuery.data ?? []) : orderWithMeFirst(assignees, me);

  return (
    <div>
      <input
        autoFocus
        className="taco-input"
        placeholder="Search all users…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <ul className="taco-cell-list">
        <li>
          <button
            className="taco-cell-option"
            onClick={() => {
              setAssignee.mutate({ key: issueKey, accountId: null, newAssignee: null });
              close();
            }}
          >
            <span style={{ color: '#5e6c84' }}>Unassigned</span>
          </button>
        </li>
        {list.map((u) => (
          <li key={u.accountId}>
            <button
              className="taco-cell-option"
              onClick={() => {
                setAssignee.mutate({ key: issueKey, accountId: u.accountId, newAssignee: u });
                close();
              }}
            >
              {u.avatarUrl && <img src={u.avatarUrl} alt="" className="taco-avatar" />}
              {u.displayName}
              {me?.accountId === u.accountId && (
                <span style={{ color: '#5e6c84', fontSize: 11, marginLeft: 'auto' }}>you</span>
              )}
            </button>
          </li>
        ))}
        {isSearching && usersQuery.isFetching && <li className="taco-cell-loading">Searching…</li>}
      </ul>
    </div>
  );
}

type SprintCellProps = { issueKey: string; sprint: Sprint | null };

export function SprintCell({ issueKey, sprint }: SprintCellProps) {
  return (
    <Popover trigger={<span>{sprint?.name ?? '—'}</span>}>
      {(close) => <SprintEditor issueKey={issueKey} close={close} />}
    </Popover>
  );
}

function SprintEditor({ issueKey, close }: { issueKey: string; close: () => void }) {
  const projectKey = projectKeyFromIssueKey(issueKey);
  const sprintsQuery = useSprints(projectKey);
  const { setSprint } = useIssueMutations();

  if (sprintsQuery.isPending) return <div className="taco-cell-loading">Loading…</div>;

  return (
    <ul className="taco-cell-list">
      <li>
        <button
          className="taco-cell-option"
          onClick={() => {
            setSprint.mutate({ key: issueKey, sprintId: null, newSprint: null });
            close();
          }}
        >
          <span style={{ color: '#5e6c84' }}>Move to backlog</span>
        </button>
      </li>
      {sprintsQuery.data?.map((s) => (
        <li key={s.id}>
          <button
            className="taco-cell-option"
            onClick={() => {
              setSprint.mutate({ key: issueKey, sprintId: s.id, newSprint: s });
              close();
            }}
          >
            <span>{s.name}</span>
            <span style={{ color: '#5e6c84', fontSize: 11, marginLeft: 'auto' }}>{s.state}</span>
          </button>
        </li>
      ))}
      {sprintsQuery.data && sprintsQuery.data.length === 0 && (
        <li className="taco-cell-error">No active or future sprints found</li>
      )}
    </ul>
  );
}


type ProductDomainCellProps = { issueKey: string; productDomains: ProductDomain[] };

export function ProductDomainCell({ issueKey, productDomains }: ProductDomainCellProps) {
  const { config } = useConfig();
  return (
    <Popover
      trigger={
        <span>
          {productDomains.length === 0
            ? '—'
            : productDomains
                .map((d) => {
                  const icon = config.productDomainIcons[d.id];
                  return icon ? `${icon} ${d.name}` : d.name;
                })
                .join(', ')}
        </span>
      }
    >
      {() => <ProductDomainEditor issueKey={issueKey} current={productDomains} />}
    </Popover>
  );
}

function ProductDomainEditor({
  issueKey,
  current,
}: {
  issueKey: string;
  current: ProductDomain[];
}) {
  const { config } = useConfig();
  const { options, isPending } = useProductDomainOptions();
  const { setProductDomain } = useIssueMutations();

  // Multi-select: each click toggles a domain and saves immediately, leaving the
  // popover open so several can be picked in a row.
  const toggle = (d: ProductDomain) => {
    const has = current.some((c) => c.id === d.id);
    const next = has ? current.filter((c) => c.id !== d.id) : [...current, d];
    setProductDomain.mutate({
      key: issueKey,
      optionIds: next.map((c) => c.id),
      newProductDomains: next,
    });
  };

  return (
    <ul className="taco-cell-list">
      {options.map((d) => {
        const icon = config.productDomainIcons[d.id];
        return (
          <li key={d.id}>
            <button
              className="taco-cell-option"
              aria-pressed={current.some((c) => c.id === d.id)}
              onClick={() => toggle(d)}
            >
              {icon ? `${icon} ${d.name}` : d.name}
            </button>
          </li>
        );
      })}
      {isPending && <li className="taco-cell-loading">Loading…</li>}
    </ul>
  );
}

type ComponentsCellProps = {
  issueKey: string;
  components: Component[];
  productDomains: ProductDomain[];
};

export function ComponentsCell({ issueKey, components, productDomains }: ComponentsCellProps) {
  return (
    <Popover
      trigger={
        <span>
          {components.length === 0 ? '—' : components.map((c) => c.name).join(', ')}
        </span>
      }
    >
      {(close) => (
        <ComponentsEditor
          issueKey={issueKey}
          current={components}
          productDomains={productDomains}
          close={close}
        />
      )}
    </Popover>
  );
}

function ComponentsEditor({
  issueKey,
  current,
  productDomains,
  close,
}: {
  issueKey: string;
  current: Component[];
  productDomains: ProductDomain[];
  close: () => void;
}) {
  const { config } = useConfig();
  const projectKey = projectKeyFromIssueKey(issueKey);
  const componentsQuery = useProjectComponents(projectKey);
  const all = componentsQuery.data ?? [];
  const [draft, setDraft] = useState<string[]>(() => current.map((c) => c.id));
  // Re-sync draft if the underlying current changes (e.g. another tab edited
  // components, or an optimistic patch landed while popover is open).
  useEffect(() => {
    setDraft(current.map((c) => c.id));
  }, [current]);
  const { setComponents } = useIssueMutations();

  const allowedPrefixes = useMemo(() => {
    if (productDomains.length > 0) return new Set(productDomains.map((d) => toKebab(d.name)));
    return new Set(config.favoriteProductDomains.map((d) => toKebab(d.name)));
  }, [productDomains, config.favoriteProductDomains]);

  const visible = useMemo(() => {
    if (allowedPrefixes.size === 0) return all;
    return all.filter((c) => allowedPrefixes.has(componentDomainPrefix(c.name)));
  }, [all, allowedPrefixes]);

  const toggle = (id: string) =>
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = () => {
    const next = all.filter((c) => draft.includes(c.id));
    setComponents.mutate({ key: issueKey, componentIds: draft, newComponents: next });
    close();
  };

  return (
    <div>
      <ul className="taco-cell-list">
        {componentsQuery.isPending && <li className="taco-cell-loading">Loading…</li>}
        {visible.length === 0 && !componentsQuery.isPending && (
          <li className="taco-cell-loading">No components match this domain.</li>
        )}
        {visible.map((c) => {
          const selected = draft.includes(c.id);
          return (
            <li key={c.id}>
              <button
                className="taco-cell-option"
                aria-pressed={selected}
                onClick={() => toggle(c.id)}
              >
                <input type="checkbox" checked={selected} readOnly tabIndex={-1} />
                <span>{c.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button type="button" className="taco-button" onClick={close}>
          Cancel
        </button>
        <button type="button" className="taco-button primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

type ParentCellProps = {
  issueKey: string;
  parent: { key: string; summary: string } | null;
  // If provided, the parent name becomes a link that navigates to the parent
  // and a separate "edit" affordance opens the picker. Without it, the whole
  // cell triggers the picker (table behavior).
  onNavigate?: (key: string) => void;
};

export function ParentCell({ issueKey, parent, onNavigate }: ParentCellProps) {
  const client = getClient();
  const projectKey = projectKeyFromIssueKey(issueKey);
  const projectEpicsQuery = useQuery({
    queryKey: ['project-epics', projectKey],
    queryFn: () => client.getProjectEpics(projectKey),
    staleTime: 5 * 60_000,
  });
  const colorKey = parent
    ? projectEpicsQuery.data?.find((e) => e.key === parent.key)?.colorKey
    : undefined;

  const parentLabel = parent && (
    <>
      <span
        className="taco-epic-swatch"
        style={{ background: epicColorHex(colorKey) ?? '#dfe1e6' }}
        aria-hidden="true"
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 180,
        }}
      >
        {parent.summary}
      </span>
    </>
  );

  if (onNavigate) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {parent ? (
          <button
            type="button"
            className="taco-link-button"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => onNavigate(parent.key)}
            title={`Open ${parent.key}`}
          >
            {parentLabel}
          </button>
        ) : (
          <span style={{ color: '#5e6c84' }}>—</span>
        )}
        <Popover
          triggerClassName="taco-button"
          trigger={<span aria-label="Edit parent" title="Edit parent">✎</span>}
        >
          {(close) => <ParentEditor issueKey={issueKey} current={parent} close={close} />}
        </Popover>
      </span>
    );
  }

  return (
    <Popover
      trigger={
        parent ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {parentLabel}
          </span>
        ) : (
          <span style={{ color: '#5e6c84' }}>—</span>
        )
      }
    >
      {(close) => <ParentEditor issueKey={issueKey} current={parent} close={close} />}
    </Popover>
  );
}

function ParentEditor({
  issueKey,
  current,
  close,
}: {
  issueKey: string;
  current: { key: string; summary: string } | null;
  close: () => void;
}) {
  const client = getClient();
  const { epics } = useSession();
  const projectKey = projectKeyFromIssueKey(issueKey);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());

  const searchQuery = useQuery({
    queryKey: ['issue-picker', projectKey, debounced],
    queryFn: () => client.searchIssuesForPicker(debounced, projectKey),
    enabled: debounced.length > 0,
    staleTime: 30_000,
  });

  const projectEpicsQuery = useQuery({
    queryKey: ['project-epics', projectKey],
    queryFn: () => client.getProjectEpics(projectKey),
    staleTime: 5 * 60_000,
  });

  const epicColorByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of projectEpicsQuery.data ?? []) {
      if (e.colorKey) m.set(e.key, e.colorKey);
    }
    return m;
  }, [projectEpicsQuery.data]);

  const { setParent } = useIssueMutations();

  const pick = (next: { key: string; summary: string } | null) => {
    setParent.mutate({
      key: issueKey,
      parentKey: next?.key ?? null,
      newParent: next,
    });
    close();
  };

  return (
    <div>
      <input
        autoFocus
        className="taco-input"
        placeholder="Search by key or summary…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <ul className="taco-cell-list">
        <li>
          <button
            className="taco-cell-option"
            onClick={() => pick(null)}
            aria-pressed={current === null}
          >
            <span style={{ color: '#5e6c84' }}>No parent</span>
          </button>
        </li>
        {debounced ? (
          <>
            {searchQuery.isFetching && <li className="taco-cell-loading">Searching…</li>}
            {searchQuery.data?.map((i) => (
              <li key={i.key}>
                <button
                  className="taco-cell-option"
                  aria-pressed={current?.key === i.key}
                  onClick={() => pick({ key: i.key, summary: i.summary })}
                >
                  <span className="taco-key" style={{ flexShrink: 0 }}>
                    {i.key}
                  </span>
                  <span>{i.summary}</span>
                </button>
              </li>
            ))}
            {!searchQuery.isFetching && searchQuery.data?.length === 0 && (
              <li className="taco-cell-loading">No matches</li>
            )}
          </>
        ) : (
          epics.map((e) => (
            <li key={e.key}>
              <button
                className="taco-cell-option"
                aria-pressed={current?.key === e.key}
                onClick={() => pick({ key: e.key, summary: e.summary })}
              >
                <span
                  className="taco-epic-swatch"
                  style={{
                    background: epicColorHex(epicColorByKey.get(e.key)) ?? '#dfe1e6',
                  }}
                  aria-hidden="true"
                />
                <span>{e.summary}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

type EditableTitleProps = { issueKey: string; value: string };

export function EditableTitle({ issueKey, value }: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const { setSummary } = useIssueMutations();

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const save = () => {
    const next = draft.trim();
    if (next && next !== value) setSummary.mutate({ key: issueKey, summary: next });
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="taco-input taco-detail-title-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <h2
      className="taco-detail-title taco-detail-title-display"
      onClick={() => setEditing(true)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setEditing(true);
      }}
    >
      {value}
    </h2>
  );
}
