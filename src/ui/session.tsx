import { createContext, useContext, type ReactNode } from 'react';
import type { EpicRef, Issue, User } from '../api/types';

type SessionValue = {
  me: User | null;
  assignees: User[];
  statuses: Issue['status'][];
  epics: EpicRef[];
};

const SessionContext = createContext<SessionValue>({
  me: null,
  assignees: [],
  statuses: [],
  epics: [],
});

export function SessionProvider({
  value,
  children,
}: {
  value: SessionValue;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
