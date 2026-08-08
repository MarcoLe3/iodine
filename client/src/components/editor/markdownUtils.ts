import React from 'react';

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[*_`~[\\]()!]/g, '').replace(/[^\\w\\s-]/g, '').replace(/\\s+/g, '-').replace(/-+/g, '-').trim();
}

export function makeHeadingId(children: React.ReactNode): string {
  const extract = (node: React.ReactNode): string => {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(extract).join('');
    if (typeof node === 'object' && 'props' in (node as object)) return extract((node as React.ReactElement).props.children);
    return '';
  };
  return slugify(extract(children));
}

export function resolveWorkspacePath(relativePath: string, activeFilePath: string): string {
  const active = activeFilePath.replace(/\\/g, '/');
  const relative = relativePath.replace(/\\/g, '/');
  const dir = active.substring(0, active.lastIndexOf('/'));
  const parts = `${dir}/${relative}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  const root = active.match(/^([A-Za-z]:[/\\]|\/)?/)?.[0] ?? '';
  return root + resolved.join('/');
}

export function resolveImageSrc(src: string, activeFilePath: string | null): string {
  if (/^https?:\\/\\//.test(src) || src.startsWith('data:')) return src;
  if (!activeFilePath) return src;
  return `http://localhost:3001/api/files/image?path=${encodeURIComponent(resolveWorkspacePath(src, activeFilePath))}`;
}
