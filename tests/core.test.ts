import { describe, expect, it } from 'vitest';
import { compareText } from '../src/core/compare';

const categories = (before: string, after: string) => compareText(before, after).findings.map((f) => f.category);

describe('comparison rules', () => {
  it('flags a tenfold revenue change with sentence context', () => {
    const report = compareText('营收2.3亿元。', '营收23亿元。');
    const finding = report.findings.find((f) => f.category === 'number');
    expect(finding).toMatchObject({ kind: 'changed', beforeSentence: '营收2.3亿元。', afterSentence: '营收23亿元。', beforeIndex: 0, afterIndex: 0 });
  });
  it('finds no changes in identical text', () => expect(compareText('今天有3名访客。', '今天有3名访客。').findings).toEqual([]));
  it('keeps equivalent Chinese magnitudes', () => expect(categories('营收2.3亿元。', '营收23000万元。')).not.toContain('number'));
  it('normalizes decimal amounts without float rounding', () => expect(categories('成本0.3亿元。', '成本3000万元。')).not.toContain('number'));
  it('keeps equivalent English magnitudes', () => expect(categories('Revenue was 2.3 billion dollars.', 'Revenue was 2300 million dollars.')).not.toContain('number'));
  it('handles grouping separators', () => expect(categories('Revenue was $1,250.50.', 'Revenue was $1250.50.')).not.toContain('number'));
  it('flags changed percentages', () => expect(categories('The rate is 12.5%.', 'The rate is 15%.')).toContain('number'));
  it('keeps equivalent Chinese percentages', () => expect(categories('成功率百分之12.5。', '成功率12.5%。')).not.toContain('number'));
  it('flags sign changes', () => expect(categories('增长率为-3%。', '增长率为3%。')).toContain('number'));
  it('does not confuse different currencies', () => expect(categories('Price is 20 USD.', 'Price is 20 EUR.')).toContain('number'));
  it('detects swapped amounts in one sentence', () => expect(categories('Adults: 5, children: 3.', 'Adults: 3, children: 5.')).toContain('number'));
  it('keeps changed numeric subjects visible when value order stays the same', () => {
    expect(compareText('The report records adults: 5 and children: 3.', 'The report records children: 5 and adults: 3.').findings)
      .toEqual(expect.arrayContaining([expect.objectContaining({ category: 'content', kind: 'changed' })]));
  });
  it('keeps swapped revenue and expense attribution visible', () => {
    expect(compareText('Revenue was $5 and expenses were $3.', 'Expenses were $5 and revenue was $3.').findings.length).toBeGreaterThan(0);
  });
  it('flags changed physical distance units even when the number stays the same', () => expect(categories('The travel distance is 2 km along the river.', 'The travel distance is 2 m along the river.')).toContain('number'));
  it('flags changed Chinese time units', () => expect(categories('等待时间为3秒。', '等待时间为3分钟。')).toContain('number'));
  it('keeps Chinese kilogram units equivalent to kg without double scaling', () => expect(compareText('该包裹总重量为2千克，已经完成复核。', '该包裹总重量为2kg，已经完成复核。').findings).toEqual([]));
  it('does not treat 2 Chinese kilograms as 2000 kg', () => expect(categories('该包裹总重量为2千克，已经完成复核。', '该包裹总重量为2000kg，已经完成复核。')).toContain('number'));
  it('keeps Chinese kilometre units equivalent to km without double scaling', () => expect(compareText('The travel distance is 2千米 along the river.', 'The travel distance is 2km along the river.').findings).toEqual([]));
  it('does not treat 2 Chinese kilometres as 2000 km', () => expect(categories('The travel distance is 2千米 along the river.', 'The travel distance is 2000km along the river.')).toContain('number'));
  it('flags Chinese dates separately from numbers', () => {
    const result = categories('发布日期为2026年7月1日。', '发布日期为2026年7月2日。');
    expect(result).toContain('date');
    expect(result).not.toContain('number');
  });
  it('keeps equivalent ISO and Chinese dates', () => expect(categories('发布日期为2026-07-01。', '发布日期为2026年7月1日。')).not.toContain('date'));
  it('detects English date changes', () => expect(categories('Launch is January 5, 2026.', 'Launch is January 6, 2026.')).toContain('date'));
  it('keeps equivalent English date forms', () => expect(categories('Launch is January 5, 2026.', 'Launch is 5 January 2026.')).not.toContain('date'));
  it('flags year-only Chinese date changes as dates', () => expect(categories('项目于2026年上线。', '项目于2027年上线。')).toContain('date'));
  it('flags ambiguous numeric date changes without guessing a locale', () => expect(categories('Launch date is 03/04/2026.', 'Launch date is 04/04/2026.')).toContain('date'));
  it('flags removed Chinese uncertainty', () => expect(categories('产品可能上线。', '产品上线。')).toContain('qualifier'));
  it('flags removed English negation', () => expect(categories('The server does not store your files.', 'The server stores your files.')).toContain('qualifier'));
  it.each(["isn't", "wasn't", "weren't", "shouldn't", "wouldn't", "couldn't", "hasn't", "haven't", 'isn’t'])('detects the removed contraction %s', (negative) => expect(categories('The server ' + negative + ' available during maintenance.', 'The server is available during maintenance.')).toContain('qualifier'));
  it('flags changed certainty', () => expect(categories('The project may launch.', 'The project will definitely launch.')).toContain('qualifier'));
  it('detects qualifier assignments swapped between subjects', () => expect(categories('Alpha may fail and Beta will pass.', 'Alpha will fail and Beta may pass.')).toContain('qualifier'));
  it('detects a negation moved to the other subject', () => expect(categories('Alpha is not ready and Beta is ready.', 'Alpha is ready and Beta is not ready.')).toContain('qualifier'));
  it('flags dropped approximate language', () => expect(categories('成本约3万元。', '成本3万元。')).toContain('qualifier'));
  it('flags reversed minimum and maximum bounds', () => expect(categories('最多5人参与。', '至少5人参与。')).toContain('qualifier'));
  it('keeps not-only constructions out of negation rules', () => expect(categories('产品不仅支持3个插件。', '产品不仅支持5个插件。')).not.toContain('qualifier'));
  it('keeps common equivalent approximate terms', () => expect(categories('Cost is about 30 dollars.', 'Cost is roughly 30 dollars.')).not.toContain('qualifier'));
  it('uses English word boundaries for negative words', () => expect(categories('The number is 3.', 'The number is 4.')).not.toContain('qualifier'));
  it('detects changed Markdown destination', () => expect(categories('See [guide](https://example.com/v1).', 'See [guide](https://example.com/v2).')).toContain('link'));
  it('detects bare URL changes without treating their path numbers as facts', () => {
    const result = categories('Visit https://example.com/v1.', 'Visit https://example.com/v2.');
    expect(result).toContain('link');
    expect(result).not.toContain('number');
  });
  it('detects a changed reference-link definition', () => expect(categories('[guide]: https://example.com/v1', '[guide]: https://example.com/v2')).toContain('link'));
  it('resolves a full reference link at its usage location', () => {
    const definitions = '\n[old]: https://example.com/old\n[new]: https://example.com/new';
    const finding = compareText('Use [API][old] for this operation.' + definitions, 'Use [API][new] for this operation.' + definitions).findings.find((f) => f.category === 'link');
    expect(finding?.beforeSentence).toBe('Use [API][old] for this operation.');
    expect(finding?.afterSentence).toBe('Use [API][new] for this operation.');
  });
  it('resolves changed collapsed reference links', () => {
    const definitions = '\n[old]: https://example.com/old\n[new]: https://example.com/new';
    expect(categories('Use [old][] now.' + definitions, 'Use [new][] now.' + definitions)).toContain('link');
  });
  it('resolves shortcut references only when their definitions exist', () => {
    const definitions = '\n[old]: https://example.com/old\n[new]: https://example.com/new';
    expect(categories('Use [old] now.' + definitions, 'Use [new] now.' + definitions)).toContain('link');
    expect(categories('Remember [important] notes.', 'Remember [essential] notes.')).not.toContain('link');
  });
  it.each(['[3 users][]', '[3 users]'])('checks visible numeric text in reference usage %s', (usage) => {
    const definitions = '\n[3 users]: https://example.com/users\n[5 users]: https://example.com/users';
    expect(categories('We have ' + usage + ' active today.' + definitions, 'We have ' + usage.replace('3', '5') + ' active today.' + definitions)).toContain('number');
  });
  it('checks visible negation in a collapsed reference label', () => {
    const definitions = '\n[not available]: https://example.com/status\n[available]: https://example.com/status';
    expect(categories('The server is [not available][] today.' + definitions, 'The server is [available][] today.' + definitions)).toContain('qualifier');
  });
  it('does not treat renamed reference metadata as visible numeric facts', () => {
    expect(compareText('Use [guide][v1].\n[v1]: https://example.com/guide', 'Use [guide][v2].\n[v2]: https://example.com/guide').findings).toEqual([]);
  });
  it('protects a URL with inline code in its link label', () => {
    const result = categories('Use [\x60API\x60](https://example.com/v1).', 'Use [\x60API\x60](https://example.com/v2).');
    expect(result).toContain('link');
    expect(result).not.toContain('number');
  });
  it('keeps inline code in a link label as code without numeric duplication', () => {
    const result = categories('Use [\x60retry(3)\x60](https://example.com/v1).', 'Use [\x60retry(5)\x60](https://example.com/v1).');
    expect(result).toContain('code');
    expect(result).not.toContain('number');
  });
  it('keeps a balanced-parenthesis link intact', () => expect(categories('See [guide](https://example.com/a_(b)).', 'See [guide](https://example.com/a_(b)).')).not.toContain('link'));
  it('detects changed inline code without duplicating numeric findings', () => {
    const result = categories('Use `retry(3)` for retries.', 'Use `retry(5)` for retries.');
    expect(result).toContain('code'); expect(result).not.toContain('number');
  });
  it('detects changed fenced code as one segment', () => {
    const report = compareText('```js\nconst retry = 3;\n```', '```js\nconst retry = 5;\n```');
    expect(report.findings.some((f) => f.category === 'code')).toBe(true);
    expect(report.stats.originalSentences).toBe(1);
  });
  it('keeps LF and CRLF fenced documents equivalent without swallowing following text', () => {
    const original = '\x60\x60\x60js\nconst retry = 3;\n\x60\x60\x60\nThe limit is 5.';
    const revised = original.replace(/\n/g, '\r\n');
    const report = compareText(original, revised);
    expect(report.stats.originalSentences).toBe(2);
    expect(report.stats.revisedSentences).toBe(2);
    expect(report.findings).toEqual([]);
  });
  it('does not mistake sentence reordering for factual changes', () => expect(compareText('营收3亿元。访客有5人。', '访客有5人。营收3亿元。').findings).toEqual([]));
  it('splits English sentences without splitting decimal values', () => {
    const report = compareText('Price is 2.5 dollars. It may increase.', 'Price is 25 dollars. It may increase.');
    expect(report.stats.originalSentences).toBe(2);
    expect(report.findings.filter((f) => f.category === 'number')).toHaveLength(1);
  });
  it('reports unmatched deleted and added content without inventing numeric alignment', () => {
    const report = compareText('昨日晴朗，有3只鸟。', '仓库完成构建，共5个模块。');
    expect(report.findings.filter((f) => f.category === 'content').map((f) => f.kind)).toEqual(expect.arrayContaining(['removed', 'added']));
    expect(report.findings.some((f) => f.category === 'number')).toBe(false);
  });
  it('keeps added paragraphs visible', () => expect(compareText('Revenue is stable.', 'Revenue is stable. A new office opened.').findings).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'content', kind: 'added', afterSentence: 'A new office opened.' })])));
  it('marks duplicate and ambiguous sentence matches for review', () => {
    const report = compareText('订单1已发货。订单2已发货。', '订单3已发货。订单4已发货。');
    expect(report.findings.some((f) => f.category === 'alignment')).toBe(true);
    expect(report.findings.some((f) => f.category === 'content')).toBe(true);
    expect(report.findings.some((f) => f.category === 'number')).toBe(false);
  });
  it('marks repeated exact segments rather than silently choosing one', () => expect(categories('重复句。重复句。结束。', '结束。重复句。重复句。')).toContain('alignment'));
  it('handles empty text and still reports added content', () => {
    expect(compareText('', '').findings).toEqual([]);
    expect(compareText('', '新内容。').findings).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'content', kind: 'added' })]));
  });
  it('rejects more than 50000 characters on either side', () => {
    expect(() => compareText('文'.repeat(50001), '')).toThrow(/50000|50,000/);
    expect(() => compareText('', '文'.repeat(50001))).toThrow(/50000|50,000/);
  });
  it('accepts exactly 50000 characters', () => expect(() => compareText('文'.repeat(50000), '文'.repeat(50000))).not.toThrow());
  it('rejects more than 300 sentence segments on either side', () => {
    expect(() => compareText('句子。'.repeat(301), '')).toThrow(/300/);
    expect(() => compareText('', 'Sentence. '.repeat(301))).toThrow(/300/);
  });
  it('accepts exactly 300 sentences', () => expect(compareText('句子。'.repeat(300), '句子。'.repeat(300)).stats.originalSentences).toBe(300));
  it('compares large precise integers without rounding them together', () => expect(categories('订单号为9007199254740992。', '订单号为9007199254740993。')).toContain('number'));
  it('returns stable finding IDs when comparing the same document again', () => {
    const first = compareText('营收3亿元。', '营收5亿元。');
    const second = compareText('营收3亿元。', '营收5亿元。');
    expect(first.findings.map((f) => f.id)).toEqual(second.findings.map((f) => f.id));
  });
});
