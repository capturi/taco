import type { Issue } from '../api/types';

export type GroupKey = 'status' | 'epic' | 'assignee';

export type Group = {
  id: string;
  label: string;
  issues: Issue[];
};

export function groupIssues(issues: Issue[], key: GroupKey): Group[] {
  const buckets = new Map<string, Group>();
  for (const issue of issues) {
    const { id, label } = bucketFor(issue, key);
    let group = buckets.get(id);
    if (!group) {
      group = { id, label, issues: [] };
      buckets.set(id, group);
    }
    group.issues.push(issue);
  }
  return [...buckets.values()].sort((a, b) => orderFor(a, key) - orderFor(b, key) || a.label.localeCompare(b.label));
}

function bucketFor(issue: Issue, key: GroupKey): { id: string; label: string } {
  switch (key) {
    case 'status':
      return { id: `s:${issue.status.name}`, label: issue.status.name };
    case 'epic':
      return issue.epic
        ? { id: `e:${issue.epic.key}`, label: `${issue.epic.key} — ${issue.epic.summary}` }
        : { id: 'e:none', label: 'No epic' };
    case 'assignee':
      return issue.assignee
        ? { id: `a:${issue.assignee.accountId}`, label: issue.assignee.displayName }
        : { id: 'a:none', label: 'Unassigned' };
  }
}

import { statusRank } from './status';

function orderFor(group: Group, key: GroupKey): number {
  if (key !== 'status') return 0;
  return statusRank(group.issues[0]?.status.name ?? '');
}
