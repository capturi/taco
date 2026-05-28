import { useQuery } from '@tanstack/react-query';
import { getClient } from './cache';

export function DevInfoSection({ issueId }: { issueId: string }) {
  const client = getClient();
  const devQuery = useQuery({
    queryKey: ['dev-info', issueId],
    queryFn: () => client.getDevInfo(issueId),
    staleTime: 60_000,
  });

  if (
    !devQuery.data ||
    (devQuery.data.pullRequests.length === 0 && devQuery.data.branches.length === 0)
  ) {
    return null;
  }

  const { pullRequests, branches } = devQuery.data;

  return (
    <div className="taco-detail-footer">
      <h3>Development</h3>

      {pullRequests.length > 0 && (
        <div className="taco-detail-link-group">
          <h4>Pull requests</h4>
          <ul>
            {pullRequests.map((pr) => (
              <li key={pr.id || pr.url}>
                <span className={`taco-pr-status taco-pr-${pr.status.toLowerCase()}`}>
                  {pr.status}
                </span>
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                  className="taco-summary"
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {pr.title || '(untitled)'}
                </a>
                {pr.sourceBranch && (
                  <span style={{ color: '#5e6c84', fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                    {pr.sourceBranch}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {branches.length > 0 && (
        <div className="taco-detail-link-group">
          <h4>Branches</h4>
          <ul>
            {branches.map((b) => (
              <li key={`${b.repository?.name ?? ''}:${b.name}`}>
                {b.url ? (
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                    className="taco-summary"
                    style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
                  >
                    {b.name}
                  </a>
                ) : (
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
                    {b.name}
                  </span>
                )}
                {b.repository?.name && (
                  <span style={{ color: '#5e6c84', fontSize: 11 }}>{b.repository.name}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
