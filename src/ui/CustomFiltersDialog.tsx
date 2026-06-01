import { useEffect, useMemo, useState } from 'react';
import type { Component, ProductDomain, User } from '../api/types';
import { useConfig, type CustomFilter } from '../lib/config';
import { orderWithMeFirst } from '../lib/users';
import { useProjectComponents } from './queries';
import { UserAvatar } from './UserAvatar';

type Props = {
  projectKey: string;
  assignees: User[];
  productDomains: ProductDomain[];
  me: User | null;
  onClose: () => void;
};

function newFilter(): CustomFilter {
  return {
    id: crypto.randomUUID(),
    name: '',
    assigneeAccountIds: [],
    productDomainIds: [],
    componentIds: [],
  };
}

export function CustomFiltersDialog({ projectKey, assignees, productDomains, me, onClose }: Props) {
  const { config, update } = useConfig();
  const componentsQuery = useProjectComponents(projectKey);
  const components = componentsQuery.data ?? [];
  const filters = config.customFilters;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patch = (id: string, changes: Partial<CustomFilter>) =>
    update({ customFilters: filters.map((f) => (f.id === id ? { ...f, ...changes } : f)) });
  const add = () => update({ customFilters: [...filters, newFilter()] });
  const remove = (id: string) =>
    update({ customFilters: filters.filter((f) => f.id !== id) });
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= filters.length) return;
    const next = [...filters];
    [next[index], next[target]] = [next[target], next[index]];
    update({ customFilters: next });
  };

  const orderedPeople = orderWithMeFirst(assignees, me);

  return (
    <div className="taco-modal-backdrop" onClick={onClose}>
      <div className="taco-modal-panel" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="taco-modal-header">
          <h2 className="taco-modal-title">Custom filters</h2>
          <button className="taco-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="taco-modal-body">
          <p className="taco-settings-help">
            A custom filter bundles a selection of people, domains and components. Activating one in
            the toolbar narrows the overview to issues matching every dimension you set (any of the
            chosen people, any of the chosen domains, any of the chosen components).
          </p>

          {filters.length === 0 && (
            <p className="taco-detail-empty">No custom filters yet. Add one below.</p>
          )}

          {filters.map((f, index) => (
            <section key={f.id} className="taco-custom-filter-card">
              <div className="taco-custom-filter-card-head">
                <input
                  className="taco-input"
                  value={f.name}
                  placeholder="New filter"
                  onChange={(e) => patch(f.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  className="taco-button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${f.name || 'filter'} up`}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="taco-button"
                  onClick={() => move(index, 1)}
                  disabled={index === filters.length - 1}
                  aria-label={`Move ${f.name || 'filter'} down`}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="taco-pill-clear"
                  onClick={() => remove(f.id)}
                  aria-label={`Delete ${f.name}`}
                  title="Delete filter"
                >
                  ✕
                </button>
              </div>

              <span className="taco-modal-label">People</span>
              {orderedPeople.length === 0 ? (
                <p className="taco-detail-empty">No people available.</p>
              ) : (
                <div className="taco-user-filter">
                  {orderedPeople.map((u) => {
                    const selected = f.assigneeAccountIds.includes(u.accountId);
                    return (
                      <button
                        key={u.accountId}
                        type="button"
                        className={`taco-user-pill${selected ? ' selected' : ''}`}
                        aria-pressed={selected}
                        title={u.displayName}
                        onClick={() =>
                          patch(f.id, {
                            assigneeAccountIds: toggle(f.assigneeAccountIds, u.accountId),
                          })
                        }
                      >
                        <UserAvatar user={u} size={24} />
                      </button>
                    );
                  })}
                </div>
              )}

              <span className="taco-modal-label">Domains</span>
              {productDomains.length === 0 ? (
                <p className="taco-detail-empty">No domains available.</p>
              ) : (
                <div className="taco-settings-domain-grid">
                  {productDomains.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="taco-button"
                      aria-pressed={f.productDomainIds.includes(d.id)}
                      onClick={() =>
                        patch(f.id, { productDomainIds: toggle(f.productDomainIds, d.id) })
                      }
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              )}

              <span className="taco-modal-label">Components</span>
              <ComponentPicker
                projectKey={projectKey}
                components={components}
                isPending={componentsQuery.isPending}
                selected={f.componentIds}
                onToggle={(id) => patch(f.id, { componentIds: toggle(f.componentIds, id) })}
              />
            </section>
          ))}

          <div>
            <button type="button" className="taco-button" onClick={add}>
              + Add custom filter
            </button>
          </div>
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

type ComponentPickerProps = {
  projectKey: string;
  components: Component[];
  isPending: boolean;
  selected: string[];
  onToggle: (id: string) => void;
};

function ComponentPicker({
  projectKey,
  components,
  isPending,
  selected,
  onToggle,
}: ComponentPickerProps) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  // The full list can be long, so collapse it by default: show only the
  // selected components until the user searches, then add matches on top of
  // the selected ones (which always stay visible so they can be cleared).
  const visible = useMemo(() => {
    if (!q) return components.filter((c) => selected.includes(c.id));
    return components.filter((c) => selected.includes(c.id) || c.name.toLowerCase().includes(q));
  }, [components, selected, q]);

  if (isPending) return <div className="taco-cell-loading">Loading…</div>;
  if (components.length === 0)
    return <p className="taco-detail-empty">No components in {projectKey}.</p>;

  return (
    <>
      <input
        className="taco-input"
        placeholder="Search components…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        spellCheck={false}
      />
      {visible.length === 0 ? (
        <p className="taco-detail-empty">
          {q ? `No components match “${query}”.` : 'Search to add components.'}
        </p>
      ) : (
        <div className="taco-settings-domain-grid">
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              className="taco-button"
              aria-pressed={selected.includes(c.id)}
              onClick={() => onToggle(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
