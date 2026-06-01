import type {
  ADFDocLike,
  Board,
  Component,
  DevBranch,
  DevInfo,
  DevPullRequest,
  Issue,
  IssueDetail,
  IssueLink,
  IssueRef,
  IssueType,
  ProductDomain,
  SearchResult,
  Sprint,
  Transition,
  User,
} from './types';
import type { ADFDoc } from '../lib/adfMarkdown';
import { augmentJqlWithFieldIn } from '../lib/jql';

const FIELDS = [
  'summary',
  'status',
  'assignee',
  'reporter',
  'priority',
  'issuetype',
  'parent',
  'labels',
  'updated',
  'components',
  '*navigable', // pulls all navigable customfields incl. sprint, regardless of id
];

type FieldMeta = {
  id: string;
  name?: string;
  custom?: boolean;
  schema?: { type?: string; custom?: string };
};

export class JiraClient {
  readonly origin: string;
  private fieldsPromise?: Promise<FieldMeta[]>;
  private productDomainFieldIdPromise?: Promise<string | null>;
  private projectBoards = new Map<string, Promise<Board[]>>();
  private boardSprints = new Map<number, Promise<Sprint[]>>();
  private projectEpics = new Map<string, Promise<Array<{ key: string; summary: string; colorKey?: string }>>>();
  private projectStatuses = new Map<string, Promise<Issue['status'][]>>();
  private projectComponents = new Map<string, Promise<Component[]>>();

  constructor(origin: string = window.location.origin) {
    this.origin = origin;
  }

  async getTransitions(issueKey: string): Promise<Transition[]> {
    const res = await fetch(
      `${this.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      { credentials: 'include', headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`getTransitions failed: ${res.status}`);
    const data = await res.json();
    return ((data.transitions ?? []) as Array<{
      id: string;
      name: string;
      to?: { name?: string; statusCategory?: { key?: string } };
    }>).map((t) => ({
      id: t.id,
      name: t.name,
      to: {
        name: t.to?.name ?? '',
        category: mapStatusCategory(t.to?.statusCategory?.key),
      },
    }));
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    const res = await fetch(
      `${this.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ transition: { id: transitionId } }),
      },
    );
    if (!res.ok) throw new Error(`transitionIssue failed: ${res.status} ${res.statusText}`);
  }

  async setAssignee(issueKey: string, accountId: string | null): Promise<void> {
    const res = await fetch(
      `${this.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ accountId }),
      },
    );
    if (!res.ok) throw new Error(`setAssignee failed: ${res.status} ${res.statusText}`);
  }

  async searchUsers(query: string): Promise<User[]> {
    // /user/search is more reliable than /user/picker for avatars — picker's
    // top-level avatarUrl is often missing while avatarUrls is consistent.
    if (!query.trim()) return [];
    const url = new URL(`${this.origin}/rest/api/3/user/search`);
    url.searchParams.set('query', query);
    url.searchParams.set('maxResults', '20');
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`user search failed: ${res.status}`);
    const data = (await res.json()) as Array<{
      accountId: string;
      displayName: string;
      avatarUrls?: Record<string, string>;
    }>;
    return data.map((u) => ({
      accountId: u.accountId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrls?.['24x24'] ?? u.avatarUrls?.['32x32'],
    }));
  }

  async searchAssignableUsers(issueKey: string, query: string): Promise<User[]> {
    const url = new URL(`${this.origin}/rest/api/3/user/assignable/search`);
    url.searchParams.set('issueKey', issueKey);
    if (query) url.searchParams.set('query', query);
    url.searchParams.set('maxResults', '20');
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`assignable search failed: ${res.status}`);
    const data = (await res.json()) as Array<{
      accountId: string;
      displayName: string;
      avatarUrls?: Record<string, string>;
    }>;
    return data.map((u) => ({
      accountId: u.accountId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrls?.['24x24'],
    }));
  }

  getProjectBoards(projectKey: string): Promise<Board[]> {
    let cached = this.projectBoards.get(projectKey);
    if (!cached) {
      cached = (async () => {
        const res = await fetch(
          `${this.origin}/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}`,
          { credentials: 'include', headers: { Accept: 'application/json' } },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as {
          values?: Array<{ id: number; name?: string; type?: string }>;
        };
        return (data.values ?? []).map((b) => ({
          id: b.id,
          name: b.name ?? `Board ${b.id}`,
          type: b.type,
        }));
      })();
      this.projectBoards.set(projectKey, cached);
    }
    return cached;
  }

  getBoardSprints(boardId: number): Promise<Sprint[]> {
    let cached = this.boardSprints.get(boardId);
    if (!cached) {
      cached = (async () => {
        const res = await fetch(
          `${this.origin}/rest/agile/1.0/board/${boardId}/sprint?state=active,future`,
          { credentials: 'include', headers: { Accept: 'application/json' } },
        );
        if (!res.ok) return [];
        const data = await res.json();
        return ((data.values ?? []) as Array<{
          id: number;
          name: string;
          state?: string;
        }>).map((s) => ({
          id: s.id,
          name: s.name,
          state: (s.state ?? 'active') as Sprint['state'],
        }));
      })();
      this.boardSprints.set(boardId, cached);
    }
    return cached;
  }

  async getProjectSprints(projectKey: string): Promise<Sprint[]> {
    const boards = await this.getProjectBoards(projectKey);
    const board = boards.find((b) => b.type === 'scrum') ?? boards[0];
    if (!board) return [];
    return this.getBoardSprints(board.id);
  }

  async getIssueDetail(issueKey: string): Promise<IssueDetail> {
    // '*navigable' brings in custom fields (sprint, product domain, etc.) on top
    // of the explicitly-named ones; 'description', 'issuelinks', 'subtasks' and
    // 'components' aren't always navigable, so list them too to be safe.
    const fields = [
      'summary',
      'status',
      'description',
      'issuelinks',
      'subtasks',
      'assignee',
      'parent',
      'components',
      'comment',
      '*navigable',
    ];
    const [res, productDomainFieldId] = await Promise.all([
      (() => {
        const url = new URL(`${this.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`);
        url.searchParams.set('expand', 'renderedFields');
        url.searchParams.set('fields', fields.join(','));
        return fetch(url, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
      })(),
      this.getProductDomainFieldId(),
    ]);
    if (!res.ok) throw new Error(`getIssueDetail failed: ${res.status}`);
    const data = (await res.json()) as {
      id: string;
      key: string;
      fields: Record<string, unknown> & {
        summary?: string;
        status?: { name?: string; statusCategory?: { key?: string } };
        assignee?: JiraUser | null;
        issuelinks?: unknown[];
        subtasks?: LinkedIssueRef[];
        description?: ADFDocLike | null;
        parent?: { key?: string; fields?: { summary?: string } } | null;
        components?: Array<{ id?: string; name?: string }>;
        comment?: {
          comments?: Array<{
            id?: string;
            author?: JiraUser | null;
            created?: string;
          }>;
        };
      };
      renderedFields?: {
        description?: string;
        comment?: { comments?: Array<{ body?: string }> };
      };
    };
    return {
      id: data.id,
      key: data.key,
      summary: data.fields.summary ?? '',
      status: {
        name: data.fields.status?.name ?? 'Unknown',
        category: mapStatusCategory(data.fields.status?.statusCategory?.key),
      },
      assignee: mapUser(data.fields.assignee ?? null),
      parent: data.fields.parent?.key
        ? {
            key: data.fields.parent.key,
            summary: data.fields.parent.fields?.summary ?? data.fields.parent.key,
          }
        : null,
      sprint: findSprint(data.fields),
      productDomain: productDomainFieldId
        ? extractProductDomain(data.fields[productDomainFieldId])
        : null,
      components: (data.fields.components ?? [])
        .filter((c): c is { id: string; name: string } => !!c.id && !!c.name)
        .map((c) => ({ id: c.id, name: c.name })),
      descriptionHtml: data.renderedFields?.description ?? '',
      descriptionAdf: data.fields.description ?? null,
      links: (data.fields.issuelinks ?? [])
        .map((raw) => mapIssueLink(raw, this.origin))
        .filter((l): l is IssueLink => l !== null),
      subtasks: (data.fields.subtasks ?? []).map((s) => extractLinkedIssue(s, this.origin)),
      comments: mergeComments(
        data.fields.comment?.comments ?? [],
        data.renderedFields?.comment?.comments ?? [],
      ),
      url: `${this.origin}/browse/${data.key}`,
    };
  }

  async addComment(issueKey: string, bodyAdf: ADFDoc): Promise<void> {
    const res = await fetch(
      `${this.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body: bodyAdf }),
      },
    );
    if (!res.ok) throw new Error(`addComment failed: ${res.status} ${res.statusText}`);
  }

  // Jira's "Development" panel uses these undocumented dev-status endpoints. They take
  // the issue's internal numeric id (not the key) and a per-integration application type
  // (GitHub / bitbucket / GitLab / etc). We discover which integrations have data via
  // the summary endpoint, then fetch detail for each in parallel.
  async getDevInfo(issueId: string): Promise<DevInfo> {
    const summaryRes = await fetch(
      `${this.origin}/rest/dev-status/latest/issue/summary?issueId=${encodeURIComponent(issueId)}`,
      { credentials: 'include', headers: { Accept: 'application/json' } },
    );
    if (!summaryRes.ok) return { pullRequests: [], branches: [] };
    const summary = (await summaryRes.json()) as {
      summary?: Record<string, { byInstanceType?: Record<string, unknown> }>;
    };
    const apps = new Set<string>();
    for (const key of ['pullrequest', 'branch']) {
      const byType = summary.summary?.[key]?.byInstanceType ?? {};
      for (const k of Object.keys(byType)) apps.add(k);
    }
    if (apps.size === 0) return { pullRequests: [], branches: [] };

    const appList = [...apps];
    const [prResults, branchResults] = await Promise.all([
      Promise.all(appList.map((app) => this.devDetail(issueId, app, 'pullrequest'))),
      Promise.all(appList.map((app) => this.devDetail(issueId, app, 'branch'))),
    ]);
    return {
      pullRequests: prResults
        .flatMap((r) => (r?.pullRequests ?? []) as Array<Record<string, unknown>>)
        .map(mapPullRequest),
      branches: branchResults
        .flatMap((r) => (r?.branches ?? []) as Array<Record<string, unknown>>)
        .map(mapBranch),
    };
  }

  private async devDetail(
    issueId: string,
    applicationType: string,
    dataType: 'pullrequest' | 'branch',
  ): Promise<Record<string, unknown> | null> {
    const url = new URL(`${this.origin}/rest/dev-status/latest/issue/detail`);
    url.searchParams.set('issueId', issueId);
    url.searchParams.set('applicationType', applicationType);
    url.searchParams.set('dataType', dataType);
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { detail?: Array<Record<string, unknown>> };
    return data.detail?.[0] ?? null;
  }

  async uploadAttachment(
    issueKey: string,
    file: File,
  ): Promise<{ id: string; filename: string; contentUrl: string; mimeType: string }> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(
      `${this.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Atlassian-Token': 'no-check', Accept: 'application/json' },
        body: form,
      },
    );
    if (!res.ok) throw new Error(`uploadAttachment failed: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as Array<{
      id: string;
      filename: string;
      content: string;
      mimeType: string;
    }>;
    if (!data[0]) throw new Error('uploadAttachment returned no entries');
    return {
      id: data[0].id,
      filename: data[0].filename,
      contentUrl: data[0].content,
      mimeType: data[0].mimeType,
    };
  }

  async searchIssuesForPicker(
    query: string,
    projectKey: string,
    productDomainOptionIds: string[] = [],
  ): Promise<Array<{ key: string; summary: string }>> {
    let currentJQL = `project = ${projectKey}`;
    if (productDomainOptionIds.length > 0) {
      const domainFieldId = await this.getProductDomainFieldId();
      if (domainFieldId) {
        currentJQL = augmentJqlWithFieldIn(currentJQL, domainFieldId, productDomainOptionIds);
      }
    }
    const url = new URL(`${this.origin}/rest/api/3/issue/picker`);
    url.searchParams.set('query', query);
    url.searchParams.set('currentJQL', currentJQL);
    url.searchParams.set('showSubTasks', 'false');
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`searchIssuesForPicker failed: ${res.status}`);
    const data = (await res.json()) as {
      sections?: Array<{
        issues?: Array<{ key: string; summaryText?: string; summary?: string }>;
      }>;
    };
    const seen = new Set<string>();
    const out: Array<{ key: string; summary: string }> = [];
    for (const section of data.sections ?? []) {
      for (const issue of section.issues ?? []) {
        if (seen.has(issue.key)) continue;
        seen.add(issue.key);
        out.push({ key: issue.key, summary: issue.summaryText ?? issue.summary ?? '' });
      }
    }
    return out;
  }

  private issueTypesByProject = new Map<string, Promise<IssueType[]>>();

  getIssueTypes(projectKey: string): Promise<IssueType[]> {
    let cached = this.issueTypesByProject.get(projectKey);
    if (!cached) {
      cached = (async () => {
        // Try the legacy createmeta endpoint first — wider compatibility across
        // Cloud instances. Fall back to the newer per-project endpoint if it 404s.
        const legacyUrl = new URL(`${this.origin}/rest/api/3/issue/createmeta`);
        legacyUrl.searchParams.set('projectKeys', projectKey);
        legacyUrl.searchParams.set('expand', 'projects.issuetypes');
        const legacyRes = await fetch(legacyUrl, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (legacyRes.ok) {
          const data = (await legacyRes.json()) as {
            projects?: Array<{
              key?: string;
              issuetypes?: Array<{
                id: string;
                name: string;
                iconUrl?: string;
                subtask?: boolean;
              }>;
            }>;
          };
          const project = data.projects?.find((p) => p.key === projectKey) ?? data.projects?.[0];
          const types = (project?.issuetypes ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            iconUrl: t.iconUrl,
            subtask: !!t.subtask,
          }));
          if (types.length > 0) return types;
        }

        const newRes = await fetch(
          `${this.origin}/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`,
          { credentials: 'include', headers: { Accept: 'application/json' } },
        );
        if (!newRes.ok) {
          throw new Error(`getIssueTypes failed: legacy ${legacyRes.status}, new ${newRes.status}`);
        }
        const data = (await newRes.json()) as {
          values?: Array<{ id: string; name: string; iconUrl?: string; subtask?: boolean }>;
        };
        return (data.values ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          iconUrl: t.iconUrl,
          subtask: !!t.subtask,
        }));
      })();
      this.issueTypesByProject.set(projectKey, cached);
    }
    return cached;
  }

  async createIssue(input: {
    projectKey: string;
    issueTypeName: string;
    summary: string;
    descriptionAdf?: ADFDoc;
    assigneeAccountId?: string | null;
    parentKey?: string | null;
    productDomainOptionId?: string | null;
    componentIds?: string[];
  }): Promise<{ id: string; key: string }> {
    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      issuetype: { name: input.issueTypeName },
      summary: input.summary,
    };
    if (input.descriptionAdf) fields.description = input.descriptionAdf;
    if (input.assigneeAccountId) fields.assignee = { accountId: input.assigneeAccountId };
    if (input.parentKey) fields.parent = { key: input.parentKey };
    if (input.productDomainOptionId) {
      const domainFieldId = await this.getProductDomainFieldId();
      // Product Domain is a multi-select option field — payload must be an array
      // of { id } even when we're only setting one value.
      if (domainFieldId) fields[domainFieldId] = [{ id: input.productDomainOptionId }];
    }
    if (input.componentIds && input.componentIds.length > 0) {
      fields.components = input.componentIds.map((id) => ({ id }));
    }

    const res = await fetch(`${this.origin}/rest/api/3/issue`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`createIssue failed: ${res.status} ${res.statusText} ${body}`);
    }
    const data = (await res.json()) as { id: string; key: string };
    return { id: data.id, key: data.key };
  }

  async setIssueProductDomain(issueKey: string, optionId: string | null): Promise<void> {
    const fieldId = await this.getProductDomainFieldId();
    if (!fieldId) throw new Error('Product Domain field not found on this Jira instance');
    const value = optionId ? [{ id: optionId }] : [];
    const res = await fetch(`${this.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ fields: { [fieldId]: value } }),
    });
    if (!res.ok)
      throw new Error(`setIssueProductDomain failed: ${res.status} ${res.statusText}`);
  }

  async setIssueComponents(issueKey: string, componentIds: string[]): Promise<void> {
    const res = await fetch(`${this.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        fields: { components: componentIds.map((id) => ({ id })) },
      }),
    });
    if (!res.ok)
      throw new Error(`setIssueComponents failed: ${res.status} ${res.statusText}`);
  }

  async setIssueDescription(issueKey: string, descriptionAdf: ADFDoc): Promise<void> {
    const res = await fetch(`${this.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ fields: { description: descriptionAdf } }),
    });
    if (!res.ok) throw new Error(`setIssueDescription failed: ${res.status} ${res.statusText}`);
  }

  async setIssueParent(issueKey: string, parentKey: string | null): Promise<void> {
    const res = await fetch(`${this.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        fields: { parent: parentKey ? { key: parentKey } : null },
      }),
    });
    if (!res.ok) throw new Error(`setIssueParent failed: ${res.status} ${res.statusText}`);
  }

async setIssueSummary(issueKey: string, summary: string): Promise<void> {
    const res = await fetch(`${this.origin}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ fields: { summary } }),
    });
    if (!res.ok) throw new Error(`setIssueSummary failed: ${res.status} ${res.statusText}`);
  }

  getProjectEpics(projectKey: string): Promise<Array<{ key: string; summary: string; colorKey?: string }>> {
    let cached = this.projectEpics.get(projectKey);
    if (!cached) {
      cached = (async () => {
        const boards = await this.getProjectBoards(projectKey);
        const board = boards.find((b) => b.type === 'scrum') ?? boards[0];
        if (!board) return [];
        const epicsRes = await fetch(
          `${this.origin}/rest/agile/1.0/board/${board.id}/epic`,
          { credentials: 'include', headers: { Accept: 'application/json' } },
        );
        if (!epicsRes.ok) return [];
        const data = await epicsRes.json();
        return ((data.values ?? []) as Array<{
          key: string;
          name?: string;
          summary?: string;
          color?: { key?: string };
        }>).map((e) => ({
          key: e.key,
          summary: e.name ?? e.summary ?? '',
          colorKey: e.color?.key,
        }));
      })();
      this.projectEpics.set(projectKey, cached);
    }
    return cached;
  }

  async setIssueSprint(issueKey: string, sprintId: number | null): Promise<void> {
    const url =
      sprintId === null
        ? `${this.origin}/rest/agile/1.0/backlog/issue`
        : `${this.origin}/rest/agile/1.0/sprint/${sprintId}/issue`;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ issues: [issueKey] }),
    });
    if (!res.ok) throw new Error(`setIssueSprint failed: ${res.status} ${res.statusText}`);
  }

  async search(jql: string, pageToken?: string): Promise<SearchResult> {
    const body = {
      jql,
      fields: FIELDS,
      maxResults: 100,
      ...(pageToken ? { nextPageToken: pageToken } : {}),
    };
    // Fire the field-id discovery alongside the search itself — on a cold
    // start the field-id promise costs one extra RTT that doesn't need to
    // block the search POST.
    const [res, productDomainFieldId] = await Promise.all([
      fetch(`${this.origin}/rest/api/3/search/jql`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      }),
      this.getProductDomainFieldId(),
    ]);
    if (!res.ok) {
      throw new Error(`Jira search failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return {
      issues: (data.issues ?? []).map((raw: unknown) =>
        mapIssue(raw, this.origin, productDomainFieldId),
      ),
      total: data.total ?? data.issues?.length ?? 0,
      nextPageToken: data.nextPageToken,
    };
  }

  // All issues whose parent is this one — covers Sub-task type plus regular
  // tasks/stories under an Epic, and any other "parent = X" relationship.
  // Hand-rolled minimal fetch (vs `search()`) since we only need key/summary/
  // status and don't want the full *navigable customfield payload per child.
  async getChildren(issueKey: string): Promise<IssueRef[]> {
    const res = await fetch(`${this.origin}/rest/api/3/search/jql`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        jql: `parent = ${issueKey}`,
        fields: ['summary', 'status'],
        maxResults: 100,
      }),
    });
    if (!res.ok) throw new Error(`getChildren failed: ${res.status}`);
    const data = (await res.json()) as {
      issues?: Array<{
        key: string;
        fields?: {
          summary?: string;
          status?: { name?: string; statusCategory?: { key?: string } };
        };
      }>;
    };
    return (data.issues ?? []).map((i) => ({
      key: i.key,
      summary: i.fields?.summary ?? '',
      status: {
        name: i.fields?.status?.name ?? 'Unknown',
        category: mapStatusCategory(i.fields?.status?.statusCategory?.key),
      },
      url: `${this.origin}/browse/${i.key}`,
    }));
  }

  async searchAll(jql: string, hardCap = 1000): Promise<Issue[]> {
    const out: Issue[] = [];
    let token: string | undefined;
    do {
      const page = await this.search(jql, token);
      out.push(...page.issues);
      token = page.nextPageToken;
    } while (token && out.length < hardCap);
    return out;
  }

  async currentUser(): Promise<User> {
    const res = await fetch(`${this.origin}/rest/api/3/myself`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Jira myself failed: ${res.status}`);
    const u = await res.json();
    return {
      accountId: u.accountId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrls?.['24x24'],
    };
  }

  private getFields(): Promise<FieldMeta[]> {
    if (!this.fieldsPromise) {
      this.fieldsPromise = (async () => {
        const res = await fetch(`${this.origin}/rest/api/3/field`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return [];
        return (await res.json()) as FieldMeta[];
      })().catch(() => []);
    }
    return this.fieldsPromise;
  }

  // The "Product Domain" custom field — a single-select option list. Detected
  // by field name since the customfield_NNNNN id varies per Jira instance.
  getProductDomainFieldId(): Promise<string | null> {
    if (!this.productDomainFieldIdPromise) {
      this.productDomainFieldIdPromise = this.getFields().then((fields) => {
        const byName = fields.find(
          (f) => f.custom && f.name && /^product\s*domain$/i.test(f.name),
        );
        if (byName) return byName.id;
        // Looser fallback for variant naming ("Domain", "Product Area").
        const looseMatch = fields.find(
          (f) => f.custom && f.name && /(product\s*domain|product\s*area|^domain$)/i.test(f.name),
        );
        return looseMatch?.id ?? null;
      });
    }
    return this.productDomainFieldIdPromise;
  }

  getProjectComponents(projectKey: string): Promise<Component[]> {
    let cached = this.projectComponents.get(projectKey);
    if (!cached) {
      cached = (async () => {
        const res = await fetch(
          `${this.origin}/rest/api/3/project/${encodeURIComponent(projectKey)}/components`,
          { credentials: 'include', headers: { Accept: 'application/json' } },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as Array<{ id: string; name?: string }>;
        return data
          .map((c) => ({ id: c.id, name: c.name ?? '' }))
          .filter((c) => c.name.length > 0);
      })();
      this.projectComponents.set(projectKey, cached);
    }
    return cached;
  }

  getProjectStatuses(projectKey: string): Promise<Issue['status'][]> {
    let cached = this.projectStatuses.get(projectKey);
    if (!cached) {
      cached = (async () => {
        const res = await fetch(
          `${this.origin}/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`,
          { credentials: 'include', headers: { Accept: 'application/json' } },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as Array<{
          statuses?: Array<{
            name?: string;
            statusCategory?: { key?: string };
          }>;
        }>;
        const seen = new Map<string, Issue['status']>();
        for (const issueType of data) {
          for (const s of issueType.statuses ?? []) {
            const name = s.name?.trim();
            if (!name || seen.has(name.toLowerCase())) continue;
            seen.set(name.toLowerCase(), {
              name,
              category: mapStatusCategory(s.statusCategory?.key),
            });
          }
        }
        return [...seen.values()];
      })();
      this.projectStatuses.set(projectKey, cached);
    }
    return cached;
  }

  // Returns every allowed option for the Product Domain field, unioned across
  // its field contexts (different projects can have different option sets, but
  // we don't try to project-scope here — settings is global). Disabled options
  // are excluded since they're hidden from new issues. Pagination is capped at
  // 1000 per context; if any instance grows beyond that we'll need to loop.
  async getProductDomainOptions(): Promise<ProductDomain[]> {
    const fieldId = await this.getProductDomainFieldId();
    if (!fieldId) return [];

    const contextsRes = await fetch(
      `${this.origin}/rest/api/3/field/${encodeURIComponent(fieldId)}/context?maxResults=100`,
      { credentials: 'include', headers: { Accept: 'application/json' } },
    );
    if (!contextsRes.ok) return [];
    const contextsData = (await contextsRes.json()) as {
      values?: Array<{ id: string }>;
    };
    const contexts = contextsData.values ?? [];
    if (contexts.length === 0) return [];

    const optionsByContext = await Promise.all(
      contexts.map(async (ctx) => {
        const url = new URL(
          `${this.origin}/rest/api/3/field/${encodeURIComponent(fieldId)}/context/${encodeURIComponent(ctx.id)}/option`,
        );
        url.searchParams.set('maxResults', '1000');
        const res = await fetch(url, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return [] as Array<{ id: string; value: string; disabled?: boolean }>;
        const data = (await res.json()) as {
          values?: Array<{ id: string; value: string; disabled?: boolean }>;
        };
        return (data.values ?? []).filter((o) => !o.disabled);
      }),
    );

    const seen = new Map<string, ProductDomain>();
    for (const opts of optionsByContext) {
      for (const o of opts) {
        if (!seen.has(o.id)) seen.set(o.id, { id: o.id, name: o.value });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

function mapIssue(
  raw: unknown,
  origin: string,
  productDomainFieldId: string | null,
): Issue {
  const r = raw as {
    key: string;
    fields: Record<string, unknown> & {
      summary?: string;
      status?: { name?: string; statusCategory?: { key?: string } };
      assignee?: JiraUser | null;
      reporter?: JiraUser | null;
      priority?: { name?: string; iconUrl?: string } | null;
      issuetype?: { name?: string; iconUrl?: string };
      parent?: { key?: string; fields?: { summary?: string; issuetype?: { name?: string } } };
      labels?: string[];
      updated?: string;
      components?: Array<{ id?: string; name?: string }>;
    };
  };
  const f = r.fields;
  return {
    key: r.key,
    summary: f.summary ?? '',
    status: {
      name: f.status?.name ?? 'Unknown',
      category: mapStatusCategory(f.status?.statusCategory?.key),
    },
    assignee: mapUser(f.assignee ?? null),
    reporter: mapUser(f.reporter ?? null),
    priority: f.priority ? { name: f.priority.name ?? '', iconUrl: f.priority.iconUrl } : null,
    issueType: { name: f.issuetype?.name ?? '', iconUrl: f.issuetype?.iconUrl },
    parent: f.parent?.key
      ? { key: f.parent.key, summary: f.parent.fields?.summary ?? f.parent.key }
      : null,
    epic: mapEpic(f.parent),
    sprint: findSprint(f),
    productDomain: productDomainFieldId ? extractProductDomain(f[productDomainFieldId]) : null,
    components: (f.components ?? [])
      .filter((c): c is { id: string; name?: string } => typeof c?.id === 'string')
      .map((c) => ({ id: c.id, name: c.name ?? '' })),
    labels: f.labels ?? [],
    updated: f.updated ?? '',
    url: `${origin}/browse/${r.key}`,
  };
}

type JiraUser = {
  accountId?: string;
  displayName?: string;
  avatarUrls?: Record<string, string>;
} | null;

function mapUser(u: JiraUser): User | null {
  if (!u || !u.accountId) return null;
  return {
    accountId: u.accountId,
    displayName: u.displayName ?? '(unknown)',
    avatarUrl: u.avatarUrls?.['24x24'],
  };
}

function mapEpic(parent: { key?: string; fields?: { summary?: string; issuetype?: { name?: string } } } | undefined) {
  if (!parent || !parent.key) return null;
  // Jira sometimes parents non-Epic issues (subtasks under tasks). Only treat Epic-typed parents as epics.
  const typeName = parent.fields?.issuetype?.name?.toLowerCase();
  if (typeName && typeName !== 'epic') return null;
  return { key: parent.key, summary: parent.fields?.summary ?? parent.key };
}

function findSprint(fields: Record<string, unknown>): Sprint | null {
  // Jira Cloud's sprint custom-field id varies per instance (commonly customfield_10020,
  // but not always). Scan custom fields for an array of sprint-shaped objects instead of
  // hard-coding an id.
  for (const key of Object.keys(fields)) {
    if (!key.startsWith('customfield_')) continue;
    const value = fields[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    const sample = value[0] as Record<string, unknown> | null;
    if (!sample || typeof sample !== 'object') continue;
    if (typeof sample.id !== 'number' || typeof sample.name !== 'string') continue;
    if (typeof sample.state !== 'string' || !['active', 'closed', 'future'].includes(sample.state)) continue;

    const sprints = value as Array<{ id: number; name: string; state: Sprint['state'] }>;
    const active = sprints.find((s) => s.state === 'active');
    const pick = active ?? sprints[sprints.length - 1];
    return { id: pick.id, name: pick.name, state: pick.state };
  }
  return null;
}

function mergeComments(
  raw: Array<{ id?: string; author?: JiraUser | null; created?: string }>,
  rendered: Array<{ body?: string }>,
): import('./types').IssueComment[] {
  // Raw and rendered comments come in the same order, so zip them; the
  // rendered body is HTML, which we feed straight to dangerouslySetInnerHTML
  // the same way descriptionHtml is rendered.
  return raw
    .map((c, i) => ({
      id: c.id ?? '',
      author: mapUser(c.author ?? null),
      bodyHtml: rendered[i]?.body ?? '',
      created: c.created ?? '',
    }))
    .filter((c) => c.id);
}

function extractProductDomain(value: unknown): ProductDomain | null {
  // Single-select option fields come back as { id, value, self }. Multi-select
  // arrives as an array; we surface the first entry. Bare strings (rare) are
  // treated as both id and name.
  if (value == null) return null;
  if (typeof value === 'string') return { id: value, name: value };
  if (Array.isArray(value)) {
    return value.length > 0 ? extractProductDomain(value[0]) : null;
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const id =
      (typeof v.id === 'string' && v.id) ||
      (typeof v.id === 'number' && String(v.id)) ||
      (typeof v.value === 'string' && v.value) ||
      null;
    if (!id) return null;
    const name =
      (typeof v.value === 'string' && v.value) ||
      (typeof v.name === 'string' && v.name) ||
      id;
    return { id, name };
  }
  return null;
}

function mapIssueLink(raw: unknown, origin: string): IssueLink | null {
  const r = raw as {
    id: string;
    type?: { inward?: string; outward?: string };
    inwardIssue?: LinkedIssueRef;
    outwardIssue?: LinkedIssueRef;
  };
  if (r.outwardIssue) {
    return {
      id: r.id,
      direction: 'outward',
      relation: r.type?.outward ?? 'relates to',
      target: extractLinkedIssue(r.outwardIssue, origin),
    };
  }
  if (r.inwardIssue) {
    return {
      id: r.id,
      direction: 'inward',
      relation: r.type?.inward ?? 'relates to',
      target: extractLinkedIssue(r.inwardIssue, origin),
    };
  }
  return null;
}

type LinkedIssueRef = {
  key: string;
  fields?: {
    summary?: string;
    status?: { name?: string; statusCategory?: { key?: string } };
  };
};

function extractLinkedIssue(li: LinkedIssueRef, origin: string): IssueRef {
  return {
    key: li.key,
    summary: li.fields?.summary ?? '',
    status: {
      name: li.fields?.status?.name ?? 'Unknown',
      category: mapStatusCategory(li.fields?.status?.statusCategory?.key),
    },
    url: `${origin}/browse/${li.key}`,
  };
}

function mapPullRequest(raw: Record<string, unknown>): DevPullRequest {
  const r = raw as {
    id?: string;
    name?: string;
    url?: string;
    status?: string;
    source?: { branch?: string };
    destination?: { branch?: string };
    author?: { name?: string; avatar?: string };
  };
  return {
    id: r.id ?? '',
    title: r.name ?? '',
    url: r.url ?? '',
    status: r.status ?? '',
    sourceBranch: r.source?.branch,
    destinationBranch: r.destination?.branch,
    author: r.author?.name ? { name: r.author.name, avatar: r.author.avatar } : undefined,
  };
}

function mapBranch(raw: Record<string, unknown>): DevBranch {
  const r = raw as {
    name?: string;
    url?: string;
    repository?: { name?: string; url?: string };
  };
  return {
    name: r.name ?? '',
    url: r.url,
    repository: r.repository?.name
      ? { name: r.repository.name, url: r.repository.url }
      : undefined,
  };
}

function mapStatusCategory(key: string | undefined): Issue['status']['category'] {
  switch (key) {
    case 'new':
    case 'undefined':
      return 'todo';
    case 'indeterminate':
      return 'in-progress';
    case 'done':
      return 'done';
    default:
      return 'unknown';
  }
}
