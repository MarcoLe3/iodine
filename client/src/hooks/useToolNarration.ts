import { useCallback, useRef } from 'react';
import type { Provider } from '../providers';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

const TOOL_NARRATION_PHRASES: Record<string, string[]> = {
  read_file:      ['Hmm, let me read {file}.', 'Let me take a look at {file}.', 'Let me examine {file}.', 'Hmm, let me check {file}.', "Let me see what {file} says."],
  edit_file:      ['Let me edit {file}.', 'Hmm, let me update {file}.', 'Let me modify {file}.', 'Hmm, let me adjust {file}.', 'Let me make that change in {file}.'],
  write_file:     ['Let me write {file}.', 'Hmm, let me create {file}.', 'Let me put {file} together.', 'Hmm, let me set up {file}.'],
  open_file:      ['Let me open {file}.', 'Hmm, let me navigate to {file}.', 'Let me pull up {file}.', 'Let me look at {file}.'],
  list_directory: ["Hmm, let me look around in {file}.", 'Let me check the structure of {file}.', "Let me see what's in {file}.", 'Hmm, let me explore {file}.'],
  search_files:   ['Let me search for this.', 'Hmm, let me find this.', 'Let me track this down.', 'Hmm, let me look for this.'],
};

// read_file and open_file narrations are skippable: they are evicted from the
// queue as soon as the Verbally audio is ready, cutting straight to the summary.
// edit_file and write_file narrations are kept — they signal meaningful work.
const SKIPPABLE_TOOLS = new Set(['read_file', 'open_file']);

interface NarrationEntry {
  fn: () => Promise<string>;
  skippable: boolean;
}

export function useToolNarration(provider: Provider) {
  const queueRef      = useRef<NarrationEntry[]>([]);
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);
  const drainingRef   = useRef(false);
  const narratedRef   = useRef(new Set<string>());
  const lastFileRef   = useRef<string | null>(null);
  const hadNarrationsRef = useRef(false);
  const onEmptyRef    = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    generationRef.current++;
    queueRef.current = [];
    audioRef.current?.pause();
    audioRef.current = null;
    drainingRef.current = false;
    onEmptyRef.current?.();
    onEmptyRef.current = null;
  }, []);

  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    const generation = generationRef.current;
    while (queueRef.current.length && generation === generationRef.current) {
      const { fn: fetchAudio } = queueRef.current.shift()!;
      try {
        const url = await fetchAudio();
        if (generation !== generationRef.current) { URL.revokeObjectURL(url); break; }
        await new Promise<void>(resolve => {
          const audio = new Audio(url);
          audioRef.current = audio;
          let finished = false;
          const finish = () => { if (finished) return; finished = true; URL.revokeObjectURL(url); resolve(); };
          audio.play().catch(finish);
          audio.addEventListener('ended', finish, { once: true });
          audio.addEventListener('error', finish, { once: true });
          audio.addEventListener('pause', finish, { once: true });
        });
      } catch { /* skip failed clips */ }
    }
    if (generation === generationRef.current) {
      drainingRef.current = false;
      onEmptyRef.current?.();
      onEmptyRef.current = null;
    }
  }, []);

  /** Remove all skippable entries from the pending queue (does not interrupt the current clip). */
  const evictSkippable = useCallback(() => {
    queueRef.current = queueRef.current.filter(e => !e.skippable);
  }, []);

  const narrate = useCallback((name: string, input: Record<string, unknown>) => {
    const path = Object.values(input).find(
      value => typeof value === 'string' && (value.includes('/') || value.includes('\\'))
    ) as string | undefined;
    const family = name === 'open_file' || name === 'read_file' ? 'read' : name;
    const key = `${family}:${path ?? ''}`;
    if (narratedRef.current.has(key)) return;
    narratedRef.current.add(key);
    hadNarrationsRef.current = true;

    const phrases  = TOOL_NARRATION_PHRASES[name] ?? ['Hmm, let me handle this.', 'Let me take care of this.'];
    const template = phrases[Math.floor(Math.random() * phrases.length)];
    const filename  = path?.split(/[/\\]/).filter(Boolean).pop() ?? null;
    const normalized = path?.replace(/\\/g, '/').replace(/^\.\//, '') ?? null;
    const phrase = template.replace('{file}', normalized === lastFileRef.current ? 'the file' : filename ?? 'this');
    if (normalized) lastFileRef.current = normalized;

    queueRef.current.push({
      fn: async () => {
        const response = await fetch(`${API_BASE}/api/tts/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: phrase, provider: provider.id }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return URL.createObjectURL(await response.blob());
      },
      skippable: SKIPPABLE_TOOLS.has(name),
    });
    void drain();
  }, [provider.id, drain]);

  const resetTurn = useCallback(() => {
    narratedRef.current   = new Set();
    lastFileRef.current   = null;
    hadNarrationsRef.current = false;
  }, []);

  return { narrate, stop, drain, evictSkippable, queueRef, audioRef, hadNarrationsRef, onEmptyRef, resetTurn };
}
