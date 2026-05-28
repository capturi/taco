import type { User } from '../api/types';

export function orderWithMeFirst(users: User[], me: User | null): User[] {
  if (!me) return users;
  const rest = users.filter((u) => u.accountId !== me.accountId);
  const meEntry = users.find((u) => u.accountId === me.accountId) ?? me;
  return [meEntry, ...rest];
}
