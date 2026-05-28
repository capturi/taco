import { useQuery } from '@tanstack/react-query';
import type { ProductDomain } from '../api/types';
import { useConfig } from '../lib/config';
import { getClient } from './cache';

// Product-domain options shown in pickers everywhere (toolbar, create dialog,
// detail editor). Favorites take precedence; the full option list is fetched
// only when no favorites are configured.
export function useProductDomainOptions(): {
  options: ProductDomain[];
  isPending: boolean;
} {
  const { config } = useConfig();
  const client = getClient();
  const query = useQuery({
    queryKey: ['product-domain-options'],
    queryFn: () => client.getProductDomainOptions(),
    staleTime: 60 * 60_000,
    enabled: config.favoriteProductDomains.length === 0,
  });
  if (config.favoriteProductDomains.length > 0) {
    return { options: config.favoriteProductDomains, isPending: false };
  }
  return { options: query.data ?? [], isPending: query.isPending };
}

export function useProjectComponents(projectKey: string) {
  const client = getClient();
  return useQuery({
    queryKey: ['project-components', projectKey],
    queryFn: () => client.getProjectComponents(projectKey),
    staleTime: 60 * 60_000,
  });
}
