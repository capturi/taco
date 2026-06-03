import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Component, Issue, IssueDetail, ProductDomain, Sprint, User } from '../api/types';
import type { ADFDoc } from '../lib/adfMarkdown';
import { getClient } from './cache';

export function useIssueMutations() {
  const qc = useQueryClient();
  const client = getClient();

  const patch = (key: string, patch: Partial<Issue> & Partial<IssueDetail>) => {
    qc.setQueriesData<Issue[]>({ queryKey: ['issues'] }, (old) =>
      old?.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    );
    qc.setQueryData<IssueDetail>(['issue-detail', key], (old) =>
      old ? { ...old, ...patch } : old,
    );
  };

  const transition = useMutation({
    mutationFn: ({ key, transitionId }: {
      key: string;
      transitionId: string;
      newStatus: Issue['status'];
    }) => client.transitionIssue(key, transitionId),
    onMutate: ({ key, newStatus }) => patch(key, { status: newStatus }),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['issue-detail', vars.key] });
    },
  });

  const setAssignee = useMutation({
    mutationFn: ({ key, accountId }: {
      key: string;
      accountId: string | null;
      newAssignee: User | null;
    }) => client.setAssignee(key, accountId),
    onMutate: ({ key, newAssignee }) => patch(key, { assignee: newAssignee }),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['issue-detail', vars.key] });
    },
  });

  const setSprint = useMutation({
    mutationFn: ({ key, sprintId }: {
      key: string;
      sprintId: number | null;
      newSprint: Sprint | null;
    }) => client.setIssueSprint(key, sprintId),
    onMutate: ({ key, newSprint }) => patch(key, { sprint: newSprint }),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['issue-detail', vars.key] });
    },
  });

  const setSummary = useMutation({
    mutationFn: ({ key, summary }: { key: string; summary: string }) =>
      client.setIssueSummary(key, summary),
    onMutate: ({ key, summary }) => patch(key, { summary }),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['issue-detail', vars.key] });
    },
  });

  const setProductDomain = useMutation({
    mutationFn: ({ key, optionIds }: {
      key: string;
      optionIds: string[];
      newProductDomains: ProductDomain[];
    }) => client.setIssueProductDomain(key, optionIds),
    onMutate: ({ key, newProductDomains }) => patch(key, { productDomains: newProductDomains }),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['issue-detail', vars.key] });
    },
  });

  const setComponents = useMutation({
    mutationFn: ({ key, componentIds }: {
      key: string;
      componentIds: string[];
      newComponents: Component[];
    }) => client.setIssueComponents(key, componentIds),
    onMutate: ({ key, newComponents }) => patch(key, { components: newComponents }),
    // No ['issues'] invalidation — components aren't on the Issue table shape,
    // so the table doesn't need a refresh.
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['issue-detail', vars.key] });
    },
  });

  const setParent = useMutation({
    mutationFn: ({ key, parentKey }: {
      key: string;
      parentKey: string | null;
      newParent: { key: string; summary: string } | null;
    }) => client.setIssueParent(key, parentKey),
    onMutate: ({ key, newParent }) => patch(key, { parent: newParent }),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['issue-detail', vars.key] });
    },
  });

  const setDescription = useMutation({
    mutationFn: ({ key, adf }: { key: string; adf: ADFDoc; previewHtml: string }) =>
      client.setIssueDescription(key, adf),
    onMutate: ({ key, adf, previewHtml }) =>
      patch(key, { descriptionAdf: adf, descriptionHtml: previewHtml }),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['issue-detail', vars.key] });
    },
  });

  const addComment = useMutation({
    mutationFn: ({ key, adf }: { key: string; adf: ADFDoc }) => client.addComment(key, adf),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['issue-detail', vars.key] });
    },
  });

  return {
    transition,
    setAssignee,
    setSprint,
    setSummary,
    setProductDomain,
    setComponents,
    setParent,
    setDescription,
    addComment,
  };
}
