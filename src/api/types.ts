export type Issue = {
  key: string;
  summary: string;
  status: { name: string; category: 'todo' | 'in-progress' | 'done' | 'unknown' };
  assignee: User | null;
  reporter: User | null;
  priority: { name: string; iconUrl?: string } | null;
  issueType: { name: string; iconUrl?: string };
  parent: { key: string; summary: string } | null;
  epic: EpicRef | null;
  sprint: Sprint | null;
  productDomain: ProductDomain | null;
  components: Component[];
  labels: string[];
  updated: string;
  url: string;
};

export type ProductDomain = {
  id: string;
  name: string;
};

export type Component = {
  id: string;
  name: string;
};

export type Transition = {
  id: string;
  name: string;
  to: {
    name: string;
    category: 'todo' | 'in-progress' | 'done' | 'unknown';
  };
};

export type IssueType = {
  id: string;
  name: string;
  iconUrl?: string;
  subtask: boolean;
};

export type IssueDetail = {
  id: string;
  key: string;
  summary: string;
  status: { name: string; category: 'todo' | 'in-progress' | 'done' | 'unknown' };
  assignee: User | null;
  parent: { key: string; summary: string } | null;
  sprint: Sprint | null;
  productDomain: ProductDomain | null;
  components: Component[];
  descriptionHtml: string;
  descriptionAdf: ADFDocLike | null;
  links: IssueLink[];
  subtasks: IssueRef[];
  comments: IssueComment[];
  url: string;
};

export type IssueComment = {
  id: string;
  author: User | null;
  bodyHtml: string;
  created: string;
};

// Loose ADF shape — actual structure validated by the converter in lib/adfMarkdown.
export type ADFDocLike = {
  type: 'doc';
  version?: number;
  content?: unknown[];
} & Record<string, unknown>;

export type DevInfo = {
  pullRequests: DevPullRequest[];
  branches: DevBranch[];
};

export type DevPullRequest = {
  id: string;
  title: string;
  url: string;
  status: string; // OPEN | MERGED | DECLINED | ...
  sourceBranch?: string;
  destinationBranch?: string;
  author?: { name: string; avatar?: string };
};

export type DevBranch = {
  name: string;
  url?: string;
  repository?: { name: string; url?: string };
};

export type IssueRef = {
  key: string;
  summary: string;
  status: { name: string; category: 'todo' | 'in-progress' | 'done' | 'unknown' };
  url: string;
};

export type IssueLink = {
  id: string;
  direction: 'inward' | 'outward';
  relation: string;
  target: IssueRef;
};

export type User = {
  accountId: string;
  displayName: string;
  avatarUrl?: string;
};

export type EpicRef = {
  key: string;
  summary: string;
};

export type Sprint = {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
};

export type Board = {
  id: number;
  name: string;
  type?: string; // 'scrum' | 'kanban' | ...
};

export type SearchResult = {
  issues: Issue[];
  total: number;
  nextPageToken?: string;
};
