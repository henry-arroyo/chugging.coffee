/**
 * Renders a page document as 1995 HTML would have looked. Only the safe block types exist: nothing
 * here can create raw HTML, scripts, styles beyond the validated palette, or real links. Blocks
 * appear as their transfer chunks are revealed; the next image waits as a sized placeholder.
 */
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { Block, Inline, Mark, PageDocument, TableCell } from '../../core/contracts/types';
import type { WebAddress } from '../../core/net/address';
import { assetUrl } from '../../shell/icons';
import type { PlannedChunk } from '../plan';
import type { PinnedWorld } from '../repository';
import { WidgetView } from './widgets';
import './page.css';

export interface PageViewProps {
  doc: PageDocument;
  chunks: PlannedChunk[];
  /** How many chunks have arrived. */
  revealed: number;
  base: WebAddress;
  world: PinnedWorld | null;
  isVisited: (href: string) => boolean;
  onNavigate: (href: string) => void;
  onHover: (href: string | null) => void;
}

const FONTS = { serif: "'Times New Roman', Times, serif", sans: 'Arial, Helvetica, sans-serif', mono: "'Courier New', Courier, monospace" };

function marked(text: ReactNode, marks: Mark[] | undefined): ReactNode {
  let out = text;
  for (const m of marks ?? []) {
    if (m === 'bold') out = <b>{out}</b>;
    else if (m === 'italic') out = <i>{out}</i>;
    else if (m === 'underline') out = <u>{out}</u>;
    else out = <code className="page-tt">{out}</code>;
  }
  return out;
}

export function PageView({ doc, chunks, revealed, base, world, isVisited, onNavigate, onHover }: PageViewProps) {
  const chunkOf: number[] = [];
  chunks.forEach((c, i) => c.blocks.forEach((b) => (chunkOf[b] = i)));
  const theme = doc.theme ?? {};
  const background = theme.backgroundAssetId ? assetUrl(theme.backgroundAssetId) : null;
  const style = {
    '--page-bg': theme.background ?? (doc.layout === 'terminal' ? '#000000' : '#c0c0c0'),
    '--page-text': theme.text ?? (doc.layout === 'terminal' ? '#33ff33' : '#000000'),
    '--page-link': theme.link ?? '#0000ee',
    '--page-vlink': theme.visitedLink ?? '#551a8b',
    fontFamily: FONTS[theme.font ?? (doc.layout === 'terminal' ? 'mono' : 'serif')],
    ...(background ? { backgroundImage: `url("${background}")` } : {}),
  } as CSSProperties;

  const link = (href: string, children: ReactNode, key?: number | string) => (
    <a
      key={key}
      href="#"
      className={isVisited(href) ? 'page-visited' : undefined}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        onNavigate(href);
      }}
      onMouseEnter={() => onHover(href)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(href)}
      onBlur={() => onHover(null)}
    >
      {children}
    </a>
  );

  const inlines = (items: Inline[]) =>
    items.map((i, k) => (i.type === 'break' ? <br key={k} /> : i.type === 'link' ? link(i.href, marked(i.text, i.marks), k) : <span key={k}>{marked(i.text, i.marks)}</span>));

  const cell = (c: TableCell, k: number, header: boolean) => {
    const props = { colSpan: c.colspan, style: c.align ? { textAlign: c.align } : undefined };
    return header ? <th key={k} {...props}>{inlines(c.content)}</th> : <td key={k} {...props}>{inlines(c.content)}</td>;
  };

  const render = (block: Block, index: number): ReactNode => {
    const id = block.id ? `pg-${block.id}` : undefined;
    const align = 'align' in block && block.align ? { textAlign: block.align } : undefined;
    switch (block.type) {
      case 'heading': {
        const H = `h${block.level}` as 'h1';
        return <H key={index} id={id} style={align}>{block.text}</H>;
      }
      case 'paragraph':
        return <p key={index} id={id} style={align}>{inlines(block.content)}</p>;
      case 'link':
        return (
          <p key={index} id={id}>
            {link(block.href, block.text)}
            {block.description ? <> - {block.description}</> : null}
          </p>
        );
      case 'image': {
        const url = assetUrl(block.assetId);
        const img = url ? <img src={url} alt={block.alt} width={block.width} height={block.height} draggable={false} /> : <span className="page-image-missing" style={{ width: block.width, height: block.height }} role="img" aria-label={block.alt} />;
        return (
          <div key={index} id={id} className="page-image" style={align}>
            {block.href ? link(block.href, img) : img}
          </div>
        );
      }
      case 'list': {
        const L = block.ordered ? 'ol' : 'ul';
        return <L key={index} id={id}>{block.items.map((item, k) => <li key={k}>{inlines(item)}</li>)}</L>;
      }
      case 'rule':
        return <hr key={index} id={id} />;
      case 'table':
        return (
          <table key={index} id={id} className={block.border ? 'page-table page-bordered' : 'page-table'} style={block.border ? ({ '--page-border': `${block.border}px` } as CSSProperties) : undefined}>
            {block.caption ? <caption>{block.caption}</caption> : null}
            {block.header ? <thead><tr>{block.header.map((c, k) => cell(c, k, true))}</tr></thead> : null}
            <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((c, k) => cell(c, k, false))}</tr>)}</tbody>
          </table>
        );
      case 'preformatted':
        return <pre key={index} id={id} aria-label={block.label}>{block.text}</pre>;
      case 'widget':
        return (
          <div key={index} id={id} className="page-widget">
            <WidgetView widget={block.widget} world={world} renderLink={link} base={base} />
          </div>
        );
    }
  };

  const shown: ReactNode[] = [];
  doc.blocks.forEach((block, i) => {
    const chunk = chunkOf[i] ?? 0;
    if (chunk < revealed) shown.push(render(block, i));
    else if (chunk === revealed && block.type === 'image') {
      // The picture on its way: Netscape drew an empty frame at the declared size.
      shown.push(
        <div key={i} className="page-image" style={block.align ? { textAlign: block.align } : undefined}>
          <span className="page-image-pending" style={{ width: block.width, height: block.height }} role="img" aria-label={`${block.alt} (loading)`} />
        </div>,
      );
    }
  });

  return (
    <div className={`page page-${doc.layout}`} style={style} data-page={doc.pageId}>
      <div className="page-body">{shown}</div>
    </div>
  );
}
