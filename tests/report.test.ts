import { describe, expect, it } from 'vitest';
import { compareText } from '../src/core/compare';
import { renderReportHtml, serializeReport } from '../src/core/report';
import type { Report } from '../src/core/types';

const reviewFixture: Report = {
  version: 1, original: '访客有3人。', revised: '访客有5人。', generatedAt: '2026-10-06T10:00:00.000Z',
  stats: { originalSentences: 1, revisedSentences: 1, alignedSentences: 1 },
  findings: [{ id: 'f1', category: 'number', kind: 'changed', before: '3人', after: '5人', beforeSentence: '访客有3人。', afterSentence: '访客有5人。', beforeIndex: 0, afterIndex: 0 }],
};

describe('report exports', () => {
  it('preserves texts and attaches reviewed state only to actual finding IDs', () => {
    const report = reviewFixture;
    const id = report.findings[0].id;
    const exported = JSON.parse(serializeReport(report, [id, 'nonexistent']));
    expect(exported.original).toBe('访客有3人。');
    expect(exported.revised).toBe('访客有5人。');
    expect(exported.findings[0].reviewed).toBe(true);
    expect(exported.reviewedIds).toEqual([id]);
    expect(report.findings[0]).not.toHaveProperty('reviewed');
  });
  it('marks pending findings in JSON and escapes no content away', () => {
    const report = reviewFixture;
    const exported = JSON.parse(serializeReport(report, []));
    expect(exported.findings[0].reviewed).toBe(false);
    expect(exported.findings[0].beforeSentence).toBe('访客有3人。');
  });
  it('escapes malicious original, revised and finding contents as inert HTML text', () => {
    const report = compareText('<script>alert(1)</script>价格3元。', '<img src=x onerror=alert(1)>价格5元。');
    const html = renderReportHtml(report, [], 'zh');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toMatch(/<script\b|<img\b|<iframe\b/i);
    expect(html).toContain('charset="utf-8"');
  });
  it('never makes dangerous link destinations active', () => {
    const report = compareText('Read [link](javascript:alert(1)).', 'Read [link](data:text/html,<script>alert(1)</script>).');
    const html = renderReportHtml(report, [], 'en');
    expect(html).not.toMatch(/href="(?:javascript:|data:)/i);
    expect(html).not.toMatch(/<script\b/i);
  });
  it('includes reviewed state and English report labels', () => {
    const report = reviewFixture;
    const html = renderReportHtml(report, [report.findings[0].id], 'en');
    expect(html).toContain('lang="en"');
    expect(html).toContain('Reviewed');
    expect(html).toContain('Original');
    expect(html).toContain('Revised');
  });
  it('explains that zero findings only mean no supported rule was hit', () => {
    const report = compareText('相同内容。', '相同内容。');
    expect(renderReportHtml(report, [], 'zh')).toMatch(/规则/);
    expect(renderReportHtml(report, [], 'en')).toMatch(/rules/i);
  });
});
