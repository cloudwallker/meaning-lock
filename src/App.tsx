import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react';
import { MAX_CHARS } from './core/constants';
import { serializeReport, renderReportHtml } from './core/report';
import type { Category, Finding, Locale, Report } from './core/types';
import { runComparison } from './runner';
import { examples } from './examples';
import { categoryLabels, kindLabels, messages } from './i18n';
import './styles.css';

type Side = 'original' | 'revised';
type IconName = 'lock' | 'upload' | 'check' | 'download' | 'clear' | 'compare';
type MessageKey = keyof typeof messages.zh;
const categories: Category[] = ['number', 'date', 'qualifier', 'link', 'code', 'content', 'alignment'];
const MAX_FILE_BYTES = 200 * 1024;

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    upload: <><path d="M12 16V3m-4 4 4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    download: <path d="M12 3v12m-4-4 4 4 4-4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />,
    clear: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
    compare: <><rect x="3" y="4" width="7" height="16" rx="2" /><rect x="14" y="4" width="7" height="16" rx="2" /><path d="M6 8h1m-1 4h1m10-4h1m-1 4h1" /></>,
  };
  return <svg className={`icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function HighlightedContext({ text, needle }: { text: string; needle: string }) {
  const at = needle ? text.indexOf(needle) : -1;
  if (at < 0) return <>{text || '—'}</>;
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + needle.length)}</mark>{text.slice(at + needle.length)}</>;
}

function FindingCard({ finding, ordinal, locale, reviewed, onReview }: {
  finding: Finding; ordinal: number; locale: Locale; reviewed: boolean; onReview: () => void;
}) {
  const t = messages[locale];
  return <article className={`finding-card ${reviewed ? 'is-reviewed' : ''}`} aria-labelledby={`finding-${finding.id}`}>
    <div className="finding-top">
      <div className="finding-heading" id={`finding-${finding.id}`}>
        <span className="finding-ordinal">{String(ordinal).padStart(2, '0')}</span>
        <span className={`category-tag category-${finding.category}`}>{categoryLabels[locale][finding.category]}</span>
        <span className="change-kind">{kindLabels[locale][finding.kind]}</span>
      </div>
      <label className="review-control">
        <input type="checkbox" checked={reviewed} onChange={onReview} aria-label={`${t.reviewAction} · ${ordinal}`} />
        <span>{reviewed ? t.reviewedAction : t.reviewAction}</span>
      </label>
    </div>
    <div className="change-preview" aria-label={`${t.before} / ${t.after}`}>
      <div><span className="change-symbol" aria-hidden="true">−</span><span>{finding.before || '—'}</span></div>
      <div><span className="change-symbol" aria-hidden="true">+</span><span>{finding.after || '—'}</span></div>
    </div>
    <div className="finding-contexts">
      <div className="context context-before"><div className="context-heading"><span>{t.before}</span><span>{finding.beforeIndex === null ? t.noSegment : `${t.segment} ${finding.beforeIndex + 1}`}</span></div><p><HighlightedContext text={finding.beforeSentence} needle={finding.before} /></p></div>
      <div className="context context-after"><div className="context-heading"><span>{t.after}</span><span>{finding.afterIndex === null ? t.noSegment : `${t.segment} ${finding.afterIndex + 1}`}</span></div><p><HighlightedContext text={finding.afterSentence} needle={finding.after} /></p></div>
    </div>
  </article>;
}

function download(text: string, type: string, extension: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `meaning-lock-report-${new Date().toISOString().slice(0, 10)}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [locale, setLocale] = useState<Locale>('zh');
  const [original, setOriginal] = useState('');
  const [revised, setRevised] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ key: MessageKey; detail?: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Side, MessageKey>>>({});
  const [importing, setImporting] = useState<Partial<Record<Side, boolean>>>({});
  const [fileNames, setFileNames] = useState<Partial<Record<Side, string>>>({});
  const [exampleId, setExampleId] = useState('');
  const [hasChanged, setHasChanged] = useState(false);
  const revision = useRef(0);
  const importRevision = useRef<Record<Side, number>>({ original: 0, revised: 0 });
  const originalInput = useRef<HTMLTextAreaElement>(null);
  const revisedInput = useRef<HTMLTextAreaElement>(null);
  const originalFile = useRef<HTMLInputElement>(null);
  const revisedFile = useRef<HTMLInputElement>(null);
  const t = messages[locale];

  useEffect(() => { document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'; }, [locale]);
  useEffect(() => () => { revision.current += 1; importRevision.current.original += 1; importRevision.current.revised += 1; }, []);

  function invalidate() {
    revision.current += 1;
    setHasChanged(Boolean(report) || loading || hasChanged);
    setReport(null);
    setReviewed(new Set());
    setCategory('all');
    setPendingOnly(false);
    setLoading(false);
    setError(null);
    setFieldErrors({});
  }

  function updateText(side: Side, value: string, fileName?: string) {
    importRevision.current[side] += 1;
    invalidate();
    if (side === 'original') setOriginal(value); else setRevised(value);
    setFileNames(current => ({ ...current, [side]: fileName }));
    setImporting(current => ({ ...current, [side]: false }));
    setExampleId('');
  }

  function loadExample(id: string) {
    const example = examples.find(item => item.id === id);
    if (!example) return;
    importRevision.current.original += 1;
    importRevision.current.revised += 1;
    invalidate();
    setOriginal(example.original);
    setRevised(example.revised);
    setFileNames({});
    setImporting({});
    setExampleId(id);
  }

  function clear() {
    importRevision.current.original += 1;
    importRevision.current.revised += 1;
    invalidate();
    setOriginal('');
    setRevised('');
    setFileNames({});
    setImporting({});
    setExampleId('');
    setHasChanged(false);
    originalInput.current?.focus();
  }

  async function importFile(side: Side, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = ++importRevision.current[side];
    invalidate();
    setImporting(current => ({ ...current, [side]: false }));
    if (!/\.(txt|md)$/i.test(file.name)) { setFieldErrors({ [side]: 'fileTypeError' }); return; }
    if (file.size > MAX_FILE_BYTES) { setFieldErrors({ [side]: 'fileSizeError' }); return; }
    setImporting(current => ({ ...current, [side]: true }));
    try {
      const bytes = await file.arrayBuffer();
      if (token !== importRevision.current[side]) return;
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { setFieldErrors(current => ({ ...current, [side]: 'fileEncodingError' })); return; }
      if (!text.trim()) { setFieldErrors(current => ({ ...current, [side]: 'fileEmptyError' })); return; }
      if (text.length > MAX_CHARS) { setFieldErrors(current => ({ ...current, [side]: 'limitError' })); return; }
      updateText(side, text, file.name);
    } catch {
      if (token === importRevision.current[side]) setFieldErrors(current => ({ ...current, [side]: 'fileReadError' }));
    } finally {
      if (token === importRevision.current[side]) setImporting(current => ({ ...current, [side]: false }));
    }
  }

  async function check() {
    if (loading || importing.original || importing.revised) return;
    const errors: Partial<Record<Side, MessageKey>> = {};
    if (!original.trim()) errors.original = 'emptyError'; else if (original.length > MAX_CHARS) errors.original = 'limitError';
    if (!revised.trim()) errors.revised = 'emptyError'; else if (revised.length > MAX_CHARS) errors.revised = 'limitError';
    setFieldErrors(errors);
    if (errors.original || errors.revised) { (errors.original ? originalInput : revisedInput).current?.focus(); return; }
    const token = ++revision.current;
    setLoading(true);
    setError(null);
    setReport(null);
    setReviewed(new Set());
    try {
      const result = await runComparison(original, revised);
      if (token !== revision.current) return;
      setReport(result);
      setHasChanged(false);
    } catch (cause) {
      if (token === revision.current) setError({ key: 'checkError', detail: cause instanceof Error && /(?:character|sentence) limit/.test(cause.message) ? 'limit' : undefined });
    } finally {
      if (token === revision.current) setLoading(false);
    }
  }

  function handleShortcut(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void check(); }
  }

  function exportReport(format: 'json' | 'html') {
    if (!report) return;
    try {
      const ids = Array.from(reviewed);
      if (format === 'json') download(serializeReport(report, ids), 'application/json;charset=utf-8', 'json');
      else download(renderReportHtml(report, ids, locale), 'text/html;charset=utf-8', 'html');
    } catch { setError({ key: 'exportError' }); }
  }

  function toggleReview(id: string) {
    setReviewed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  const filtered = useMemo(() => report?.findings.filter(finding => (category === 'all' || finding.category === category) && (!pendingOnly || !reviewed.has(finding.id))) ?? [], [report, category, pendingOnly, reviewed]);
  const counts = useMemo(() => { const next = Object.fromEntries(categories.map(item => [item, 0])) as Record<Category, number>; report?.findings.forEach(item => { next[item.category] += 1; }); return next; }, [report]);
  const total = report?.findings.length ?? 0;
  const remaining = total - reviewed.size;

  function editor(side: Side, value: string, ref: typeof originalInput, fileRef: typeof originalFile, ordinal: string) {
    const fieldError = fieldErrors[side];
    return <section className="editor-panel" aria-labelledby={`${side}-label`}>
      <div className="editor-heading"><label id={`${side}-label`} htmlFor={`${side}-text`}><span className="editor-number">{ordinal}</span>{t[side]}</label><button type="button" className="button button-quiet import-button" onClick={() => fileRef.current?.click()} disabled={Boolean(importing[side])} aria-label={`${t.import} · ${t[side]}`}><Icon name="upload" />{importing[side] ? t.importing : t.import}</button><input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" hidden onChange={event => void importFile(side, event)} /></div>
      <textarea ref={ref} id={`${side}-text`} value={value} onChange={event => updateText(side, event.target.value)} placeholder={side === 'original' ? t.originalPlaceholder : t.revisedPlaceholder} aria-describedby={`${side}-hint ${side}-count${fieldError ? ` ${side}-error` : ''}`} aria-invalid={Boolean(fieldError) || value.length > MAX_CHARS} spellCheck={false} />
      <div className="editor-footer"><span id={`${side}-hint`} className="file-hint" title={fileNames[side]}>{fileNames[side] || t.inputHint}</span><span id={`${side}-count`} className={value.length > MAX_CHARS ? 'over-limit' : ''}>{value.length.toLocaleString(locale)} / {MAX_CHARS.toLocaleString(locale)} <span className="character-word">{t.characters}</span></span></div>
      {fieldError && <p className="field-error" id={`${side}-error`} role="alert">{t[fieldError]}</p>}
    </section>;
  }

  return <div className="app-shell" onKeyDown={handleShortcut}>
    <header className="app-header"><a className="brand" href="#main-content" aria-label="Meaning Lock"><span className="brand-icon"><Icon name="lock" /></span><span>Meaning Lock<span className="brand-subtitle">{t.tagline}</span></span></a><div className="header-tools"><span className="local-badge"><span className="local-dot" />{t.local}</span><div className="locale-switch" role="group" aria-label={t.languageLabel}><button type="button" onClick={() => setLocale('zh')} aria-pressed={locale === 'zh'} lang="zh-CN">中文</button><button type="button" onClick={() => setLocale('en')} aria-pressed={locale === 'en'} lang="en">EN</button></div></div></header>
    <main id="main-content">
      <section className="intro"><div className="eyebrow">REWRITE. REVIEW. KEEP MEANING.</div><h1>{t.headline}</h1><p>{t.intro}</p></section>
      <section className="workspace" aria-label={t.tagline}>
        <div className="workspace-toolbar"><div className="example-control"><label htmlFor="example-select">{t.exampleLabel}</label><select id="example-select" value={exampleId} onChange={event => loadExample(event.target.value)}><option value="">{t.examplePlaceholder}</option>{examples.map(example => <option value={example.id} key={example.id}>{example.label[locale]}</option>)}</select></div><button type="button" className="button button-quiet clear-button" onClick={clear}><Icon name="clear" />{t.clear}</button></div>
        <div className="editor-grid">{editor('original', original, originalInput, originalFile, '01')}{editor('revised', revised, revisedInput, revisedFile, '02')}</div>
        <div className="workspace-actions"><p className="limit-hint">{t.charLimit}</p><div className="check-action"><span className="shortcut">{t.shortcut}</span><button type="button" className="button button-primary" onClick={() => void check()} disabled={loading || Boolean(importing.original || importing.revised)}>{loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="compare" />}{loading ? t.checking : t.check}</button></div></div>
      </section>
      <div className="live-feedback" aria-live="polite" aria-atomic="true">{loading ? t.checking : report ? `${t.findings}: ${total} · ${t.reviewed}: ${reviewed.size}` : hasChanged ? t.updated : ''}</div>
      {error && <div className="error-banner" role="alert"><strong>{t[error.key]}</strong>{error.detail && <p>{t.charLimit}</p>}</div>}
      <section className="results-section" aria-labelledby="results-heading" aria-busy={loading}>
        <div className="section-heading"><div><span className="eyebrow">REVIEW DESK</span><h2 id="results-heading">{t.results}{report && <span className="result-count">{total}</span>}</h2></div>{report && <div className="export-actions"><button className="button button-secondary" type="button" onClick={() => exportReport('json')}><Icon name="download" />{t.exportJson}</button><button className="button button-secondary" type="button" onClick={() => exportReport('html')}><Icon name="download" />{t.exportHtml}</button></div>}</div>
        {loading ? <div className="empty-state"><span className="spinner large-spinner" aria-hidden="true" /><h3>{t.loadingTitle}</h3></div> : !report ? <div className="empty-state"><span className="empty-icon"><Icon name="compare" /></span><h3>{t.emptyTitle}</h3><p>{t.emptyDescription}</p></div> : <>
          <div className="stats-grid"><div><span>{t.findings}</span><strong>{total}</strong></div><div><span>{t.pending}</span><strong>{remaining}</strong></div><div><span>{t.reviewed}</span><strong>{reviewed.size}</strong></div><div><span>{t.alignment}</span><strong>{report.stats.alignedSentences}<small> / {report.stats.originalSentences} → {report.stats.revisedSentences}</small></strong></div></div>
          <div className="filter-row"><div className="category-filters" role="group" aria-label={t.results}><button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>{t.all}<span>{total}</span></button>{categories.filter(item => counts[item] > 0).map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{categoryLabels[locale][item]}<span>{counts[item]}</span></button>)}</div><label className="pending-filter"><input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)} />{t.onlyPending}</label></div>
          {total > 0 && <div className={`review-summary ${remaining === 0 ? 'review-complete' : ''}`}>{remaining === 0 && <Icon name="check" />}<span>{remaining === 0 ? t.reviewedAll : t.reviewPrompt}</span><span className="review-ratio">{reviewed.size} / {total}</span><progress max={total} value={reviewed.size} aria-label={t.reviewed} /></div>}
          {total === 0 ? <div className="empty-state completed-empty"><span className="empty-icon success-icon"><Icon name="check" /></span><h3>{t.noFindingsTitle}</h3><p>{t.noFindingsDescription}</p></div> : filtered.length === 0 ? <div className="empty-state filtered-empty"><h3>{t.noFilteredTitle}</h3><p>{t.noFilteredDescription}</p></div> : <div className="findings-list">{filtered.map(finding => <FindingCard key={finding.id} finding={finding} ordinal={report.findings.indexOf(finding) + 1} locale={locale} reviewed={reviewed.has(finding.id)} onReview={() => toggleReview(finding.id)} />)}</div>}
        </>}
      </section>
      <details className="method-panel"><summary>{t.method}<span aria-hidden="true">＋</span></summary><div className="method-body"><p>{t.methodDescription}</p><p>{t.methodMeaning}</p><p className="privacy-note"><Icon name="lock" />{t.privacy}</p></div></details>
    </main><footer className="app-footer">{t.footer}</footer>
  </div>;
}
