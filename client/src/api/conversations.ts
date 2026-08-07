import type { UIMessage, HistoryMessage } from '../types';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export interface ConversationRecord {
  id: string;
  timestamp: number;
  history: HistoryMessage[];
  uiMessages: UIMessage[];
}

export async function fetchConversations(workspacePath: string): Promise<ConversationRecord[]> {
  const res = await fetch(`${API_BASE}/api/conversations?workspacePath=${encodeURIComponent(workspacePath)}`);
  if (!res.ok) return [];
  return res.json();
}

export async function saveConversation(workspacePath: string, conv: ConversationRecord): Promise<void> {
  await fetch(`${API_BASE}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspacePath, ...conv }),
  });
}

export async function clearConversations(workspacePath: string): Promise<void> {
  await fetch(`${API_BASE}/api/conversations?workspacePath=${encodeURIComponent(workspacePath)}`, {
    method: 'DELETE',
  });
}
