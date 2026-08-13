import { useState, useEffect } from 'react';

const SNOOZE_KEY = 'iodine:update-snooze';
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface UpdateInfo {
  latestTag: string;
  url: string;
}

function parseSemver(v: string): [number, number, number] | null {
  const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function isNewer(latest: string, current: string): boolean {
  const l = parseSemver(latest);
  const c = parseSemver(current);
  if (!l || !c) return false;
  for (let i = 0; i < 3; i++) {
    if (l[i] > c[i]) return true;
    if (l[i] < c[i]) return false;
  }
  return false;
}

function isSnoozed(): boolean {
  const val = localStorage.getItem(SNOOZE_KEY);
  if (!val) return false;
  const ms = parseInt(val, 10);
  return !isNaN(ms) && Date.now() - ms < SNOOZE_MS;
}

export function useUpdateCheck(repo: string) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    if (!repo) return;

    async function check() {
      if (isSnoozed()) return;
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) return;
        const data = await res.json() as { tag_name?: string; html_url?: string };
        const tag = data.tag_name ?? '';
        const url = data.html_url ?? `https://github.com/${repo}/releases`;
        if (isNewer(tag, __APP_VERSION__)) {
          setUpdateInfo({ latestTag: tag, url });
        }
      } catch {
        // Network unavailable or non-GitHub remote — silently skip
      }
    }

    check();
    const interval = setInterval(check, 4 * 60 * 60 * 1000); // every 4 hours
    return () => clearInterval(interval);
  }, [repo]);

  const snooze = () => {
    localStorage.setItem(SNOOZE_KEY, Date.now().toString());
    setUpdateInfo(null);
  };

  return { updateInfo, snooze };
}
