import { useEffect, useRef } from 'react';
import { diffWordsWithSpace, type Change } from 'diff';
import type { DiffHunk } from '../../api/files';

export interface DiffHunkDialogProps {
  hunk: DiffHunk;
  /** Current editor text for the hunk's range, snapshotted when the dialog opened. */
  currents: string[];
  onRevert: () => void;
  onClose: () => void;
}

// Diffing a very long line is wasted work — the user can't usefully read a
// wall of tinted spans anyway, so fall back to a plain (untinted) row.
const MAX_DIFF_LEN = 2000;

const RED_TINT = 'rgba(244, 71, 71, 0.35)';
const GREEN_TINT = 'rgba(46, 160, 67, 0.35)';

type Row = { line: number | null; text: string; parts: Change[] | null };

function renderSide(row: Row, side: 'before' | 'after') {
  if (row.parts === null) {
    return row.text === ''
      ? <span style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>(empty line)</span>
      : <span>{row.text}</span>;
  }
  const skip = side === 'before' ? 'added' : 'removed';
  const tint = side === 'before' ? 'removed' : 'added';
  const color = side === 'before' ? RED_TINT : GREEN_TINT;

  const rendered = row.parts
    .filter(p => !p[skip])
    .map((p, i) => (
      <span key={i} style={p[tint] ? { background: color, borderRadius: 2 } : undefined}>
        {p.value}
      </span>
    ));

  return rendered.length > 0
    ? rendered
    : <span style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>(empty line)</span>;
}

/**
 * Builds the two sides of the preview.
 *
 * Word-level tinting only makes sense when the two sides line up 1:1. For an
 * unbalanced hunk (two lines collapsed into one, one line expanded into three)
 * there is no meaningful per-line pairing, so each side is shown plainly and the
 * block tint alone carries the added/removed meaning — the same thing GitHub does.
 */
function buildRows(hunk: DiffHunk, currents: string[]): { before: Row[]; after: Row[] } {
  const { originalLines, startLine, lineCount } = hunk;
  const balanced = originalLines.length === currents.length;

  const before: Row[] = originalLines.map((text, i) => ({
    // A deleted hunk has no working-copy lines, so its original text has no
    // line numbers to show; it sits between startLine and startLine + 1.
    line: lineCount === 0 ? null : startLine + i,
    text,
    parts: balanced && text.length + currents[i].length <= MAX_DIFF_LEN
      ? diffWordsWithSpace(text, currents[i])
      : null,
  }));

  const after: Row[] = currents.map((text, i) => ({
    line: startLine + i,
    text,
    parts: balanced && text.length + originalLines[i].length <= MAX_DIFF_LEN
      ? diffWordsWithSpace(originalLines[i], text)
      : null,
  }));

  return { before, after };
}

function title(hunk: DiffHunk): string {
  const { type, startLine, lineCount, originalLines } = hunk;
  if (type === 'deleted') {
    const n = originalLines.length;
    const where = startLine === 0 ? 'before line 1' : `after line ${startLine}`;
    return `Deleted ${n === 1 ? '1 line' : `${n} lines`} ${where}`;
  }
  const label = type === 'added' ? 'Added' : 'Modified';
  const end = startLine + lineCount - 1;
  return `${label} ${lineCount > 1 ? `lines ${startLine}–${end}` : `line ${startLine}`}`;
}

export function DiffHunkDialog({ hunk, currents, onRevert, onClose }: DiffHunkDialogProps) {
  const revertBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    revertBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const { before, after } = buildRows(hunk, currents);

  const rowStyle: React.CSSProperties = { display: 'flex', gap: 12, padding: '1px 10px', whiteSpace: 'pre' };
  const gutterStyle: React.CSSProperties = {
    minWidth: 34,
    textAlign: 'right',
    color: 'var(--color-text-secondary)',
    userSelect: 'none',
    flexShrink: 0,
  };
  const blockStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    lineHeight: '18px',
    color: 'var(--color-code-text)',
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: '32vh',
    borderRadius: 4,
    padding: '6px 0',
  };

  const renderBlock = (rows: Row[], side: 'before' | 'after') => (
    <div
      style={{
        ...blockStyle,
        borderLeft: `3px solid ${side === 'before' ? '#f44747' : '#2ea043'}`,
        background: side === 'before' ? 'rgba(244, 71, 71, 0.12)' : 'rgba(46, 160, 67, 0.12)',
      }}
    >
      {rows.map((r, i) => (
        <div key={`${side}-${i}`} style={rowStyle}>
          <span style={gutterStyle}>{r.line ?? ''}</span>
          <span>{renderSide(r, side)}</span>
        </div>
      ))}
    </div>
  );

  const emptyNote = (text: string) => (
    <div
      style={{
        ...blockStyle,
        padding: '8px 12px',
        fontStyle: 'italic',
        color: 'var(--color-text-secondary)',
        background: 'var(--color-bg-code)',
        borderLeft: '3px solid var(--color-border)',
      }}
    >
      {text}
    </div>
  );

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title(hunk)}
        style={{
          background: 'var(--color-bg-sidebar)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          padding: '20px 24px',
          width: 'min(760px, 90vw)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
          {title(hunk)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          Review the change before reverting to the committed version.
        </div>

        {before.length > 0 ? renderBlock(before, 'before') : emptyNote('Nothing here in the committed version.')}
        <div style={{ height: 6 }} />
        {after.length > 0 ? renderBlock(after, 'after') : emptyNote('Removed from the working copy.')}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: 3,
              color: 'var(--color-text-secondary)',
              background: 'var(--color-bg-hover)',
              fontSize: 13,
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-selected)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
          >
            Cancel
          </button>
          <button
            ref={revertBtnRef}
            onClick={onRevert}
            style={{
              padding: '6px 16px',
              borderRadius: 3,
              background: 'var(--color-accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            ↺ Revert
          </button>
        </div>
      </div>
    </div>
  );
}
