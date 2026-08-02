import type { ProactiveStatus } from '../../hooks/useProactiveHelp';

interface StatusBarProps {
  proactive: ProactiveStatus;
}

const REASON_LABELS: Record<string, string> = {
  quiet:    'quiet',
  progress: 'progress',
  cooldown: 'cooldown',
};

export function StatusBar({ proactive }: StatusBarProps) {
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
