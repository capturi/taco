import { useEffect, useRef, useState } from 'react';
import type { ProductDomain, User } from '../api/types';
import type { Filters } from '../lib/filter';
import type { GroupKey } from '../lib/groupBy';
import { orderWithMeFirst } from '../lib/users';
import { UserAvatar } from './UserAvatar';

type Props = {
  jql: string;
  onJqlChange: (jql: string) => void;
  onJqlSubmit: () => void;
  groupKey: GroupKey;
  onGroupKeyChange: (k: GroupKey) => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  assignees: User[];
  productDomains: ProductDomain[];
  me: User | null;
  allCollapsed: boolean;
  onToggleAllGroups: () => void;
  onCreateClick: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onSettingsClick: () => void;
  onClose: () => void;
};

export function Toolbar(props: Props) {
  const { filters, onFiltersChange } = props;

  const setAssignees = (ids: string[]) => onFiltersChange({ ...filters, assigneeAccountIds: ids });
  const toggleCurrentSprint = () =>
    onFiltersChange({ ...filters, currentSprintOnly: !filters.currentSprintOnly });
  const setProductDomain = (id: string | null) =>
    onFiltersChange({ ...filters, productDomainId: id });

  return (
    <div className="taco-toolbar">
      <button className="taco-button dark" onClick={props.onCreateClick}>
        + Create
      </button>
      <button
        className="taco-button"
        onClick={props.onRefresh}
        title="Refresh issues"
        aria-label="Refresh issues"
        disabled={props.isRefreshing}
      >
        <span className={props.isRefreshing ? 'taco-spin' : undefined} aria-hidden="true">
          ↻
        </span>
      </button>

      <span style={{ width: 12 }} />

      <label>Group by</label>
      <div className="taco-segmented">
        {(['status', 'epic', 'assignee'] as GroupKey[]).map((k) => (
          <button
            key={k}
            aria-pressed={props.groupKey === k}
            onClick={() => props.onGroupKeyChange(k)}
          >
            {labelFor(k)}
          </button>
        ))}
      </div>
      <button className="taco-button" onClick={props.onToggleAllGroups}>
        {props.allCollapsed ? 'Expand all' : 'Collapse all'}
      </button>

      <span style={{ width: 12 }} />

      {props.productDomains.length > 0 && (
        <>
          <label>Domain</label>
          <div className="taco-segmented">
            <button
              aria-pressed={filters.productDomainId === null}
              onClick={() => setProductDomain(null)}
            >
              All
            </button>
            {props.productDomains.map((d) => (
              <button
                key={d.id}
                aria-pressed={filters.productDomainId === d.id}
                onClick={() => setProductDomain(d.id)}
              >
                {d.name}
              </button>
            ))}
          </div>
        </>
      )}

      <label>Sprint</label>
      <button
        className="taco-button"
        aria-pressed={filters.currentSprintOnly}
        onClick={toggleCurrentSprint}
      >
        Current sprint
      </button>

      <UserFilter
        me={props.me}
        assignees={props.assignees}
        value={filters.assigneeAccountIds}
        onChange={setAssignees}
      />

      <input
        className="taco-input"
        style={{ marginLeft: 'auto', minWidth: 180 }}
        placeholder="Search…"
        value={filters.text}
        onChange={(e) => onFiltersChange({ ...filters, text: e.target.value })}
      />

      <JqlMenu
        jql={props.jql}
        onJqlChange={props.onJqlChange}
        onJqlSubmit={props.onJqlSubmit}
      />
      <button
        className="taco-button"
        onClick={props.onSettingsClick}
        aria-label="Settings"
        title="Settings"
      >
        ⚙
      </button>
      <button
        className="taco-button"
        onClick={props.onClose}
        aria-label="Close Taco"
        title="Close Taco"
      >
        ✕
      </button>
    </div>
  );
}

type JqlMenuProps = {
  jql: string;
  onJqlChange: (jql: string) => void;
  onJqlSubmit: () => void;
};

function JqlMenu({ jql, onJqlChange, onJqlSubmit }: JqlMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      // composedPath is required because Taco lives in a shadow DOM; e.target gets
      // retargeted to the host outside the shadow tree on document-level listeners.
      const path = e.composedPath();
      if (wrapperRef.current && !path.includes(wrapperRef.current)) setOpen(false);
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

  const submitAndClose = () => {
    onJqlSubmit();
    setOpen(false);
  };

  return (
    <div className="taco-menu-wrapper" ref={wrapperRef}>
      <button
        className="taco-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="JQL options"
        onClick={() => setOpen((o) => !o)}
      >
        ⋮
      </button>
      {open && (
        <div className="taco-menu" role="dialog" aria-label="JQL">
          <label htmlFor="taco-jql">JQL</label>
          <textarea
            id="taco-jql"
            className="taco-input taco-jql-textarea"
            value={jql}
            onChange={(e) => onJqlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitAndClose();
              }
            }}
            rows={3}
            spellCheck={false}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="taco-button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="taco-button primary" onClick={submitAndClose}>
              Run
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function labelFor(k: GroupKey): string {
  return k === 'status' ? 'Status' : k === 'epic' ? 'Epic' : 'Assignee';
}

type UserFilterProps = {
  me: User | null;
  assignees: User[];
  value: string[];
  onChange: (next: string[]) => void;
};

function UserFilter({ me, assignees, value, onChange }: UserFilterProps) {
  const ordered = orderWithMeFirst(assignees, me);
  const selected = new Set(value);

  if (ordered.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="taco-user-filter" role="group" aria-label="Filter by assignee">
      <label className="taco-user-filter-label">User</label>
      {ordered.map((u) => {
        const isMe = me?.accountId === u.accountId;
        const isSelected = selected.has(u.accountId);
        return (
          <button
            key={u.accountId}
            type="button"
            className={`taco-user-pill${isSelected ? ' selected' : ''}${isMe ? ' me' : ''}`}
            aria-pressed={isSelected}
            title={isMe ? `${u.displayName} (you)` : u.displayName}
            onClick={() => toggle(u.accountId)}
          >
            <UserAvatar user={u} size={24} />
          </button>
        );
      })}
    </div>
  );
}

