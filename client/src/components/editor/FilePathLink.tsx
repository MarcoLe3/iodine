import React from 'react';

const linkStyle: React.CSSProperties = { cursor: 'pointer', textDecorationLine: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' };

interface FilePathLinkProps extends React.ComponentPropsWithoutRef<'code'> {
  /** Full path, shown in the tooltip. The visible label comes from children. */
  path: string;
  onOpen: () => void;
}

/** A file path rendered as a clickable span. Used in markdown preview and in assistant output. */
export function FilePathLink({ path, onOpen, children, style, ...props }: FilePathLinkProps) {
  return (
    <code
      {...props}
      style={{ ...linkStyle, ...style }}
      title={`Open ${path}`}
      onClick={event => { event.stopPropagation(); onOpen(); }}
    >
      {children}
    </code>
  );
}
