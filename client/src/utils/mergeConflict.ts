export function hasConflictMarkers(content: string): boolean {
  return content.includes('<<<<<<<') && content.includes('=======') && content.includes('>>>>>>>');
}

export function extractBranchNames(content: string): { ours: string; theirs: string } {
  return {
    ours:   content.match(/^<<<<<<< (.+)$/m)?.[1] ?? 'Ours',
    theirs: content.match(/^>>>>>>> (.+)$/m)?.[1] ?? 'Theirs',
  };
}

/** Full file with every conflict resolved by taking the ours side. */
export function buildOursVersion(content: string): string {
  const out: string[] = [];
  let state: 'normal' | 'ours' | 'theirs' = 'normal';
  for (const line of content.split('\n')) {
    if (line.startsWith('<<<<<<<')) { state = 'ours';   continue; }
    if (line.startsWith('=======')) { state = 'theirs'; continue; }
    if (line.startsWith('>>>>>>>')) { state = 'normal'; continue; }
    if (state !== 'theirs') out.push(line);
  }
  return out.join('\n');
}

/** Full file with every conflict resolved by taking the theirs side. */
export function buildTheirsVersion(content: string): string {
  const out: string[] = [];
  let state: 'normal' | 'ours' | 'theirs' = 'normal';
  for (const line of content.split('\n')) {
    if (line.startsWith('<<<<<<<')) { state = 'ours';   continue; }
    if (line.startsWith('=======')) { state = 'theirs'; continue; }
    if (line.startsWith('>>>>>>>')) { state = 'normal'; continue; }
    if (state !== 'ours') out.push(line);
  }
  return out.join('\n');
}

/** localStorage key for the in-progress result for a given file path. */
export function conflictResultKey(filePath: string): string {
  return `iodine:conflict-result:${filePath}`;
}
