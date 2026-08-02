import type { FileNode, WorkspaceInfo } from '../types';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return data as T;
}

export async function openWorkspace(path: string): Promise<WorkspaceInfo> {
  return request<WorkspaceInfo>('/api/workspace/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}

export async function getWorkspace(): Promise<WorkspaceInfo> {
  return request<WorkspaceInfo>('/api/workspace');
}

export async function findWorkspace(name: string): Promise<WorkspaceInfo> {
  return request<WorkspaceInfo>('/api/workspace/find', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function fetchFileTree(): Promise<FileNode> {
  const data = await request<{ tree: FileNode }>('/api/files/tree');
  return data.tree;
}

export async function fetchFileContent(path: string): Promise<string> {
  const data = await request<{ content: string }>(`/api/files/content?path=${encodeURIComponent(path)}`);
  return data.content;
}

export async function deleteNode(nodePath: string): Promise<void> {
  await request(`/api/files?path=${encodeURIComponent(nodePath)}`, { method: 'DELETE' });
}

export async function createNode(nodePath: string, type: 'file' | 'directory'): Promise<void> {
  await request('/api/files/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: nodePath, type }),
  });
}

export async function closeWorkspace(): Promise<void> {
  await request('/api/workspace/close', { method: 'POST' });
}

export async function renameNode(oldPath: string, newName: string): Promise<{ newPath: string }> {
  return request<{ newPath: string }>('/api/files/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newName }),
  });
}

export async function putFileContent(path: string, content: string): Promise<void> {
  await request('/api/files/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
}

/** Returns the URL to stream an image file from the server. */
export function getImageUrl(path: string): string {
  return `${API_BASE}/api/files/image?path=${encodeURIComponent(path)}`;
}

/** Returns the URL to stream a PDF file from the server. */
export function getPdfUrl(path: string): string {
  return `${API_BASE}/api/files/pdf?path=${encodeURIComponent(path)}`;
}

/**
 * One contiguous change: the working-copy range `[startLine, startLine + lineCount)`
 * replaces `originalLines` (the committed text).
 *
 * - `added`    → `originalLines` is empty
 * - `deleted`  → `lineCount` is 0; `startLine` is the line the removed text used
 *                to follow (0 when it was the top of the file)
 * - `modified` → both sides non-empty, and they need not be the same length
 */
export type DiffHunk = {
  startLine: number;
  lineCount: number;
  originalLines: string[];
  type: 'added' | 'modified' | 'deleted';
};
export type DiffData = { hunks: DiffHunk[] };

export async function fetchFileDiff(filePath: string): Promise<DiffData> {
  return request<DiffData>(`/api/git/diff?path=${encodeURIComponent(filePath)}`);
}

/** Diff the provided in-memory content against HEAD without requiring a disk save. */
export async function fetchFileDiffWithContent(filePath: string, content: string): Promise<DiffData> {
  return request<DiffData>('/api/git/diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
}

/** Overall unstaged diff across the whole workspace, for proactive help detection. */
export async function fetchOverallDiff(): Promise<{ diff: string; lineCount: number }> {
  return request<{ diff: string; lineCount: number }>('/api/git/diff/all');
}

/** Ask the LLM to rephrase a canned proactive message out-of-band.
 *  Falls back to the original message on any error. */
export async function rephraseProactiveMessage(
  message: string,
  provider: string,
  model: string,
): Promise<string> {
  try {
    const result = await request<{ rephrased: string }>('/api/proactive/rephrase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, provider, model }),
    });
    return result.rephrased || message;
  } catch {
    return message;
  }
}

export type GitFileStatus = 'unstaged' | 'staged' | 'both';

export async function fetchGitStatus(): Promise<Record<string, GitFileStatus>> {
  const data = await request<{ status: Record<string, GitFileStatus> }>('/api/git/status');
  return data.status;
}

export type ChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '??';
export interface GitChange { path: string; relPath: string; status: ChangeStatus; }
export interface GitChanges { branch: string; staged: GitChange[]; unstaged: GitChange[]; }

export async function fetchGitChanges(): Promise<GitChanges> {
  return request<GitChanges>('/api/git/changes');
}

export async function stageFile(relPath: string): Promise<void> {
  await request('/api/git/stage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relPath }),
  });
}

export async function unstageFile(relPath: string): Promise<void> {
  await request('/api/git/unstage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relPath }),
  });
}

export async function stageAll(): Promise<void> {
  await request('/api/git/stage-all', { method: 'POST' });
}

export async function discardFile(relPath: string, isUntracked: boolean): Promise<void> {
  await request('/api/git/discard', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relPath, isUntracked }),
  });
}

export async function commitChanges(message: string): Promise<void> {
  await request('/api/git/commit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  parentHashes: string[];
  message: string;
  author: string;
  relativeDate: string;
  refs: string[];   // e.g. ['HEAD', 'main', 'origin/main']
}

export interface GitBranchInfo {
  name: string;
  shortHash: string;
  isCurrent: boolean;
  upstream: string | null;
}

export interface GitBranches {
  local: GitBranchInfo[];
  remote: { name: string; shortHash: string }[];
}

export async function fetchGitLog(): Promise<GitCommit[]> {
  const data = await request<{ commits: GitCommit[] }>('/api/git/log');
  return data.commits;
}

export async function fetchGitBranches(): Promise<GitBranches> {
  return request<GitBranches>('/api/git/branches');
}

export async function checkoutBranch(branch: string, detach = false): Promise<void> {
  await request('/api/git/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch, detach }),
  });
}

export async function stashChanges(): Promise<void> {
  await request('/api/git/stash', { method: 'POST' });
}

export async function pushBranch(): Promise<void> {
  await request('/api/git/push', { method: 'POST' });
}

export async function pullBranch(): Promise<{ ok: boolean; status: string; message?: string; error?: string }> {
  return request<{ ok: boolean; status: string; message?: string; error?: string }>('/api/git/pull', { method: 'POST' });
}

export interface RefGithubUrl {
  githubUrl: string | null;
  refName: string | null;
}

export async function fetchRefGithubUrl(ref: string): Promise<RefGithubUrl> {
  return request<RefGithubUrl>(`/api/git/ref-url?ref=${encodeURIComponent(ref)}`);
}

export interface GraphFileRef {
  path: string;       // workspace-relative or absolute path
  line?: number;      // 1-based start line
  endLine?: number;   // 1-based end line (inclusive)
  label?: string;     // short description shown in the drawer
}

export interface GraphNode {
  id: string;
  name: string;
  subname?: string;
  color?: string;
  layer?: number;  // 0=clients, 1=gateways, 2=services, 3=data, 4=external
  x?: number;
  y?: number;
  files?: GraphFileRef[];
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'directed' | 'bidirectional' | 'undirected';
  label?: string;
  files?: GraphFileRef[];
}

export interface SystemGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function fetchSystemGraph(): Promise<SystemGraph | null> {
  const data = await request<{ graph: SystemGraph | null }>('/api/system-graph');
  return data.graph;
}

export async function putSystemGraph(graph: SystemGraph): Promise<void> {
  await request('/api/system-graph', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph }),
  });
}

/** Download the current workspace's ~/.iodine/<md5>/ cache as a zip file. */
export async function downloadProjectMetadata(): Promise<void> {
  const res = await fetch('/api/project/metadata/download');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Download failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cd = res.headers.get('Content-Disposition') ?? '';
  const match = cd.match(/filename="([^"]+)"/);
  a.download = match?.[1] ?? 'iodine-metadata.zip';
  a.click();
  URL.revokeObjectURL(url);
}

/** Delete the entire ~/.iodine/<md5>/ cache directory for the current workspace. */
export async function clearProjectMetadata(): Promise<void> {
  await request('/api/project/metadata', { method: 'DELETE' });
}

/** Upload a metadata zip and extract it into the current workspace's cache directory. */
export async function importProjectMetadata(file: File): Promise<void> {
  const res = await fetch('/api/project/metadata/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Import failed');
  }
}
