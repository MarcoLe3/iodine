import { useState, useEffect } from 'react';
import type { ProactiveStatus } from '../../hooks/useProactiveHelp';

interface StatusBarProps {
  proactive: ProactiveStatus;
  lastPingAt: number | null;
}

function useTimeAgo(ts: number | null): string {
  const [label, setLabel] = useState('—');

  useEffect(() => {
    if (!ts) { setLabel('—'); return; }
    function update() {
      const s = Math.floor((Date.now() - ts!) / 1000);
      if (s < 60)        setLabel(`${s}s ago`);
      else if (s < 3600) setLabel(`${Math.floor(s / 60)}m ago`);
      else               setLabel(`${Math.floor(s / 3600)}h ago`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [ts]);

  return label;
}

const REASON_LABELS: Record<string, string> = {
  quiet:    'quiet',
  progress: 'progress',
  cooldown: 'cooldown',
};

export function StatusBar({ proactive, lastPingAt }: StatusBarProps) {
  const heartbeatAgo = useTimeAgo(lastPingAt);
  const { actionCount, nextCheckInSec, willTrigger, noReason, cooldownRemainingSec } = proactive;

  let triggerLabel: string;
  let triggerColor: string;

  if (willTrigger === null) {
    triggerLabel = '—';
    triggerColor = 'var(--color-text-secondary)';
  } else if (willTrigger) {
    triggerLabel = 'YES';
    triggerColor = '#e9b44c';
  } else {
    const reason = noReason ? ` · ${REASON_LABELS[noReason] ?? noReason}` : '';
    triggerLabel = `NO${reason}`;
    triggerColor = noReason === 'cooldown' ? '#569cd6' : '#4ec994';
  }

  const mins = Math.floor(cooldownRemainingSec / 60);
  const secs = cooldownRemainingSec % 60;
  const cooldownLabel = cooldownRemainingSec > 0
    ? `${mins > 0 ? `${mins}m ` : ''}${secs}s`
    : null;

  return (
    <div
      style={{
        height: 22,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        background: 'var(--color-bg-activity-bar)',
        borderTop: '1px solid var(--color-border)',
        fontSize: 11,
        color: 'var(--color-text-secondary)',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        paddingInline: 10,
        userSelect: 'none',
      }}
    >
      <Pill label="Actions" value={String(actionCount)} />
      <Sep />
      <Pill label="Next" value={`${nextCheckInSec}s`} />
      <Sep />
      <span>Next check: <span style={{ color: triggerColor, fontWeight: 600 }}>{triggerLabel}</span></span>
      {cooldownLabel && (
        <>
          <Sep />
          <Pill label="Cooldown" value={cooldownLabel} />
        </>
      )}
      <Sep />
      <Pill label="Heartbeat" value={heartbeatAgo} />
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label}: <span style={{ color: 'var(--color-text-primary)' }}>{value}</span>
    </span>
  );
}

function Sep() {
  return (
    <span style={{ margin: '0 10px', opacity: 0.3 }}>|</span>
  );
}
