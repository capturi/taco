import type { Issue } from '../api/types';
import type { CustomFilter } from './config';

export type Filters = {
  assigneeAccountIds: string[]; // empty = all
  currentSprintOnly: boolean;
  text: string;
  // Id of the active saved custom filter, or null. The definition lives in
  // config.customFilters; the active one is resolved and passed to applyFilters.
  // Domain filtering lives here too — there's no standalone domain toggle.
  customFilterId: string | null;
};

export const EMPTY_FILTERS: Filters = {
  assigneeAccountIds: [],
  currentSprintOnly: true,
  text: '',
  customFilterId: null,
};

export function applyFilters(
  issues: Issue[],
  filters: Filters,
  customFilter?: CustomFilter | null,
): Issue[] {
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
    if (filters.currentSprintOnly && i.sprint?.state !== 'active') return false;
    if (customFilter && !matchesCustomFilter(i, customFilter)) return false;
    return true;
  });
}

// A custom filter narrows by each non-empty dimension: assignee/domain/
// components. Values within a dimension are OR'd; dimensions are AND'd.
function matchesCustomFilter(issue: Issue, cf: CustomFilter): boolean {
  if (cf.assigneeAccountIds.length) {
    if (!issue.assignee || !cf.assigneeAccountIds.includes(issue.assignee.accountId)) return false;
  }
  if (cf.productDomainIds.length) {
    if (!issue.productDomain || !cf.productDomainIds.includes(issue.productDomain.id)) return false;
  }
  if (cf.componentIds.length) {
    const ids = new Set(issue.components.map((c) => c.id));
    if (!cf.componentIds.some((id) => ids.has(id))) return false;
  }
  return true;
}
