export type ReaderMode = 'online' | 'local';
export type OnlineApproval = { allowed: boolean; localSessions: string[]; firstAcceptedAt: number };
export const ONLINE_APPROVAL_KEY = 'eva-online-reading-approval-v1';

export function readOnlineApproval(storage?: Pick<Storage, 'getItem'>): OnlineApproval {
  try {
    const value = JSON.parse(storage?.getItem(ONLINE_APPROVAL_KEY) ?? 'null');
    if (value?.allowed === true && Number.isFinite(value.firstAcceptedAt) && value.firstAcceptedAt > 0 && Array.isArray(value.localSessions) && value.localSessions.every((id: unknown) => typeof id === 'string')) {
      return { allowed: true, localSessions: value.localSessions, firstAcceptedAt: value.firstAcceptedAt };
    }
  } catch { /* Unavailable or invalid storage must never imply consent. */ }
  return { allowed: false, localSessions: [], firstAcceptedAt: 0 };
}

export function needsOnlineApproval(approval: OnlineApproval, session: { id: string; date?: string; privateReader?: boolean; messages: readonly { mode?: string }[] }): boolean {
  // Dates and missing metadata are not evidence that a conversation was online.
  const privateOrUnknown = session.privateReader!==false || session.messages.some(message=>message.mode==='local');
  return session.privateReader===true || !approval.allowed || (privateOrUnknown&&!approval.localSessions.includes(session.id));
}

/** The marker belongs to the journal so a GPU crash cannot lose private intent. */
export function withReaderIntent<T extends object>(session: T, mode: ReaderMode): T & { privateReader: boolean } {
  return {...session,privateReader:mode==='local'};
}

export function approveOnlineSession(approval: OnlineApproval, sessionId: string): OnlineApproval {
  return { allowed: true, localSessions: [...new Set([...approval.localSessions, sessionId])].slice(-1_000), firstAcceptedAt: approval.firstAcceptedAt || Date.now() };
}

export function saveOnlineApproval(approval: OnlineApproval, storage?: Pick<Storage, 'setItem'>): boolean {
  try { if (!storage) return false; storage.setItem(ONLINE_APPROVAL_KEY, JSON.stringify(approval)); return true; }
  catch { return false; }
}
