// Structured actions parsed from the LLM's function calls. Each is rendered into
// a confirm card by the Telegram layer and, on confirm, persisted via SitesService.
export type PendingAction =
  | {
      type: 'work';
      description: string;
      workDate?: string;
      source: 'voice' | 'manual' | 'photo';
    }
  | { type: 'material'; name: string; quantity: number; unit?: string }
  | { type: 'plan'; note: string; forDate?: string };

export interface ParsedToolCalls {
  /** Fuzzy site name the foreman asked to switch to, if any. */
  setActiveSiteName?: string;
  /** Journal write-actions awaiting confirmation. */
  actions: PendingAction[];
}

export interface ChatContext {
  accountId: string;
  userId: string;
  language: string;
  activeSiteId: string | null;
  activeSiteName: string | null;
  sites: { id: string; name: string }[];
}

export type ChatResult =
  // Foreman asked to switch active site (applied immediately by the caller).
  | { kind: 'set_active_site'; siteId: string; siteName: string }
  // No site name matched — caller prompts the foreman to pick/create one.
  | { kind: 'unknown_site'; requested: string }
  // Write-actions parsed and awaiting confirmation. `threadId` resumes the
  // paused LangGraph run (the checkpointer holds the pending actions).
  | { kind: 'confirm'; threadId: string; actions: PendingAction[]; siteId: string; siteName: string }
  // A log action came in but no active site is set.
  | { kind: 'need_active_site' }
  // Plain conversational reply (no actionable intent).
  | { kind: 'reply'; text: string };

/** Result of resuming a paused capture graph after the foreman confirms/rejects. */
export interface ResumeResult {
  saved: boolean;
  siteId: string | null;
  siteName: string;
}
