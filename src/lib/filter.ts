import type { Issue } from '../api/types';

export type Filters = {
  assigneeAccountIds: string[]; // empty = all
  productDomainId: string | null;
  currentSprintOnly: boolean;
  text: string;
};

export const EMPTY_FILTERS: Filters = {
  assigneeAccountIds: [],
  productDomainId: null,
  currentSprintOnly: true,
  text: '',
};

export function applyFilters(issues: Issue[], filters: Filters): Issue[] {
  const text = filters.text.trim().toLowerCase();
  // Text search bypasses the toolbar filters — when the user types, they want
  // to find the issue regardless of the current sprint / assignee / domain
  // narrowing.
  if (text) {
    return issues.filter((i) => {
      const hay = `${i.key} ${i.summary} ${i.assignee?.displayName ?? ''} ${i.epic?.summary ?? ''} ${i.productDomain?.name ?? ''}`.toLowerCase();
      return hay.includes(text);
    });
  }

  const assigneeSet = filters.assigneeAccountIds.length ? new Set(filters.assigneeAccountIds) : null;
  return issues.filter((i) => {
    if (assigneeSet && (!i.assignee || !assigneeSet.has(i.assignee.accountId))) return false;
    if (filters.productDomainId && i.productDomain?.id !== filters.productDomainId) return false;
    if (filters.currentSprintOnly && i.sprint?.state !== 'active') return false;
    return true;
  });
}
