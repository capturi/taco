import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Component } from '../api/types';
import { markdownToAdf } from '../lib/adfMarkdown';
import { useConfig } from '../lib/config';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { epicColorHex } from '../lib/epicColors';
import { statusRank } from '../lib/status';
import { componentDomainPrefix, toKebab } from '../lib/strings';
import { orderWithMeFirst } from '../lib/users';
import { getClient } from './cache';
import { useProductDomainOptions, useProjectComponents } from './queries';
import { useSession } from './session';
import { UserAvatar } from './UserAvatar';
import { useSprints } from './useSprints';

type Props = {
  projectKey: string;
  onClose: () => void;
  onCreated: (key: string) => void;
};

const EMPTY_COMPONENTS: Component[] = [];

export function CreateIssueDialog({ projectKey, onClose, onCreated }: Props) {
  const client = getClient();
  const qc = useQueryClient();
  const { me, assignees, statuses: observedStatuses, epics } = useSession();
  const { config } = useConfig();

  const [issueTypeName, setIssueTypeName] = useState<string>('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeAccountId, setAssigneeAccountId] = useState<string | null>(null);
  const [productDomainOptionId, setProductDomainOptionId] = useState<string | null>(null);
  const [componentIds, setComponentIds] = useState<string[]>([]);
  const [statusName, setStatusName] = useState<string | null>(null);
  const [parent, setParent] = useState<{ key: string; summary: string } | null>(null);
  const [parentSearchOpen, setParentSearchOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const parentSearchDebounced = useDebouncedValue(parentSearch.trim());
  const [sprintId, setSprintId] = useState<number | null>(null);

  // Parent search is constrained to favorite domains when any are set, so the
  // dropdown only surfaces tickets the user has marked as in-scope.
  const favoriteDomainIds = useMemo(
    () => config.favoriteProductDomains.map((d) => d.id),
    [config.favoriteProductDomains],
  );

  const { options: domainOptions } = useProductDomainOptions();

  const componentsQuery = useProjectComponents(projectKey);
  const allComponents = componentsQuery.data ?? EMPTY_COMPONENTS;

  const selectedDomain = useMemo(
    () => domainOptions.find((d) => d.id === productDomainOptionId) ?? null,
    [domainOptions, productDomainOptionId],
  );

  const visibleComponents = useMemo(() => {
    if (selectedDomain) {
      const prefix = toKebab(selectedDomain.name);
      return allComponents.filter((c) => componentDomainPrefix(c.name) === prefix);
    }
    const allowedPrefixes = new Set(domainOptions.map((d) => toKebab(d.name)));
    if (allowedPrefixes.size === 0) return allComponents;
    return allComponents.filter((c) => allowedPrefixes.has(componentDomainPrefix(c.name)));
  }, [allComponents, domainOptions, selectedDomain]);

  useEffect(() => {
    if (!selectedDomain) return;
    const prefix = toKebab(selectedDomain.name);
    setComponentIds((prev) => {
      const next = prev.filter((id) => {
        const c = allComponents.find((x) => x.id === id);
        return c ? componentDomainPrefix(c.name) === prefix : false;
      });
      return next.length === prev.length ? prev : next;
    });
  }, [selectedDomain, allComponents]);

  const toggleComponent = (component: { id: string; name: string }) => {
    setComponentIds((prev) =>
      prev.includes(component.id)
        ? prev.filter((id) => id !== component.id)
        : [...prev, component.id],
    );
    if (!productDomainOptionId) {
      const prefix = componentDomainPrefix(component.name);
      const match = domainOptions.find((d) => toKebab(d.name) === prefix);
      if (match) setProductDomainOptionId(match.id);
    }
  };

  const sprintsQuery = useSprints(projectKey);

  const allSprints = sprintsQuery.data ?? [];
  const currentSprint = useMemo(() => allSprints.find((s) => s.state === 'active'), [allSprints]);
  const futureSprints = useMemo(
    () => allSprints.filter((s) => s.state === 'future').sort((a, b) => a.id - b.id),
    [allSprints],
  );
  const nextSprint = futureSprints[0];
  const parentInputRef = useRef<HTMLInputElement>(null);
  const [parentDropdownPos, setParentDropdownPos] = useState<
    { left: number; top: number; width: number } | null
  >(null);

  useLayoutEffect(() => {
    if (!parentSearchOpen) {
      setParentDropdownPos(null);
      return;
    }
    const update = () => {
      const el = parentInputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setParentDropdownPos({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [parentSearchOpen]);
  const parentResultsQuery = useQuery({
    queryKey: ['issue-picker', projectKey, parentSearchDebounced, favoriteDomainIds],
    queryFn: () =>
      client.searchIssuesForPicker(parentSearchDebounced, projectKey, favoriteDomainIds),
    enabled: parentSearchDebounced.length > 0,
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

  const typesQuery = useQuery({
    queryKey: ['issue-types', projectKey],
    queryFn: () => client.getIssueTypes(projectKey),
    staleTime: Infinity,
  });

  // Status options: favorite statuses (in user-configured order) when set,
  // otherwise fall back to statuses observed in loaded issues, sorted by the
  // hard-coded rank. (Assumes the workflow has no transition rules so any
  // status is reachable; otherwise the picker may offer unreachable values.)
  const statuses = useMemo(() => {
    if (config.favoriteStatuses.length > 0) return config.favoriteStatuses;
    return [...observedStatuses].sort((a, b) => statusRank(a.name) - statusRank(b.name));
  }, [config.favoriteStatuses, observedStatuses]);

  // Favorite types (in user-configured order) when set, intersected with what
  // the project actually offers so stale favorites drop out; otherwise all
  // non-subtask types as reported.
  const types = useMemo(() => {
    const available = (typesQuery.data ?? []).filter((t) => !t.subtask);
    if (config.favoriteIssueTypes.length === 0) return available;
    const byName = new Map(available.map((t) => [t.name.toLowerCase(), t]));
    return config.favoriteIssueTypes
      .map((f) => byName.get(f.name.toLowerCase()))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
  }, [typesQuery.data, config.favoriteIssueTypes]);

  useEffect(() => {
    if (!issueTypeName && types.length > 0) {
      // When favorites are configured the first is the user's default;
      // otherwise prefer Task / Story if available, else first.
      const preferred =
        config.favoriteIssueTypes.length > 0
          ? types[0]
          : (types.find((t) => /^task|story$/i.test(t.name)) ?? types[0]);
      setIssueTypeName(preferred.name);
    }
  }, [types, issueTypeName, config.favoriteIssueTypes]);

  useEffect(() => {
    if (!statusName && statuses.length > 0) {
      // Prefer the user's configured default; fall back to "To Do" then the
      // first available status.
      const configured =
        config.defaultCreateStatus &&
        statuses.find(
          (s) => s.name.toLowerCase() === config.defaultCreateStatus?.toLowerCase(),
        );
      if (configured) {
        setStatusName(configured.name);
        return;
      }
      const todo = statuses.find((s) => s.name.toLowerCase() === 'to do');
      setStatusName(todo?.name ?? statuses[0].name);
    }
  }, [statuses, statusName, config.defaultCreateStatus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const create = useMutation({
    mutationFn: async () => {
      const result = await client.createIssue({
        projectKey,
        issueTypeName,
        summary: summary.trim(),
        descriptionAdf: description.trim() ? markdownToAdf(description) : undefined,
        assigneeAccountId,
        parentKey: parent?.key ?? null,
        productDomainOptionId,
        componentIds,
      });
      // Jira creates issues in the workflow's initial state. To land in a different
      // status we transition immediately after.
      if (statusName) {
        const transitions = await client.getTransitions(result.key);
        const target = transitions.find((t) => t.to.name === statusName);
        if (target) await client.transitionIssue(result.key, target.id);
      }
      // Sprint can't be set in the create payload reliably across instances; use the
      // Agile API to move the new issue into the chosen sprint.
      if (sprintId !== null) {
        await client.setIssueSprint(result.key, sprintId);
      }
      return result;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      onCreated(result.key);
    },
  });

  // Domain and Components are required, but only when the project actually
  // offers them — otherwise there'd be no way to satisfy the requirement.
  const domainOk = domainOptions.length === 0 || productDomainOptionId !== null;
  const componentsOk = visibleComponents.length === 0 || componentIds.length > 0;
  const canSubmit =
    summary.trim().length > 0 &&
    issueTypeName.length > 0 &&
    domainOk &&
    componentsOk &&
    !create.isPending;

  return (
    <div className="taco-modal-backdrop" onClick={onClose}>
      <div className="taco-modal-panel" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="taco-modal-header">
          <h2 className="taco-modal-title">New ticket in {projectKey}</h2>
          <button className="taco-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="taco-modal-body">
          <div className="taco-modal-field">
            <span className="taco-modal-label">Type</span>
            {typesQuery.isPending && <span style={{ color: '#5e6c84' }}>Loading…</span>}
            {!typesQuery.isPending && types.length > 0 && (
              <div className="taco-segmented">
                {types.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={issueTypeName === t.name}
                    onClick={() => setIssueTypeName(t.name)}
                  >
                    {t.iconUrl && (
                      <img
                        src={t.iconUrl}
                        alt=""
                        style={{ width: 16, height: 16, marginRight: 6, verticalAlign: 'middle' }}
                      />
                    )}
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            {typesQuery.isError && (
              <span className="taco-cell-error" style={{ padding: 0 }}>
                {typesQuery.error instanceof Error
                  ? typesQuery.error.message
                  : String(typesQuery.error)}
              </span>
            )}
          </div>

          <label className="taco-modal-field">
            <span className="taco-modal-label">Summary</span>
            <input
              autoFocus
              className="taco-input"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Short title"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
                  e.preventDefault();
                  create.mutate();
                }
              }}
            />
          </label>

          <label className="taco-modal-field">
            <span className="taco-modal-label">
              Description <span style={{ color: '#5e6c84', fontWeight: 400 }}>(Markdown)</span>
            </span>
            <textarea
              className="taco-input taco-detail-edit-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              placeholder="Optional"
            />
          </label>

          {statuses.length > 0 && (
            <div className="taco-modal-field">
              <span className="taco-modal-label">Status</span>
              <div className="taco-segmented">
                {statuses.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    aria-pressed={statusName === s.name}
                    onClick={() => setStatusName(s.name)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="taco-modal-field">
            <span className="taco-modal-label">Parent</span>
            <div>
              <div className="taco-pill-row">
                {epics.map((e) => {
                  const isSelected = parent?.key === e.key;
                  const color = epicColorHex(epicColorByKey.get(e.key));
                  return (
                    <button
                      key={e.key}
                      type="button"
                      className="taco-button taco-pill-truncate taco-epic-pill"
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (isSelected) {
                          setParent(null);
                        } else {
                          setParent({ key: e.key, summary: e.summary });
                          setParentSearchOpen(false);
                          setParentSearch('');
                        }
                      }}
                      title={`${e.key} — ${e.summary}`}
                    >
                      <span
                        className="taco-epic-swatch"
                        style={{ background: color ?? '#dfe1e6' }}
                        aria-hidden="true"
                      />
                      {e.summary}
                    </button>
                  );
                })}

                {parentSearchOpen ? (
                  <input
                    autoFocus
                    ref={parentInputRef}
                    className="taco-input"
                    style={{ flex: 1, minWidth: 200 }}
                    placeholder="Search by key or summary…"
                    value={parentSearch}
                    onChange={(e) => setParentSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setParentSearchOpen(false);
                        setParentSearch('');
                      }
                    }}
                  />
                ) : parent && !epics.some((e) => e.key === parent.key) ? (
                  <div className="taco-selected-button">
                    <button
                      type="button"
                      className="taco-selected-button-main"
                      onClick={() => setParentSearchOpen(true)}
                      title={`${parent.key} — ${parent.summary}`}
                    >
                      <span
                        className="taco-epic-swatch"
                        style={{
                          background:
                            epicColorHex(epicColorByKey.get(parent.key)) ?? '#dfe1e6',
                        }}
                        aria-hidden="true"
                      />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {parent.summary}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="taco-selected-button-clear"
                      onClick={() => setParent(null)}
                      aria-label="Clear parent"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="taco-button"
                    onClick={() => setParentSearchOpen(true)}
                  >
                    Search…
                  </button>
                )}
              </div>

              {parentSearchOpen && parentSearchDebounced && parentDropdownPos && (
                <div
                  className="taco-cell-popover"
                  style={{
                    position: 'fixed',
                    left: parentDropdownPos.left,
                    top: parentDropdownPos.top,
                    width: parentDropdownPos.width,
                    minWidth: 0,
                    margin: 0,
                  }}
                >
                  <ul className="taco-cell-list">
                    {parentResultsQuery.isFetching && (
                      <li className="taco-cell-loading">Searching…</li>
                    )}
                    {parentResultsQuery.data?.map((i) => (
                      <li key={i.key}>
                        <button
                          type="button"
                          className="taco-cell-option"
                          aria-pressed={parent?.key === i.key}
                          onClick={() => {
                            setParent({ key: i.key, summary: i.summary });
                            setParentSearchOpen(false);
                            setParentSearch('');
                          }}
                        >
                          <span className="taco-key" style={{ flexShrink: 0 }}>
                            {i.key}
                          </span>
                          <span>{i.summary}</span>
                        </button>
                      </li>
                    ))}
                    {!parentResultsQuery.isFetching &&
                      parentResultsQuery.data?.length === 0 && (
                        <li className="taco-cell-loading">No matches</li>
                      )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {allSprints.length > 0 && (
            <div className="taco-modal-field">
              <span className="taco-modal-label">Sprint</span>
              <div className="taco-pill-row">
                {currentSprint && (
                  <button
                    type="button"
                    className="taco-button"
                    aria-pressed={sprintId === currentSprint.id}
                    title={currentSprint.name}
                    onClick={() =>
                      setSprintId(sprintId === currentSprint.id ? null : currentSprint.id)
                    }
                  >
                    Current
                  </button>
                )}
                {nextSprint && (
                  <button
                    type="button"
                    className="taco-button"
                    aria-pressed={sprintId === nextSprint.id}
                    title={nextSprint.name}
                    onClick={() =>
                      setSprintId(sprintId === nextSprint.id ? null : nextSprint.id)
                    }
                  >
                    Next
                  </button>
                )}
                <select
                  className="taco-select"
                  value={sprintId?.toString() ?? ''}
                  onChange={(e) =>
                    setSprintId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">Pick sprint…</option>
                  {allSprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {domainOptions.length > 0 && (
            <div className="taco-modal-field">
              <span className="taco-modal-label">
                Domain <span style={{ color: '#de350b', fontWeight: 400 }}>*</span>
              </span>
              <div className="taco-segmented">
                {domainOptions.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={productDomainOptionId === d.id}
                    onClick={() =>
                      setProductDomainOptionId(productDomainOptionId === d.id ? null : d.id)
                    }
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {visibleComponents.length > 0 && (
            <div className="taco-modal-field">
              <span className="taco-modal-label">
                Components <span style={{ color: '#de350b', fontWeight: 400 }}>*</span>
              </span>
              <div className="taco-pill-row">
                {visibleComponents.map((c) => {
                  const isSelected = componentIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="taco-button"
                      aria-pressed={isSelected}
                      onClick={() => toggleComponent(c)}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="taco-modal-field">
            <span className="taco-modal-label">Assignee</span>
            <div className="taco-user-filter">
              {orderWithMeFirst(assignees, me).map((u) => {
                const isSelected = assigneeAccountId === u.accountId;
                const isMe = me?.accountId === u.accountId;
                return (
                  <button
                    key={u.accountId}
                    type="button"
                    className={`taco-user-pill${isSelected ? ' selected' : ''}${isMe ? ' me' : ''}`}
                    aria-pressed={isSelected}
                    title={isMe ? `${u.displayName} (you)` : u.displayName}
                    onClick={() =>
                      setAssigneeAccountId(isSelected ? null : u.accountId)
                    }
                  >
                    <UserAvatar user={u} />
                  </button>
                );
              })}
            </div>
          </div>

          {create.isError && (
            <div className="taco-cell-error">
              {create.error instanceof Error ? create.error.message : String(create.error)}
            </div>
          )}
        </div>

        <footer className="taco-modal-footer">
          <button className="taco-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="taco-button primary"
            onClick={() => create.mutate()}
            disabled={!canSubmit}
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </footer>
      </div>
    </div>
  );
}
