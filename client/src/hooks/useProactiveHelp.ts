import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOverallDiff } from '../api/files';

// ── Public interface ──────────────────────────────────────────────────────────

/**
 * Snapshot of measurable progress passed to every signal's shouldFire check.
 * Keeps signal logic pure and easy to unit-test without DOM/network dependencies.
 */
export interface SignalSnapshot {
  /** User actions recorded since the last check (edits, navigations, scrolls). */
  actionCount: number;
  /** Change in total git-diff line count since the last check (negative = code removed). */
  diffLineDelta: number;
}

/** Live status exposed for the debug status bar. */
export interface ProactiveStatus {
  /** Actions recorded so far this window (live). */
  actionCount: number;
  /** Seconds until the next check fires. */
  nextCheckInSec: number;
  /** Forward-looking: would the next check trigger? (null = first window not complete yet). */
  willTrigger: boolean | null;
  /** Why willTrigger is false: 'cooldown' | 'quiet' | 'progress' | null */
  noReason: string | null;
  /** Remaining cooldown seconds (0 when not in cooldown). */
  cooldownRemainingSec: number;
}

/**
 * A self-contained proactive signal.  Add new signal types here as the feature
 * grows; the hook picks up any registered signal automatically.
 */
export interface ProactiveSignal {
  /** Stable identifier used for logging / future per-signal cooldowns. */
  readonly type: string;
  /** Return true when this signal should fire given the current snapshot. */
  shouldFire(snapshot: SignalSnapshot): boolean;
  /** Explain why this signal would or would not fire — used by the status bar. */
  describe?(snapshot: SignalSnapshot): { fires: boolean; reason: string | null };
  /** Async context collector called at trigger time and passed to the AI on the next user reply. */
  collectContext(): Promise<string>;
  /** Message variants shown in the chat UI; one is chosen at random each time. */
  readonly messages: readonly string[];
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseProactiveHelpOptions {
  /** Signals to evaluate every check interval. */
  signals: ProactiveSignal[];
  /** Whether detection is active. Tear down the timer when false. */
  enabled: boolean;
  /** Ref whose value is read (and reset to 0) on each check. Caller increments it. */
  actionCountRef: React.MutableRefObject<number>;
  /** Called when a signal fires with the chosen message and a context collector. */
  onTrigger: (message: string, collectContext: () => Promise<string>) => void | Promise<void>;
  /** How often to evaluate signals. Defaults to 60 000 ms (1 minute). */
  checkIntervalMs?: number;
  /** Minimum ms between any two triggers across all signals. Defaults to 600 000 ms (10 min). */
  cooldownMs?: number;
}

export interface ProactiveHelpController {
  status: ProactiveStatus;
  /** Restart the global cooldown after direct user interaction. */
  startCooldown: () => void;
  /** Suppress proactive messages while the assistant is actively working. */
  setAssistantBusy: (busy: boolean) => void;
}

export function useProactiveHelp({
  signals,
  enabled,
  actionCountRef,
  onTrigger,
  checkIntervalMs = 60_000,
  cooldownMs = 120_000,
}: UseProactiveHelpOptions): ProactiveHelpController {
  const prevDiffLinesRef  = useRef<number | null>(null);
  const lastDiffDeltaRef  = useRef<number>(0);
  const cooldownStartedAtRef = useRef<number>(0);
  const assistantBusyRef  = useRef(false);
  const isTriggeringRef   = useRef(false);
  const nextCheckAtRef    = useRef<number>(0);
  const onTriggerRef     = useRef(onTrigger);
  const signalsRef       = useRef(signals);
  onTriggerRef.current   = onTrigger;
  signalsRef.current     = signals;

  const startCooldown = useCallback(() => {
    cooldownStartedAtRef.current = Date.now();
  }, []);

  const [status, setStatus] = useState<ProactiveStatus>({
    actionCount: 0, nextCheckInSec: 0, willTrigger: null, noReason: null, cooldownRemainingSec: 0,
  });

  useEffect(() => {
    if (!enabled) {
      // Reset state so stale data doesn't influence the next enabled period.
      prevDiffLinesRef.current = null;
      actionCountRef.current   = 0;
      setStatus({ actionCount: 0, nextCheckInSec: 0, willTrigger: null, noReason: null, cooldownRemainingSec: 0 });
      return;
    }

    nextCheckAtRef.current = Date.now() + checkIntervalMs;

    const check = async () => {
      // Drain the action counter atomically.
      const actionCount = actionCountRef.current;
      actionCountRef.current = 0;

      // Fetch current overall diff size.
      let currentLines = prevDiffLinesRef.current ?? 0;
      try {
        const result = await fetchOverallDiff();
        currentLines = result.lineCount;
      } catch {
        // Network / git error — skip this check without resetting state.
        actionCountRef.current += actionCount; // put actions back
        nextCheckAtRef.current = Date.now() + checkIntervalMs;
        return;
      }

      const diffLineDelta = currentLines - (prevDiffLinesRef.current ?? currentLines);
      prevDiffLinesRef.current = currentLines;
      lastDiffDeltaRef.current = diffLineDelta;
      nextCheckAtRef.current = Date.now() + checkIntervalMs;

      const snapshot: SignalSnapshot = { actionCount, diffLineDelta };

      // Never interrupt an active assistant task, overlap a trigger, or fire during cooldown.
      if (assistantBusyRef.current || isTriggeringRef.current || Date.now() - cooldownStartedAtRef.current < cooldownMs) return;

      const wouldFire = signalsRef.current.some(s => s.shouldFire(snapshot));
      if (wouldFire) {
        for (const signal of signalsRef.current) {
          if (!signal.shouldFire(snapshot)) continue;
          const message = signal.messages[Math.floor(Math.random() * signal.messages.length)];
          isTriggeringRef.current = true;
          try {
            await onTriggerRef.current(message, signal.collectContext.bind(signal));
          } finally {
            isTriggeringRef.current = false;
            startCooldown();
          }
          break; // only one signal fires per check
        }
      }
    };

    const timer = setInterval(check, checkIntervalMs);
    return () => clearInterval(timer);
  }, [enabled, checkIntervalMs, cooldownMs, actionCountRef, startCooldown]);

  // 1-second ticker to keep the status bar current (forward-looking).
  useEffect(() => {
    if (!enabled) return;
    const ticker = setInterval(() => {
      const now = Date.now();
      const cooldownRemainingSec = Math.max(0, Math.round((cooldownStartedAtRef.current + cooldownMs - now) / 1000));
      const inCooldown = cooldownRemainingSec > 0;
      const assistantBusy = assistantBusyRef.current;
      const snapshot: SignalSnapshot = {
        actionCount: actionCountRef.current,
        diffLineDelta: lastDiffDeltaRef.current,
      };

      // Only evaluate signals once a first check has completed (diff baseline exists).
      let willTrigger: boolean | null = null;
      let noReason: string | null = null;
      if (prevDiffLinesRef.current !== null) {
        if (assistantBusy || inCooldown) {
          willTrigger = false;
          noReason = assistantBusy ? 'busy' : 'cooldown';
        } else {
          let described = false;
          for (const sig of signalsRef.current) {
            const d = sig.describe?.(snapshot);
            if (d) {
              willTrigger = d.fires;
              noReason = d.fires ? null : d.reason;
              described = true;
              break;
            }
          }
          if (!described) {
            willTrigger = signalsRef.current.some(s => s.shouldFire(snapshot));
            noReason = willTrigger ? null : 'unknown';
          }
        }
      }

      setStatus({
        actionCount: snapshot.actionCount,
        nextCheckInSec: Math.max(0, Math.round((nextCheckAtRef.current - now) / 1000)),
        willTrigger,
        noReason,
        cooldownRemainingSec,
      });
    }, 1000);
    return () => clearInterval(ticker);
  }, [enabled, cooldownMs, actionCountRef]);

  return {
    status,
    startCooldown,
    setAssistantBusy: (busy: boolean) => {
      assistantBusyRef.current = busy;
      // Give the user a full quiet window once assistant work finishes.
      if (!busy) startCooldown();
    },
  };
}
