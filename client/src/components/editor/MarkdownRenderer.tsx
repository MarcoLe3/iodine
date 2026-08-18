import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { makeHeadingId, resolveImageSrc } from './MarkdownUtils';

type Props = {
  content: string;
  activeFilePath: string;
  inlineCodeComponent: NonNullable<NonNullable<React.ComponentProps<typeof ReactMarkdown>['components']>['code']>;
  onLinkClick?: (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
};

export function MarkdownRenderer({ content, activeFilePath, inlineCodeComponent, onLinkClick }: Props) {
  const components = useMemo(() => ({
    a({ href, children, ...props }: React.ComponentPropsWithoutRef<'a'>) {
      const target = href ?? '';
      return <a href={href} onClick={e => onLinkClick?.(e, target)} {...props}>{children}</a>;
    },
    code({ children, className, ...props }: React.ComponentPropsWithoutRef<'code'>) {
      const language = /language-([^\s]+)/.exec(className ?? '')?.[1];
      if (language) {
        return (
          <SyntaxHighlighter
            language={language}
            style={oneDark}
            PreTag="div"
            customStyle={{ margin: '1em 0', borderRadius: 6 }}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        );
      }
      return React.createElement(inlineCodeComponent, { ...props, className }, children);
    },
    img({ src, alt, ...props }: React.ComponentPropsWithoutRef<'img'>) {
      return <img src={resolveImageSrc(src ?? '', activeFilePath)} alt={alt ?? ''} {...props} style={{ maxWidth: '100%' }} />;
    },
    ...Object.fromEntries(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(tag => [tag, ({ children, ...props }: any) => React.createElement(tag, { ...props, id: makeHeadingId(children) }, children)])),
  }), [activeFilePath, inlineCodeComponent, onLinkClick]);

  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>;
}
