import { fetchOverallDiff } from '../api/files';
import type { ProactiveSignal, SignalSnapshot } from '../hooks/useProactiveHelp';
import { IDLE_CHURN_MESSAGES } from '../prompts/proactiveHelp';

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Minimum recorded actions before the churn signal can fire. */
const MIN_ACTIONS = 30;

/**
 * Maximum ratio of diff-line change to actions before the user is considered stuck.
 * e.g. 0.15 means fewer than 1 diff-line change per ~7 actions → struggling.
 */
const MAX_DIFF_RATIO = 0.15;

/** Hard minimum diff-line delta floor, regardless of action count. */
const MIN_DIFF_DELTA = 3;

// ── Idle-churn signal factory ─────────────────────────────────────────────────

interface IdleChurnOptions {
  /** Returns the currently open workspace path (read at context-collection time). */
  getWorkspacePath: () => string | null;
  /** Returns the currently active file path (read at context-collection time). */
  getActiveFilePath: () => string | null;
}

/**
 * Fires when the user has made many edits but the net change in the git diff
 * remains small — a useful indicator of churning in place rather than making
 * forward progress.
 *
 * Add more signals following the same factory pattern and register them in
 * WorkbenchLayout alongside this one.
 */
export function createIdleChurnSignal(options: IdleChurnOptions): ProactiveSignal {
  return {
    type: 'idle_churn',
    messages: IDLE_CHURN_MESSAGES,

    shouldFire({ actionCount, diffLineDelta }: SignalSnapshot): boolean {
      if (actionCount < MIN_ACTIONS) return false;
      const threshold = Math.max(MIN_DIFF_DELTA, actionCount * MAX_DIFF_RATIO);
      return Math.abs(diffLineDelta) < threshold;
    },

    describe({ actionCount, diffLineDelta }: SignalSnapshot) {
      if (actionCount < MIN_ACTIONS) return { fires: false, reason: 'quiet' };
      const threshold = Math.max(MIN_DIFF_DELTA, actionCount * MAX_DIFF_RATIO);
      if (Math.abs(diffLineDelta) >= threshold) return { fires: false, reason: 'progress' };
      return { fires: true, reason: null };
    },

    async collectContext(): Promise<string> {
      const workspacePath  = options.getWorkspacePath();
      const activeFilePath = options.getActiveFilePath();
      const parts: string[] = [];

      if (activeFilePath) {
        const rel = workspacePath && activeFilePath.startsWith(workspacePath + '/')
          ? activeFilePath.slice(workspacePath.length + 1)
          : activeFilePath;
        parts.push(`**Active file:** \`${rel}\``);
      }

      try {
        const { diff } = await fetchOverallDiff();
        if (diff.trim()) {
          const lines = diff.split('\n').slice(0, 150);
          const truncated = lines.length === 150 ? [...lines, '… (truncated)'] : lines;
          parts.push(`**Unstaged git diff (workspace):**\n\`\`\`diff\n${truncated.join('\n')}\n\`\`\``);
        } else {
          parts.push('**Unstaged git diff:** (none — working tree is clean)');
        }
      } catch {
        parts.push('**Unstaged git diff:** (unavailable)');
      }

      return parts.join('\n\n');
    },
  };
}
