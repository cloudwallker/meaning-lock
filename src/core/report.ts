import type { Locale, Report } from './types';

function exportData(report: Report, reviewedIds: readonly string[]) {
  const reviewed = new Set(reviewedIds);
  return {
    ...report,
    findings: report.findings.map((finding) => ({ ...finding, reviewed: reviewed.has(finding.id) })),
    reviewedIds: report.findings.filter((finding) => reviewed.has(finding.id)).map((finding) => finding.id),
  };
}

export function serializeReport(report: Report, reviewedIds: readonly string[]): string {
  return JSON.stringify(exportData(report, reviewedIds), null, 2);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

const words = {
  zh: {
    title: 'Meaning Lock 审阅报告', original: '原文', revised: '改稿', findings: '发现', reviewed: '已确认', pending: '待复核',
    scope: '规则覆盖数字、日期、限定词、链接、代码及内容对齐。零条命中表示这些规则未发现变化，请结合上下文完成语义复核。',
    empty: '没有规则命中。', categories: { number: '数字', date: '日期', qualifier: '限定词', link: '链接', code: '代码', content: '内容', alignment: '对齐' },
    kinds: { changed: '变化', added: '新增', removed: '删除', ambiguous: '对齐待复核' },
  },
  en: {
    title: 'Meaning Lock review report', original: 'Original', revised: 'Revised', findings: 'Findings', reviewed: 'Reviewed', pending: 'Pending review',
    scope: 'Rules cover numbers, dates, qualifiers, links, code and content alignment. Zero findings means these rules found no differences. Review the context to make the final meaning judgment.',
    empty: 'No rules matched a change.', categories: { number: 'Number', date: 'Date', qualifier: 'Qualifier', link: 'Link', code: 'Code', content: 'Content', alignment: 'Alignment' },
    kinds: { changed: 'Changed', added: 'Added', removed: 'Removed', ambiguous: 'Alignment needs review' },
  },
};

export function renderReportHtml(report: Report, reviewedIds: readonly string[], locale: Locale): string {
  const labels = words[locale];
  const data = exportData(report, reviewedIds);
  const count = data.reviewedIds.length;
  const cards = data.findings.map((finding) => [
    '<article class="finding"><div class="meta"><strong>', escapeHtml(labels.categories[finding.category]),
    '</strong><span>', escapeHtml(labels.kinds[finding.kind]), '</span><span class="state">',
    finding.reviewed ? labels.reviewed : labels.pending,
    '</span></div><div class="columns"><section><h3>', labels.original, '</h3><pre>',
    escapeHtml(finding.beforeSentence), '</pre><p class="token">', escapeHtml(finding.before),
    '</p></section><section><h3>', labels.revised, '</h3><pre>', escapeHtml(finding.afterSentence),
    '</pre><p class="token">', escapeHtml(finding.after), '</p></section></div></article>',
  ].join('')).join('\n');
  return [
    '<!doctype html><html lang="' + locale + '"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">',
    '<title>', labels.title, '</title><style>',
    ':root{font-family:system-ui,sans-serif;color:#20312c;background:#f5f7f5}*{box-sizing:border-box}body{max-width:1100px;margin:0 auto;padding:32px}h1{font-size:1.7rem}h2{font-size:1.2rem}h3{font-size:.95rem;color:#52645d}.scope{line-height:1.6;color:#52645d}.columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{min-width:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.65}.document,.finding{background:white;border:1px solid #d3ddd7;border-radius:10px;padding:20px;margin:18px 0}.meta{display:flex;gap:14px;flex-wrap:wrap}.state{margin-left:auto;color:#30644f}.token{white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;background:#f0f4f0;border-radius:5px}footer{color:#52645d;margin-top:24px}@media(max-width:650px){body{padding:16px}.columns{grid-template-columns:1fr}.state{margin-left:0}}@media print{body{padding:0;background:white}.finding{break-inside:avoid}}',
    '</style></head><body><h1>', labels.title, '</h1><p class="scope">', labels.scope,
    '</p><p>', labels.findings, ': ', String(data.findings.length), ' · ', labels.reviewed, ': ', String(count),
    '</p><div class="document columns"><section><h2>', labels.original, '</h2><pre>', escapeHtml(report.original),
    '</pre></section><section><h2>', labels.revised, '</h2><pre>', escapeHtml(report.revised),
    '</pre></section></div><h2>', labels.findings, '</h2>',
    cards || '<p>' + labels.empty + '</p>',
    '<footer>', escapeHtml(report.generatedAt), '</footer></body></html>',
  ].join('');
}
