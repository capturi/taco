import type { Issue } from '../api/types';

export type GroupKey = 'status' | 'epic' | 'assignee';

export type Group = {
  id: string;
  label: string;
  issues: Issue[];
};

export function groupIssues(
  issues: Issue[],
  key: GroupKey,
  statusOrder: string[] = [],
): Group[] {
  // Epic grouping needs to resolve ancestor epics (e.g. a sub-task's epic is its
  // grandparent), so index the result set by key to walk the parent chain.
  const byKey = key === 'epic' ? new Map(issues.map((i) => [i.key, i])) : null;
  const buckets = new Map<string, Group>();
  for (const issue of issues) {
    const { id, label } = bucketFor(issue, key, byKey);
    let group = buckets.get(id);
    if (!group) {
      group = { id, label, issues: [] };
      buckets.set(id, group);
    }
    group.issues.push(issue);
  }
  return [...buckets.values()].sort(
    (a, b) =>
      orderFor(a, key, statusOrder) - orderFor(b, key, statusOrder) ||
      a.label.localeCompare(b.label),
  );
}

// Follows the parent chain through the result set until an issue with an epic is
// found. Only the direct parent carries an epic (set by mapEpic), so issues
// nested deeper inherit it from an ancestor that's present in the same result set.
export function resolveEpic(issue: Issue, byKey: Map<string, Issue>): Issue['epic'] {
  const seen = new Set<string>();
  let current: Issue | undefined = issue;
  while (current && !seen.has(current.key)) {
    if (current.epic) return current.epic;
    seen.add(current.key);
    const parentKey: string | undefined = current.parent?.key;
    current = parentKey ? byKey.get(parentKey) : undefined;
  }
  return null;
}

function bucketFor(
  issue: Issue,
  key: GroupKey,
  byKey: Map<string, Issue> | null,
): { id: string; label: string } {
  switch (key) {
    case 'status':
      return { id: `s:${issue.status.name}`, label: issue.status.name };
    case 'epic': {
      const epic = byKey ? resolveEpic(issue, byKey) : issue.epic;
      return epic
        ? { id: `e:${epic.key}`, label: `${epic.key} — ${epic.summary}` }
        : { id: 'e:none', label: 'No epic' };
    }
    case 'assignee':
      return issue.assignee
        ? { id: `a:${issue.assignee.accountId}`, label: issue.assignee.displayName }
        : { id: 'a:none', label: 'Unassigned' };
  }
}

import { statusRank } from './status';

function orderFor(group: Group, key: GroupKey, statusOrder: string[]): number {
  if (key !== 'status') return 0;
  const name = group.issues[0]?.status.name ?? '';
  // Favorite statuses (configured order) win; statuses not listed fall back to
  // the built-in rank and sort after the favorites.
  if (statusOrder.length > 0) {
    const target = name.trim().toLowerCase();
    const idx = statusOrder.findIndex((s) => s.trim().toLowerCase() === target);
    return idx === -1 ? statusOrder.length : idx;
  }
  return statusRank(name);
}
