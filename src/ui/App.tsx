import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EpicRef, Issue, ProductDomain, User } from '../api/types';
import { useConfig } from '../lib/config';
import { applyFilters, EMPTY_FILTERS, type Filters } from '../lib/filter';
import { groupIssues, type GroupKey } from '../lib/groupBy';
import { augmentJqlWithFieldIn, buildDefaultJql } from '../lib/jql';
import { usePersistedState } from '../lib/persistedState';
import { getClient } from './cache';
import { Toolbar } from './Toolbar';
import { OverviewTable } from './OverviewTable';
import { IssueDetail } from './IssueDetail';
import { CreateIssueDialog } from './CreateIssueDialog';
import { SettingsDialog } from './SettingsDialog';
import { CustomFiltersDialog } from './CustomFiltersDialog';
import { SessionProvider } from './session';

export function App({ onClose }: { onClose: () => void }) {
  const client = getClient();
  const qc = useQueryClient();
  const issuesFetching = useIsFetching({ queryKey: ['issues'] }) > 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ['issues'] });
  const { config } = useConfig();
  const [groupKey, setGroupKey] = usePersistedState<GroupKey>('groupKey', 'status');
  const [filters, setFilters] = usePersistedState<Filters>('filters', EMPTY_FILTERS);
  // JQL is fixed in code; the project comes from settings. No longer user-editable.
  const jql = useMemo(() => buildDefaultJql(config.projectKey), [config.projectKey]);
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customFiltersOpen, setCustomFiltersOpen] = useState(false);

  // Resolve the Product Domain custom field id once; used to pre-filter the
  // issue search to favorite domains so we don't fetch the whole project.
  const domainFieldIdQuery = useQuery({
    queryKey: ['product-domain-field-id'],
    queryFn: () => client.getProductDomainFieldId(),
    staleTime: Infinity,
  });

  const effectiveJql = useMemo(() => {
    if (config.favoriteProductDomains.length === 0) return jql;
    if (!domainFieldIdQuery.data) return jql;
    return augmentJqlWithFieldIn(
      jql,
      domainFieldIdQuery.data,
      config.favoriteProductDomains.map((d) => d.id),
    );
  }, [jql, config.favoriteProductDomains, domainFieldIdQuery.data]);

  const issuesQuery = useQuery({
    queryKey: ['issues', effectiveJql],
    queryFn: () => client.searchAll(effectiveJql),
    // If favorites are set we must wait for the field id to land before firing
    // the search — otherwise we'd fetch unfiltered issues for a moment.
    enabled:
      config.favoriteProductDomains.length === 0 || domainFieldIdQuery.data !== undefined,
  });

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => client.currentUser(),
    staleTime: 60 * 60_000,
  });

  const issues = issuesQuery.data ?? EMPTY_ISSUES;
  const me = meQuery.data ?? null;
  const activeCustomFilter = useMemo(
    () => config.customFilters.find((f) => f.id === filters.customFilterId) ?? null,
    [config.customFilters, filters.customFilterId],
  );
  const filtered = useMemo(
    () => applyFilters(issues, filters, activeCustomFilter),
    [issues, filters, activeCustomFilter],
  );
  const groups = useMemo(() => groupIssues(filtered, groupKey), [filtered, groupKey]);

  const derivedAssignees = useMemo(() => collectAssignees(issues), [issues]);
  const derivedProductDomains = useMemo(() => collectProductDomains(issues), [issues]);
  const allAssignees = config.favoriteUsers.length > 0 ? config.favoriteUsers : derivedAssignees;
  const allProductDomains =
    config.favoriteProductDomains.length > 0
      ? config.favoriteProductDomains
      : derivedProductDomains;
  const allStatuses = useMemo(() => collectStatuses(issues), [issues]);
  const allEpics = useMemo(() => collectEpics(issues), [issues]);

  // Memoised so SessionContext consumers (every editor cell in the table) don't
  // re-render on unrelated App state changes like filter clicks or JQL typing.
  const sessionValue = useMemo(
    () => ({ me, assignees: allAssignees, statuses: allStatuses, epics: allEpics }),
    [me, allAssignees, allStatuses, allEpics],
  );

  // Collapsed groups. Groups with status category 'done' are collapsed by default the
  // first time they appear; user toggles override that. Tracked across data refreshes
  // by remembering which group ids we've already applied defaults to.
  const seenGroupIds = useRef(new Set<string>());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const g of groups) {
        if (seenGroupIds.current.has(g.id)) continue;
        seenGroupIds.current.add(g.id);
        if (groupKey === 'status' && g.issues[0]?.status.category === 'done') next.add(g.id);
      }
      return next;
    });
  }, [groups, groupKey]);

  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.id));
  const toggleAllGroups = () => {
    setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.id)));
  };

  const showLoading = issuesQuery.isPending;
  const showError = issuesQuery.isError && !issuesQuery.data;

  return (
    <SessionProvider value={sessionValue}>
    <div className="taco-root" role="dialog" aria-label="Taco overview">
      <div className="taco-panel">
        <Toolbar
          groupKey={groupKey}
          onGroupKeyChange={setGroupKey}
          filters={filters}
          onFiltersChange={setFilters}
          customFilters={config.customFilters}
          onConfigureCustomFilters={() => setCustomFiltersOpen(true)}
          assignees={allAssignees}
          me={me}
          allCollapsed={allCollapsed}
          onToggleAllGroups={toggleAllGroups}
          onCreateClick={() => setCreating(true)}
          onRefresh={refresh}
          isRefreshing={issuesFetching}
          onSettingsClick={() => setSettingsOpen(true)}
          onClose={onClose}
        />

        <div className="taco-body">
          {showLoading && <div className="taco-loading">Loading issues…</div>}
          {showError && (
            <div className="taco-error">
              Failed to load: {issuesQuery.error instanceof Error ? issuesQuery.error.message : String(issuesQuery.error)}
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Make sure you're signed in to Jira in this tab.
              </div>
            </div>
          )}
          {!showLoading && !showError && groups.length === 0 && (
            <div className="taco-empty">No issues match the current filters.</div>
          )}
          {!showLoading && !showError && groups.length > 0 && (
            <OverviewTable
              groups={groups}
              collapsedIds={collapsed}
              onToggleGroup={toggleGroup}
              onIssueClick={setSelectedIssueKey}
            />
          )}
        </div>
      </div>

      {selectedIssueKey && (
        <IssueDetail
          issueKey={selectedIssueKey}
          onClose={() => setSelectedIssueKey(null)}
          onSelectIssue={setSelectedIssueKey}
        />
      )}

      {creating && (
        <CreateIssueDialog
          projectKey={config.projectKey}
          onClose={() => setCreating(false)}
          onCreated={(key) => {
            setCreating(false);
            setSelectedIssueKey(key);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          projectKey={config.projectKey}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {customFiltersOpen && (
        <CustomFiltersDialog
          projectKey={config.projectKey}
          assignees={allAssignees}
          productDomains={allProductDomains}
          me={me}
          onClose={() => setCustomFiltersOpen(false)}
        />
      )}
    </div>
    </SessionProvider>
  );
}

const EMPTY_ISSUES: Issue[] = [];

function collectAssignees(issues: Issue[]): User[] {
  const seen = new Map<string, User>();
  for (const i of issues) {
    if (i.assignee && !seen.has(i.assignee.accountId)) seen.set(i.assignee.accountId, i.assignee);
  }
  return [...seen.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function collectProductDomains(issues: Issue[]): ProductDomain[] {
  const seen = new Map<string, ProductDomain>();
  for (const i of issues) {
    if (i.productDomain && !seen.has(i.productDomain.id))
      seen.set(i.productDomain.id, i.productDomain);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function collectStatuses(issues: Issue[]): Issue['status'][] {
  const seen = new Map<string, Issue['status']>();
  for (const i of issues) {
    if (!seen.has(i.status.name)) seen.set(i.status.name, i.status);
  }
  return [...seen.values()];
}

function collectEpics(issues: Issue[]): EpicRef[] {
  // Only surface epics that have at least one child currently in an active sprint.
  // Used by the create-dialog parent shortcuts so the most relevant epics are upfront.
  const seen = new Map<string, EpicRef>();
  for (const i of issues) {
    if (i.sprint?.state !== 'active') continue;
    if (i.epic && !seen.has(i.epic.key)) seen.set(i.epic.key, i.epic);
  }
  return [...seen.values()].sort((a, b) => a.summary.localeCompare(b.summary));
}
