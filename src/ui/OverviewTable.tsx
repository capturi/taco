import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { useMemo } from 'react';
import type { Issue, User } from '../api/types';
import type { Group } from '../lib/groupBy';
import { statusRank } from '../lib/status';
import { AssigneeCell, SprintCell, StatusCell } from './editors';

type StatusBreakdown = {
  statusName: string;
  category: Issue['status']['category'];
  count: number;
};

function buildStatusBreakdown(issues: Issue[]): StatusBreakdown[] {
  const map = new Map<string, StatusBreakdown>();
  for (const issue of issues) {
    let entry = map.get(issue.status.name);
    if (!entry) {
      entry = { statusName: issue.status.name, category: issue.status.category, count: 0 };
      map.set(issue.status.name, entry);
    }
    entry.count++;
  }
  return [...map.values()].sort((a, b) => statusRank(a.statusName) - statusRank(b.statusName));
}

function uniqueAssignees(issues: Issue[]): User[] {

  const map = new Map<string, User>();
  for (const i of issues) {
    if (i.assignee && !map.has(i.assignee.accountId)) map.set(i.assignee.accountId, i.assignee);
  }
  return [...map.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends unknown, TValue> {
    className?: string;
  }
}

function makeColumns(onIssueClick: (issueKey: string) => void): ColumnDef<Issue>[] {
  const issueLink = (issue: Issue, label: string, className: string) => (
    <a
      className={className}
      href={issue.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        onIssueClick(issue.key);
      }}
    >
      {label}
    </a>
  );

  const keyLink = (key: string, label: string, className = 'taco-summary') => (
    <a
      className={className}
      href={`${window.location.origin}/browse/${key}`}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        onIssueClick(key);
      }}
    >
      {label}
    </a>
  );

  return [
    {
      id: 'key',
      header: 'Key',
      accessorFn: (i) => i.key,
      cell: (ctx) => issueLink(ctx.row.original, ctx.row.original.key, 'taco-key'),
    },
    {
      id: 'summary',
      header: 'Summary',
      accessorFn: (i) => i.summary,
      cell: (ctx) => issueLink(ctx.row.original, ctx.row.original.summary, 'taco-summary'),
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: (i) => i.status.name,
      cell: (ctx) => (
        <StatusCell issueKey={ctx.row.original.key} status={ctx.row.original.status} />
      ),
    },
    {
      id: 'assignee',
      header: 'Assignee',
      accessorFn: (i) => i.assignee?.displayName ?? '',
      meta: { className: 'taco-nowrap' },
      cell: (ctx) => (
        <AssigneeCell issueKey={ctx.row.original.key} assignee={ctx.row.original.assignee} />
      ),
    },
    {
      id: 'parent',
      header: 'Parent',
      accessorFn: (i) => i.parent?.summary ?? '',
      cell: (ctx) => {
        const i = ctx.row.original;
        const parentKey = i.parent?.key ?? i.epic?.key;
        const parentLabel = i.parent?.summary ?? i.epic?.summary;
        if (!parentKey || !parentLabel) return '';
        const showEpicInParens =
          i.epic && i.parent && i.epic.key !== i.parent.key;
        return (
          <span>
            {keyLink(parentKey, parentLabel)}
            {showEpicInParens && i.epic && (
              <>
                {' ('}
                {keyLink(i.epic.key, i.epic.summary)}
                {')'}
              </>
            )}
          </span>
        );
      },
    },
    {
      id: 'sprint',
      header: 'Sprint',
      accessorFn: (i) => i.sprint?.name ?? '',
      meta: { className: 'taco-nowrap' },
      cell: (ctx) => (
        <SprintCell issueKey={ctx.row.original.key} sprint={ctx.row.original.sprint} />
      ),
    },
  ];
}

// Columns whose cells contain inline editors (popovers); clicks on these
// must not bubble up to open the detail sidebar.
const INTERACTIVE_COLUMNS = new Set(['status', 'assignee', 'sprint']);

type GroupedRow =
  | { kind: 'group'; group: Group }
  | { kind: 'issue'; groupId: string; issue: Issue };

type Props = {
  groups: Group[];
  collapsedIds: Set<string>;
  onToggleGroup: (id: string) => void;
  onIssueClick: (issueKey: string) => void;
};

export function OverviewTable({ groups, collapsedIds, onToggleGroup, onIssueClick }: Props) {
  const columns = useMemo(() => makeColumns(onIssueClick), [onIssueClick]);
  const flatIssues = useMemo(() => groups.flatMap((g) => g.issues), [groups]);
  const groupedRows = useMemo<GroupedRow[]>(() => {
    const rows: GroupedRow[] = [];
    for (const group of groups) {
      rows.push({ kind: 'group', group });
      for (const issue of group.issues) rows.push({ kind: 'issue', groupId: group.id, issue });
    }
    return rows;
  }, [groups]);

  const table = useReactTable<Issue>({
    data: flatIssues,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const headerGroups = table.getHeaderGroups();
  const issueRowsByKey = new Map(table.getRowModel().rows.map((r) => [r.original.key, r]));

  return (
    <table className="taco-table">
      <thead>
        {headerGroups.map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((h) => (
              <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {groupedRows.map((row) => {
          if (row.kind === 'group') {
            const isCollapsed = collapsedIds.has(row.group.id);
            return (
              <tr
                key={`g:${row.group.id}`}
                className="taco-group-row"
                onClick={() => onToggleGroup(row.group.id)}
                aria-expanded={!isCollapsed}
              >
                <td colSpan={columns.length}>
                  <span className="taco-group-caret" aria-hidden="true">
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                  <span className="taco-group-label">{row.group.label}</span>
                  <span className="taco-group-count">{row.group.issues.length}</span>
                  {isCollapsed && <StatusChips issues={row.group.issues} />}
                </td>
              </tr>
            );
          }
          if (collapsedIds.has(row.groupId)) return null;
          const tableRow = issueRowsByKey.get(row.issue.key);
          if (!tableRow) return null;
          return (
            <tr
              key={`${row.groupId}:${row.issue.key}`}
              className="taco-issue-row"
              onClick={(e) => {
                // Let modifier-clicks fall through to the link defaults (open in
                // a new tab) instead of hijacking them to open the sidebar.
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                onIssueClick(row.issue.key);
              }}
            >
              {tableRow.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={cell.column.columnDef.meta?.className}
                  // Inline-editor cells own their clicks (popovers); don't let
                  // them bubble up and open the detail sidebar.
                  onClick={
                    INTERACTIVE_COLUMNS.has(cell.column.id)
                      ? (e) => e.stopPropagation()
                      : undefined
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const MAX_AVATARS = 6;

function StatusChips({ issues }: { issues: Issue[] }) {
  const breakdown = useMemo(() => buildStatusBreakdown(issues), [issues]);
  const assignees = useMemo(() => uniqueAssignees(issues), [issues]);

  return (
    <span className="taco-group-chips">
      {assignees.length > 0 && (
        <span className="taco-avatar-stack">
          {assignees.slice(0, MAX_AVATARS).map((a) =>
            a.avatarUrl ? (
              <img
                key={a.accountId}
                src={a.avatarUrl}
                alt={a.displayName}
                title={a.displayName}
                className="taco-avatar-mini"
              />
            ) : (
              <span
                key={a.accountId}
                className="taco-avatar-mini taco-avatar-fallback"
                title={a.displayName}
              >
                {a.displayName.charAt(0)}
              </span>
            ),
          )}
          {assignees.length > MAX_AVATARS && (
            <span className="taco-avatar-more" title={`${assignees.length - MAX_AVATARS} more`}>
              +{assignees.length - MAX_AVATARS}
            </span>
          )}
        </span>
      )}
      {breakdown.map((b) => (
        <span className={`taco-status taco-status-chip ${b.category}`} key={b.statusName}>
          {b.statusName}
          <span className="taco-status-chip-count">{b.count}</span>
        </span>
      ))}
    </span>
  );
}
