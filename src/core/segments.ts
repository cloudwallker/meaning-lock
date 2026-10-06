import { MAX_SENTENCES } from './constants';

export interface ProtectedSpan {
  start: number;
  end: number;
  kind: 'fence' | 'inline' | 'link';
  raw: string;
  key: string;
  label: string;
  definition?: boolean;
  nestedCode?: ProtectedSpan[];
}

export function protectedSpans(text: string, references?: ReadonlyMap<string, string>): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];
  const localReferences = new Map<string, string>();
  const addLink = (span: ProtectedSpan) => {
    const nested = spans.filter((child) => child.kind === 'inline' && child.start >= span.start && child.end <= span.end);
    for (let i = spans.length - 1; i >= 0; i--) if (nested.includes(spans[i])) spans.splice(i, 1);
    span.nestedCode = span.definition ? [] : nested;
    spans.push(span);
  };
  const occupied = (index: number) => spans.some((span) => index >= span.start && index < span.end);
  const fence = /(^|\n)[ \t]{0,3}(\x60{3,}|~{3,})[^\n]*(?:\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text))) {
    if (occupied(match.index + match[1].length)) continue;
    const start = match.index + match[1].length;
    const marker = match[2][0];
    const close = new RegExp('(?:^|\\n)[ \\t]{0,3}' + marker + '{' + match[2].length + ',}[ \\t]*(?=\\r?\\n|$)', 'g');
    close.lastIndex = fence.lastIndex;
    const ending = close.exec(text);
    const end = ending ? ending.index + ending[0].length : text.length;
    const raw = text.slice(start, end);
    spans.push({ start, end, kind: 'fence', raw, key: raw.replace(/\r\n/g, '\n'), label: '' });
    fence.lastIndex = end;
  }
  const inline = /(\x60+)([\s\S]*?)\1(?!\x60)/g;
  while ((match = inline.exec(text))) {
    if (occupied(match.index)) continue;
    spans.push({ start: match.index, end: inline.lastIndex, kind: 'inline', raw: match[0], key: match[2], label: '' });
  }
  const linkStart = /!?\[([^\]\n]*)\]\(/g;
  while ((match = linkStart.exec(text))) {
    if (occupied(match.index)) continue;
    let depth = 1;
    let end = linkStart.lastIndex;
    for (; end < text.length && depth > 0; end++) {
      if (text[end] === '\\') { end++; continue; }
      if (text[end] === '(') depth++;
      if (text[end] === ')') depth--;
      if (text[end] === '\n') break;
    }
    if (depth !== 0) continue;
    const target = text.slice(linkStart.lastIndex, end - 1).trim();
    const key = target.startsWith('<') ? target.slice(1, target.indexOf('>')) : target.split(/\s+["']/)[0];
    addLink({ start: match.index, end, kind: 'link', raw: text.slice(match.index, end), key, label: match[1] });
    linkStart.lastIndex = end;
  }
  const definition = /^[ \t]{0,3}\[([^\]\n]+)\]:[ \t]*(<[^>\n]+>|[^\s\n]+)[^\n]*/gm;
  while ((match = definition.exec(text))) {
    if (occupied(match.index)) continue;
    const key = match[2].replace(/^<|>$/g, '');
    localReferences.set(referenceId(match[1]), key);
    addLink({ start: match.index, end: definition.lastIndex, kind: 'link', raw: match[0], key, label: match[1], definition: true });
  }
  const knownReferences = references ?? localReferences;
  const fullReference = /!?\[([^\]\n]+)\][ \t]*\[([^\]\n]*)\]/g;
  while ((match = fullReference.exec(text))) {
    if (occupied(match.index)) continue;
    const key = knownReferences.get(referenceId(match[2] || match[1]));
    if (key === undefined) continue;
    addLink({ start: match.index, end: fullReference.lastIndex, kind: 'link', raw: match[0], key, label: match[1] });
  }
  const shortcut = /!?\[([^\]\n]+)\](?![\[(])/g;
  while ((match = shortcut.exec(text))) {
    if (occupied(match.index)) continue;
    const key = knownReferences.get(referenceId(match[1]));
    if (key === undefined) continue;
    addLink({ start: match.index, end: shortcut.lastIndex, kind: 'link', raw: match[0], key, label: match[1] });
  }
  const bare = /https?:\/\/[^\s<>"'\x60]+/gi;
  while ((match = bare.exec(text))) {
    if (occupied(match.index)) continue;
    let target = match[0].replace(/[.,;!，。；！、]+$/g, '');
    while (target.endsWith(')') && (target.match(/\)/g)?.length ?? 0) > (target.match(/\(/g)?.length ?? 0)) target = target.slice(0, -1);
    while (/[}\]]$/.test(target)) target = target.slice(0, -1);
    if (target.length > 8) addLink({ start: match.index, end: match.index + target.length, kind: 'link', raw: target, key: target, label: '' });
  }
  return spans.sort((a, b) => a.start - b.start);
}

function referenceId(label: string): string { return label.trim().toLowerCase().replace(/\s+/g, ' '); }

export function extractReferences(text: string): ReadonlyMap<string, string> {
  return new Map(protectedSpans(text).filter((span) => span.definition).map((span) => [referenceId(span.label), span.key]));
}

export function replaceSpans(text: string, spans: ProtectedSpan[], replacement: (span: ProtectedSpan) => string): string {
  let result = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    result += text.slice(cursor, span.start) + replacement(span);
    cursor = span.end;
  }
  return result + text.slice(cursor);
}

export function splitSentences(text: string): string[] {
  const spans = protectedSpans(text);
  const sentences: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    sentences.push(trimmed);
    if (sentences.length > MAX_SENTENCES) throw new RangeError('Text exceeds the ' + MAX_SENTENCES + ' sentence limit.');
  };
  let start = 0;
  let spanIndex = 0;
  for (let i = 0; i < text.length; i++) {
    while (spanIndex < spans.length && spans[spanIndex].end <= i) spanIndex++;
    const span = spans[spanIndex];
    if (span && i === span.start) {
      if (span.kind === 'fence') {
        push(text.slice(start, i));
        push(text.slice(i, span.end));
        start = span.end;
      }
      i = span.end - 1;
      continue;
    }
    const char = text[i];
    let boundary = /[。！？!?]/.test(char) || char === '\n' || char === '\r';
    if (char === '.') {
      const decimal = /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '');
      const interior = /[a-z]/i.test(text[i - 1] ?? '') && /[a-z]/i.test(text[i + 1] ?? '');
      const prefix = text.slice(Math.max(start, i - 8), i);
      const abbreviation = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|e\.g|i\.e)$/i.test(prefix);
      boundary = !decimal && !interior && !abbreviation;
    }
    if (boundary) {
      let end = i + 1;
      while (end < text.length && /[。！？!?."'”’）)]/.test(text[end])) end++;
      push(text.slice(start, end));
      start = end;
      i = end - 1;
    }
  }
  push(text.slice(start));
  return sentences;
}
