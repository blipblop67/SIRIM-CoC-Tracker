import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
// The manual lives in one place: USER_MANUAL.md at the repository root.
import manualText from '../../USER_MANUAL.md?raw';

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Kept for compatibility with App.tsx; the manual no longer needs them.
  onOpenGmailScan?: () => void;
  onOpenAutomation?: () => void;
  onOpenPreScreen?: () => void;
  onOpenNewApp?: () => void;
}

// ---------------------------------------------------------------------------
// Minimal Markdown renderer for the subset USER_MANUAL.md uses:
// headings, paragraphs, bullet / numbered lists (one level of nesting), tables,
// code blocks, block quotes, horizontal rules, **bold**, `code` and [links](url).
// ---------------------------------------------------------------------------

type Block =
  | { kind: 'h'; level: number; text: string; id: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: { text: string; children: string[] }[] }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' };

const slug = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  const isListLine = (l: string) => /^\s*(-|\d+\.)\s+/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', text: buf.join('\n') });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length, text: h[2], id: slug(h[2]) });
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ kind: 'quote', text: buf.join(' ') });
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push({ kind: 'table', header: rows[0] || [], rows: rows.slice(1) });
      continue;
    }
    if (isListLine(line) && !/^\s/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: { text: string; children: string[] }[] = [];
      while (i < lines.length && (isListLine(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const l = lines[i];
        if (/^\s{2,}/.test(l)) {
          items[items.length - 1].children.push(l.trim().replace(/^(-|\d+\.)\s+/, ''));
        } else {
          items.push({ text: l.replace(/^(-|\d+\.)\s+/, ''), children: [] });
        }
        i++;
      }
      blocks.push({ kind: ordered ? 'ol' : 'ul', items });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|>|\||```|---)/.test(lines[i]) && !isListLine(lines[i])) {
      buf.push(lines[i++]);
    }
    blocks.push({ kind: 'p', text: buf.join(' ') });
  }
  return blocks;
}

/** Inline formatting: **bold**, `code`, [text](url). */
function Inline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) parts.push(<strong key={k++} className="font-semibold text-slate-900">{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`'))
      parts.push(
        <code key={k++} className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-mono text-[0.85em] break-all">
          {t.slice(1, -1)}
        </code>
      );
    else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      parts.push(
        <a key={k++} href={lm[2]} target="_blank" rel="noreferrer" className="text-blue-600 underline">
          {lm[1]}
        </a>
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export const UserManualModal: React.FC<UserManualModalProps> = ({ isOpen, onClose }) => {
  const blocks = useMemo(() => parseMarkdown(manualText), []);
  // Contents list: the two parts and their sections (the document title itself is skipped).
  const toc = useMemo(
    () => blocks.filter((b, i): b is Extract<Block, { kind: 'h' }> => b.kind === 'h' && b.level <= 2 && i > 0),
    [blocks]
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string>('');

  if (!isOpen) return null;

  const jumpTo = (id: string) => {
    const el = scrollRef.current?.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
      setActiveId(id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Getting Started & User Manual</h2>
              <p className="text-xs text-slate-500">SIRIM CoC Tracker</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav className="hidden md:block w-60 shrink-0 border-r border-slate-100 overflow-y-auto py-3 text-sm">
            {toc.map((h) => (
              <button
                key={h.id}
                onClick={() => jumpTo(h.id)}
                className={`block w-full text-left px-4 py-1.5 hover:bg-slate-50 ${
                  h.level === 1 ? 'font-semibold text-slate-900 mt-2' : 'pl-6 text-slate-600'
                } ${activeId === h.id ? 'text-blue-700 bg-blue-50/60' : ''}`}
              >
                {h.text.replace(/[`*]/g, '')}
              </button>
            ))}
          </nav>

          <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-5 sm:px-8 py-6 text-sm leading-relaxed text-slate-700">
            {blocks.map((b, idx) => {
              switch (b.kind) {
                case 'h': {
                  const cls =
                    b.level === 1
                      ? 'text-xl font-bold text-slate-900 mt-8 first:mt-0 mb-3'
                      : b.level === 2
                      ? 'text-base font-bold text-slate-900 mt-7 mb-2'
                      : 'text-sm font-semibold text-slate-900 mt-5 mb-1.5';
                  return (
                    <div key={idx} id={b.id} className={cls}>
                      <Inline text={b.text} />
                    </div>
                  );
                }
                case 'p':
                  return (
                    <p key={idx} className="my-2.5">
                      <Inline text={b.text} />
                    </p>
                  );
                case 'ul':
                case 'ol': {
                  const List = b.kind === 'ul' ? 'ul' : 'ol';
                  return (
                    <List key={idx} className={`my-2.5 pl-5 space-y-1 ${b.kind === 'ul' ? 'list-disc' : 'list-decimal'}`}>
                      {b.items.map((it, j) => (
                        <li key={j}>
                          <Inline text={it.text} />
                          {it.children.length > 0 && (
                            <ul className="list-[circle] pl-5 mt-1 space-y-0.5">
                              {it.children.map((c, n) => (
                                <li key={n}>
                                  <Inline text={c} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </List>
                  );
                }
                case 'table':
                  return (
                    <div key={idx} className="my-3 overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            {b.header.map((c, j) => (
                              <th key={j} className="text-left font-semibold text-slate-800 px-3 py-2 border-b border-slate-200">
                                <Inline text={c} />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {b.rows.map((r, j) => (
                            <tr key={j} className="border-b border-slate-100 last:border-0 align-top">
                              {r.map((c, n) => (
                                <td key={n} className="px-3 py-2">
                                  <Inline text={c} />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                case 'code':
                  return (
                    <pre key={idx} className="my-3 bg-slate-900 text-slate-100 rounded-lg px-4 py-3 text-xs overflow-x-auto">
                      {b.text}
                    </pre>
                  );
                case 'quote':
                  return (
                    <div key={idx} className="my-3 border-l-4 border-amber-400 bg-amber-50 rounded-r-lg px-4 py-2.5 text-slate-800">
                      <Inline text={b.text} />
                    </div>
                  );
                case 'hr':
                  return <hr key={idx} className="my-6 border-slate-200" />;
              }
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserManualModal;
