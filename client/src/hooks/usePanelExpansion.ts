import { useState, useCallback, useRef } from 'react';

// ── Config ─────────────────────────────────────────────────────────────────
// All expansion behaviour is driven by this config object. When settings UI
// is added later, replace DEFAULT_PANEL_EXPANSION_CONFIG with persisted values.

export interface PanelExpansionConfig {
  /** Master switch — set false to disable all automatic resizing. */
  enabled: boolean;
  /** Width the panel grows to when expansion is triggered. */
  expandedWidth: number;
  /** Expand when the assistant response contains a fenced code block. */
  triggerOnCodeBlock: boolean;
  /** Expand when the assistant called at least one tool (edit_file, write_file, etc.). */
  triggerOnToolUse: boolean;
  /** Shrink back when the open_file tool fires (so the editor is unobstructed). */
  shrinkOnOpenFile: boolean;
  /** Shrink back when a response contains neither code nor tool use (plain conversation). */
  shrinkOnPlainResponse: boolean;
}

export const DEFAULT_PANEL_EXPANSION_CONFIG: PanelExpansionConfig = {
  enabled: true,
  expandedWidth: 650,
  triggerOnCodeBlock: true,
  triggerOnToolUse: true,
  shrinkOnOpenFile: true,
  shrinkOnPlainResponse: true,
};

// ── Hook ───────────────────────────────────────────────────────────────────

function containsCodeBlock(text: string): boolean {
  return /```/.test(text);
}

/**
 * usePanelExpansion
 *
 * Returns three stable callbacks that callers wire into the assistant lifecycle,
 * plus `isExpanded` so the layout can compute the effective panel width.
 *
 * - onAssistantReply(text, hadToolUse) — call when an assistant turn finishes
 * - onOpenFile()                       — call when open_file navigation fires
 * - resetExpansion()                   — call when the user manually resizes
 */
export function usePanelExpansion(config: PanelExpansionConfig) {
  const [isExpanded, setIsExpanded] = useState(false);
  // true while the width change should be animated (LLM-triggered).
  // Cleared immediately when the user starts dragging so drag stays instant.
  const [animated, setAnimated] = useState(false);

  // When open_file fires mid-stream the panel shrinks. The `done` event fires
  // shortly after and would re-expand via onAssistantReply. This flag lets
  // onOpenFile veto the next onAssistantReply call so the shrink sticks.
  const skipNextReplyRef = useRef(false);

  const onAssistantReply = useCallback((text: string, hadToolUse: boolean) => {
    if (!config.enabled) return;
    if (skipNextReplyRef.current) {
      skipNextReplyRef.current = false;
      return; // open_file already shrunk the panel — don't re-expand
    }
    const codeHeavy = config.triggerOnCodeBlock && containsCodeBlock(text);
    const toolHeavy = config.triggerOnToolUse && hadToolUse;
    if (codeHeavy || toolHeavy) {
      setAnimated(true);
      setIsExpanded(true);
    } else if (config.shrinkOnPlainResponse) {
      setAnimated(true);
      setIsExpanded(false);
    }
  }, [config]);

  const onOpenFile = useCallback(() => {
    if (config.enabled && config.shrinkOnOpenFile) {
      setAnimated(true);
      setIsExpanded(false);
      skipNextReplyRef.current = true;
    }
  }, [config]);

  /** Call when the user starts dragging the resize divider so manual size wins. */
  const resetExpansion = useCallback(() => {
    setAnimated(false); // strip transition immediately so drag is instant
    setIsExpanded(false);
    skipNextReplyRef.current = false;
  }, []);

  return { isExpanded, animated, onAssistantReply, onOpenFile, resetExpansion };
}
