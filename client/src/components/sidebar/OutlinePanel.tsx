interface HeadingEntry {
  level: number;
  text: string;
  id: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[*_`~[\]()!]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function parseHeadings(content: string): HeadingEntry[] {
  return content.split('\n').flatMap(line => {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (!m) return [];
    const text = m[2].trim().replace(/[*_`~[\]()]/g, '');
    return [{ level: m[1].length, text, id: slugify(text) }];
  });
}

interface OutlinePanelProps {
  content: string | null;
  activeHeadingId?: string | null;
  onNavigate?: (id: string) => void;
}

export function OutlinePanel({ content, activeHeadingId, onNavigate }: OutlinePanelProps) {
  const headings = content ? parseHeadings(content) : [];
  const minLevel = headings.length > 0 ? Math.min(...headings.map(h => h.level)) : 1;

  // Find ancestor IDs for the active heading
  const ancestorIds = new Set<string>();
  if (activeHeadingId) {
    const activeIdx = headings.findIndex(h => h.id === activeHeadingId);
    if (activeIdx >= 0) {
      const activeLevel = headings[activeIdx].level;
      const levelsSeen = new Set<number>();
      for (let i = activeIdx - 1; i >= 0; i--) {
        const h = headings[i];
        if (h.level < activeLevel && !levelsSeen.has(h.level)) {
          ancestorIds.add(h.id);
          levelsSeen.add(h.level);
        }
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px 6px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        userSelect: 'none',
        flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
      }}>
        Outline
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {headings.length === 0 ? (
          <div style={{
            padding: '12px 16px',
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            fontStyle: 'italic',
          }}>
            No headings found.
          </div>
        ) : (
          headings.map((heading, idx) => {
            const isActive = heading.id === activeHeadingId;
            const isAncestor = ancestorIds.has(heading.id);
            const indent = (heading.level - minLevel) * 14 + 12;
            return (
              <button
                key={`${heading.id}-${idx}`}
                onClick={() => onNavigate?.(heading.id)}
                title={heading.text}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  paddingLeft: indent,
                  paddingRight: 8,
                  paddingTop: 3,
                  paddingBottom: 3,
                  fontSize: 12,
                  textAlign: 'left',
                  background: isActive ? 'var(--color-accent)22' : 'transparent',
                  color: isActive
                    ? 'var(--color-accent)'
                    : 'var(--color-text-primary)',
                  fontWeight: isActive ? 700 : isAncestor ? 600 : 400,
                  cursor: 'pointer',
                  border: 'none',
                  borderRadius: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  transition: 'background 0.1s',
                  gap: 4,
                  lineHeight: 1.5,
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-bg-hover, rgba(255,255,255,0.05))';
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                {isActive && (
                  <span style={{ fontSize: 9, flexShrink: 0, marginRight: 2 }}>▸</span>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {heading.text}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
