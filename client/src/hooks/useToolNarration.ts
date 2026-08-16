import { useCallback, useRef } from 'react';
import type { Provider } from '../providers';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

const TOOL_NARRATION_PHRASES: Record<string, string[]> = {
  read_file: [
    'Let me read through {file}.', 'I’ll take a closer look at {file}.', 'Let me inspect {file}.',
    'I’m checking what’s in {file}.', 'Let me see how {file} works.', 'I’ll review {file} for context.',
    'Let me dig into {file}.', 'I’m going through {file} now.', 'Let me check the details in {file}.',
    'I’ll get familiar with {file}.', 'Let me trace through {file}.', 'I’m taking a look inside {file}.',
    'Let me understand what {file} is doing.', 'I’ll scan {file} for the relevant part.',
    'Let me read the surrounding code in {file}.', 'I’m checking {file} before we continue.',
    'Let me get some context from {file}.', 'I’ll examine the implementation in {file}.',
    'Let me see what we’re working with in {file}.', 'I’m reviewing the current state of {file}.',
    'Let me verify the logic in {file}.', 'I’ll look through {file} carefully.',
    'Let me follow what’s happening in {file}.', 'I’m reading {file} to find the right spot.',
    'Let me check how this is set up in {file}.',
  ],
  edit_file: [
    'Let me update {file}.', 'I’ll make that change in {file}.', 'Let me adjust {file}.',
    'I’m applying the update to {file}.', 'Let me refine {file}.', 'I’ll patch {file} now.',
    'Let me make the targeted edit in {file}.', 'I’m updating the relevant part of {file}.',
    'Let me edit {file}.', 'I’ll put that fix into {file}.',
    'I’m making the requested change in {file}.', 'I’ll adjust the implementation in {file}.',
    'Let me improve this part of {file}.', 'Let me apply a focused change to {file}.',
    'I’ll update the code in {file}.', 'I’m revising the relevant lines in {file}.',
    'Let me clean up {file}.', 'I’ll make the necessary adjustment in {file}.',
    'Let me incorporate that into {file}.', 'I’m modifying {file} now.',
  ],
  write_file: [
    'Let me create {file}.', 'I’ll put {file} together.', 'Let me set up {file}.',
    'I’m creating {file} now.', 'Let me add the new {file}.', 'I’ll draft {file}.',
    'Let me build out {file}.', 'I’m putting the contents of {file} in place.',
    'Let me write {file} from scratch.', 'I’ll get {file} started.', 'Let me assemble {file}.',
    'I’m adding {file} to the project.', 'Let me prepare {file}.', 'I’ll create the initial {file}.',
    'Let me lay out {file}.', 'I’m writing the new {file}.', 'Let me get {file} into place.',
    'I’ll add the implementation in {file}.', 'Let me form the new {file}.',
    'I’m setting up the structure for {file}.',
  ],
  open_file: [
    'Let me open {file}.', 'I’ll bring up {file}.', 'Let me jump to {file}.',
    'I’m opening {file} in the editor.', 'Let me navigate to {file}.', 'I’ll pull up {file}.',
    'Let me show you {file}.', 'I’m heading over to {file}.', 'Let me focus the editor on {file}.',
    'I’ll take us to {file}.', 'Let me highlight the relevant part of {file}.',
    'I’m bringing {file} into view.', 'Let me point you to {file}.', 'I’ll open the right section of {file}.',
    'Let me surface {file} in the editor.', 'I’m navigating to the code in {file}.',
    'Let me put {file} on screen.', 'I’ll show the relevant lines in {file}.',
    'Let me bring the important section of {file} into view.', 'I’m opening up {file} for us.',
  ],
  list_directory: [
    'Let me look around in {file}.', 'I’ll check the structure of {file}.', 'Let me see what’s inside {file}.',
    'I’m exploring {file}.', 'Let me map out {file}.', 'I’ll take a look through {file}.',
    'Let me inspect the contents of {file}.', 'I’m checking how {file} is organized.',
    'Let me get the lay of the land in {file}.', 'I’ll browse the files under {file}.',
    'Let me see how this directory is arranged.', 'I’m reviewing the project structure here.',
    'Let me check what files are available.', 'I’ll explore this part of the workspace.',
    'Let me get a quick overview of {file}.', 'I’m looking through the directory tree.',
    'Let me find our way around {file}.', 'I’ll inspect the folders in {file}.',
    'Let me see what we have to work with here.', 'I’m taking stock of the files in {file}.',
  ],
  search_files: [
    'Let me search for that.', 'I’ll track that down.', 'Let me find where this is defined.',
    'I’m looking for the relevant code.', 'Let me locate that in the project.', 'I’ll search the codebase for it.',
    'Let me see where that appears.', 'I’m tracing down the matching references.',
    'Let me find the right implementation.', 'I’ll look for every place this is used.',
    'Let me narrow down where this lives.', 'I’m searching for the related code now.',
    'Let me identify the files involved.', 'I’ll find the source of that behavior.',
    'Let me follow that name through the codebase.', 'I’m checking where this is referenced.',
    'Let me hunt down the relevant section.', 'I’ll search for the closest match.',
    'Let me find the code path behind this.', 'I’m locating the right place to make the change.',
  ],
  git_commit_compose: [
    'Let me draft a commit message.', 'I’ll prepare a commit message for you.',
    'Let me summarize these changes for the commit.', 'I’m putting together a clear commit message.',
    'Let me write up the commit summary.', 'I’ll draft a concise message for these changes.',
    'Let me turn this work into a commit message.', 'I’m preparing the Source Control message now.',
    'Let me capture the intent of these changes.', 'I’ll compose a commit message that reflects the work.',
  ],
};

// Exploration/navigation narrations are skippable when the final summary is ready.
// Edit/write narrations are kept because they announce meaningful changes.
const SKIPPABLE_TOOLS = new Set(['read_file', 'open_file', 'list_directory', 'search_files']);

interface NarrationEntry {
  fn: () => Promise<string>;
  skippable: boolean;
}

export function useToolNarration(provider: Provider) {
  const queueRef      = useRef<NarrationEntry[]>([]);
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);
  const drainingRef   = useRef(false);
  // Cleared at the start of each turn to suppress duplicate narration within that turn.
  const narratedRef        = useRef(new Set<string>());
  // Persists across turns so repeated tool/file combinations can be announced with “again”.
  const previouslyNarratedRef = useRef(new Set<string>());
  const hadNarrationsRef   = useRef(false);
  const hadUnskippableRef  = useRef(false);
  const unskippableCountRef = useRef(0);
  const onEmptyRef         = useRef<(() => void) | null>(null);

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
    // Treat reading and opening as the same action, and normalize path separators so
    // equivalent tool/file calls share one stable identity on every platform.
    const family = name === 'open_file' || name === 'read_file' ? 'read' : name;
    const normalized = path?.replace(/\\/g, '/').replace(/^\.\//, '') ?? '';
    const key = `${family}:${normalized}`;

    // A duplicate in the current turn is silent. A key seen only in an earlier turn
    // is narrated normally below, with “again” appended to the sentence.
    if (narratedRef.current.has(key)) return;
    const narratedInPreviousTurn = previouslyNarratedRef.current.has(key);
    narratedRef.current.add(key);
    previouslyNarratedRef.current.add(key);
    hadNarrationsRef.current = true;
    const isUnskippable = !SKIPPABLE_TOOLS.has(name);
    if (isUnskippable) {
      hadUnskippableRef.current = true;
      unskippableCountRef.current++;
    }

    // After 2 unskippable (edit/write) narrations in a turn, make the rest skippable
    // so repeated "let me edit…" clips don't pile up and feel robotic.
    const skippable = SKIPPABLE_TOOLS.has(name) || unskippableCountRef.current > 2;

    const phrases  = TOOL_NARRATION_PHRASES[name] ?? ['Hmm, let me handle this.', 'Let me take care of this.'];
    const template = phrases[Math.floor(Math.random() * phrases.length)];
    const filename = path?.split(/[/\\]/).filter(Boolean).pop() ?? null;
    const basePhrase = template.replace('{file}', filename ?? 'this');
    // Keep terminal punctuation at the end: “Let me inspect foo.ts.” → “…foo.ts again.”
    const phrase = narratedInPreviousTurn
      ? basePhrase.replace(/([.!?])?$/, ' again$1')
      : basePhrase;

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
      skippable,
    });
    void drain();
  }, [provider.id, drain]);

  /** Enqueue a greeting clip at the front of the turn so it plays before any tool narrations. */
  const enqueueGreeting = useCallback((mode: 'hello' | 'welcomeBack') => {
    const text = mode === 'hello' ? 'Hello there.' : 'Welcome back.';
    queueRef.current.push({
      skippable: false,
      fn: async () => {
        const response = await fetch(`${API_BASE}/api/tts/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, provider: provider.id }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return URL.createObjectURL(await response.blob());
      },
    });
    void drain();
  }, [provider.id, drain]);

  const resetTurn = useCallback(() => {
    narratedRef.current        = new Set();
    hadNarrationsRef.current   = false;
    hadUnskippableRef.current  = false;
    unskippableCountRef.current = 0;
  }, []);

  return { narrate, stop, drain, evictSkippable, enqueueGreeting, queueRef, audioRef, hadNarrationsRef, hadUnskippableRef, unskippableCountRef, onEmptyRef, resetTurn };
}
