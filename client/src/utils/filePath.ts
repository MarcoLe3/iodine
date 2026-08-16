export interface ParsedFilePath {
  /** The path with any trailing :line removed. */
  path: string;
  line?: number;
  /** Lowercase extension of the last segment, when it has one. */
  extension?: string;
}

const PATH_PATTERN = /^(?:[a-zA-Z0-9_@.\-]+\/)+[a-zA-Z0-9_@.\-]+$/;

/** Loose check: no spaces, at least one slash, path-safe characters only. */
export function looksLikePath(text: string): boolean {
  return PATH_PATTERN.test(text);
}

/**
 * Parses a path that may carry a trailing line number, e.g. "server/src/index.ts:15".
 * Returns null for anything that doesn't look like a path. Callers decide whether
 * they also require an extension.
 */
export function parseFilePath(text: string): ParsedFilePath | null {
  // Rules out URLs, which would otherwise parse as a path plus a port number.
  if (text.includes('://')) return null;

  const withLine = /^(.*?):(\d+)$/.exec(text);
  const path = withLine ? withLine[1] : text;
  if (!looksLikePath(path)) return null;

  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return {
    path,
    line: withLine ? Number(withLine[2]) : undefined,
    extension: dot > 0 ? name.slice(dot + 1).toLowerCase() : undefined,
  };
}

/** Resolves a workspace-relative path against the workspace root. Absolute paths pass through. */
export function resolveFromRoot(relativePath: string, workspacePath: string): string {
  const relative = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (/^([A-Za-z]:)?\//.test(relative)) return relative;
  const root = workspacePath.replace(/\\/g, '/').replace(/\/$/, '');
  return `${root}/${relative}`;
}
