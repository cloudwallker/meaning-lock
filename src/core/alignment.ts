import type { SentenceFeatures } from './features';

export interface Alignment {
  pairs: [number, number][];
  ambiguous: [number, number][];
  missingBefore: number[];
  missingAfter: number[];
}

function exactKey(sentence: string): string { return sentence.replace(/\s+/g, ' ').trim(); }
function similarity(left: SentenceFeatures, right: SentenceFeatures): number {
  if (!left.skeleton || !right.skeleton) return 0;
  if (left.skeleton === right.skeleton) return 1;
  let intersection = 0;
  for (const gram of left.grams) if (right.grams.has(gram)) intersection++;
  return (2 * intersection) / (left.grams.size + right.grams.size);
}

export function alignSentences(before: string[], after: string[], left: SentenceFeatures[], right: SentenceFeatures[]): Alignment {
  const pairs: [number, number][] = [];
  const ambiguous: [number, number][] = [];
  const usedBefore = new Set<number>();
  const usedAfter = new Set<number>();
  const beforeGroups = new Map<string, number[]>();
  const afterGroups = new Map<string, number[]>();
  before.forEach((sentence, index) => { const key = exactKey(sentence); beforeGroups.set(key, [...(beforeGroups.get(key) ?? []), index]); });
  after.forEach((sentence, index) => { const key = exactKey(sentence); afterGroups.set(key, [...(afterGroups.get(key) ?? []), index]); });
  for (const [key, originals] of beforeGroups) {
    const revisions = afterGroups.get(key) ?? [];
    if (originals.length === 1 && revisions.length === 1) {
      pairs.push([originals[0], revisions[0]]); usedBefore.add(originals[0]); usedAfter.add(revisions[0]);
    } else if (revisions.length && (originals.length > 1 || revisions.length > 1)) {
      ambiguous.push([originals[0], revisions[0]]);
      // Exact repeated text is present, but its occurrence cannot be attributed reliably.
      const count = Math.min(originals.length, revisions.length);
      for (let i = 0; i < count; i++) { usedBefore.add(originals[i]); usedAfter.add(revisions[i]); }
    }
  }
  const remainingBefore = before.map((_, i) => i).filter((i) => !usedBefore.has(i));
  const remainingAfter = after.map((_, i) => i).filter((i) => !usedAfter.has(i));
  const scores = new Map<number, { index: number; score: number }[]>();
  const reverse = new Map<number, { index: number; score: number }[]>();
  for (const i of remainingBefore) {
    const list = remainingAfter.map((j) => ({ index: j, score: similarity(left[i], right[j]) })).sort((a, b) => b.score - a.score || a.index - b.index);
    scores.set(i, list);
    for (const candidate of list) reverse.set(candidate.index, [...(reverse.get(candidate.index) ?? []), { index: i, score: candidate.score }]);
  }
  for (const list of reverse.values()) list.sort((a, b) => b.score - a.score || a.index - b.index);
  for (const i of remainingBefore) {
    const list = scores.get(i)!;
    const best = list[0];
    if (!best || best.score < 0.4) continue;
    const competitors = reverse.get(best.index)!;
    const uniqueLeft = best.score - (list[1]?.score ?? 0) >= 0.12;
    const uniqueRight = competitors[0].index === i && best.score - (competitors[1]?.score ?? 0) >= 0.12;
    if (best.score >= 0.72 && uniqueLeft && uniqueRight) {
      pairs.push([i, best.index]); usedBefore.add(i); usedAfter.add(best.index);
    } else {
      ambiguous.push([i, best.index]);
    }
  }
  return {
    pairs: pairs.sort((a, b) => a[0] - b[0]),
    ambiguous,
    missingBefore: before.map((_, i) => i).filter((i) => !usedBefore.has(i)),
    missingAfter: after.map((_, i) => i).filter((i) => !usedAfter.has(i)),
  };
}
