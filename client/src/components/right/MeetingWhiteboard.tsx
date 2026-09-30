import { useState, useRef, useEffect } from 'react';

interface MeetingWhiteboardProps {
  content: string;
  onAppend: (text: string) => void;
}

export function MeetingWhiteboard({ content, onAppend }: MeetingWhiteboardProps) {
  const [input, setInput] = useState('');
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [content]);

  function submit() {
    const text = input.trim();
    if (!text) return;
    onAppend(text);
    setInput('');
  }

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ padding: '4px 10px 2px', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', opacity: 0.7, flexShrink: 0 }}>
        Whiteboard
      </div>
      <pre
        ref={preRef}
        style={{
          margin: 0,
          padding: '4px 10px',
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          fontSize: 11.5,
          fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--color-text-primary)',
          whiteSpace: 'pre',
          lineHeight: 1.5,
          background: 'var(--color-bg-editor, #1e1e1e)',
        }}
      >
        {content || <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', fontFamily: 'inherit' }}>Empty — AI or you can write here</span>}
      </pre>
      <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--color-border)', padding: '4px 6px', gap: 4, flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Append to whiteboard…"
          style={{
            flex: 1,
            background: 'var(--color-bg-input)',
            border: '1px solid var(--color-border)',
            borderRadius: 3,
            padding: '3px 7px',
            fontSize: 11.5,
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={submit}
          style={{
            background: 'var(--color-accent, #0e639c)',
            color: '#fff',
            border: 'none',
            borderRadius: 3,
            padding: '3px 10px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
