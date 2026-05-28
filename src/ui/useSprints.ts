import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../lib/config';
import { getClient } from './cache';

export function useSprints(projectKey: string) {
  const { config } = useConfig();
  const client = getClient();
  const boardId = config.sprintBoardId;
  return useQuery({
    queryKey: boardId ? ['board-sprints', boardId] : ['project-sprints', projectKey],
    queryFn: () =>
      boardId ? client.getBoardSprints(boardId) : client.getProjectSprints(projectKey),
    staleTime: 5 * 60_000,
  });
}
