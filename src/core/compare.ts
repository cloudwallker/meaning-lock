import { MAX_CHARS } from './constants';
import type { Category, Finding, Report } from './types';
import { extractReferences, splitSentences } from './segments';
import { sentenceFeatures } from './features';
import { alignSentences } from './alignment';

export function compareText(original: string, revised: string): Report {
  if (original.length > MAX_CHARS || revised.length > MAX_CHARS) {
    throw new RangeError('Text exceeds the ' + MAX_CHARS + ' character limit.');
  }
  const before = splitSentences(original);
  const after = splitSentences(revised);
  const findings: Finding[] = [];
  const report: Report = {
    version: 1, original, revised, findings,
    stats: { originalSentences: before.length, revisedSentences: after.length, alignedSentences: 0 },
    generatedAt: new Date().toISOString(),
  };
  if (original === revised) { report.stats.alignedSentences = before.length; return report; }
  const beforeReferences = extractReferences(original);
  const afterReferences = extractReferences(revised);
  const left = before.map((sentence) => sentenceFeatures(sentence, beforeReferences));
  const right = after.map((sentence) => sentenceFeatures(sentence, afterReferences));
  const alignment = alignSentences(before, after, left, right);
  const add = (category: Category, beforeIndex: number | null, afterIndex: number | null, beforeValue: string, afterValue: string, ambiguous = false) => {
    findings.push({
      id: 'f' + (findings.length + 1), category,
      kind: ambiguous ? 'ambiguous' : !beforeValue ? 'added' : !afterValue ? 'removed' : 'changed',
      before: beforeValue, after: afterValue,
      beforeSentence: beforeIndex === null ? '' : before[beforeIndex],
      afterSentence: afterIndex === null ? '' : after[afterIndex],
      beforeIndex, afterIndex,
    });
  };
  const categories = ['number', 'date', 'qualifier', 'link', 'code'] as const;
  for (const [i, j] of alignment.pairs) {
    const previousCount = findings.length;
    for (const category of categories) {
      const old = left[i][category];
      const next = right[j][category];
      // Numeric order is preserved: swapping two values can change which subject they describe.
      const oldKeys = old.map((t) => t.key);
      const nextKeys = next.map((t) => t.key);
      // When wording is otherwise identical, moving a qualifier can change its subject.
      const movedQualifier = category === 'qualifier' && left[i].contextSkeleton === right[j].contextSkeleton
        && JSON.stringify(old.map((t) => t.anchor)) !== JSON.stringify(next.map((t) => t.anchor));
      if (JSON.stringify(oldKeys) !== JSON.stringify(nextKeys) || movedQualifier) {
        add(category, i, j, old.map((t) => t.raw).join(' · '), next.map((t) => t.raw).join(' · '));
      }
    }
    const hasFacts = categories.some((category) => left[i][category].length || right[j][category].length);
    if (findings.length === previousCount && hasFacts && left[i].contextSkeleton !== right[j].contextSkeleton) {
      // Equal token lists cannot establish that those facts still describe the same subjects.
      add('content', i, j, before[i], after[j]);
    }
  }
  for (const [i, j] of alignment.ambiguous) add('alignment', i, j, before[i], after[j], true);
  for (const i of alignment.missingBefore) add('content', i, null, before[i], '');
  for (const j of alignment.missingAfter) add('content', null, j, '', after[j]);
  report.stats.alignedSentences = alignment.pairs.length;
  return report;
}
