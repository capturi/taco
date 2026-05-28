export const STATUS_NAME_ORDER = [
  'done',
  'in review',
  'waiting for external',
  'in progress',
  'to do',
  'near future',
  'backlog',
];

export function statusRank(name: string): number {
  const idx = STATUS_NAME_ORDER.indexOf(name.trim().toLowerCase());
  return idx === -1 ? STATUS_NAME_ORDER.length : idx;
}
