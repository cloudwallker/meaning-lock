export type Locale = 'zh' | 'en';
export type Category = 'number' | 'date' | 'qualifier' | 'link' | 'code' | 'content' | 'alignment';
export type ChangeKind = 'changed' | 'added' | 'removed' | 'ambiguous';
export interface Finding {
  id: string;
  category: Category;
  kind: ChangeKind;
  before: string;
  after: string;
  beforeSentence: string;
  afterSentence: string;
  beforeIndex: number | null;
  afterIndex: number | null;
}
export interface Report {
  version: 1;
  original: string;
  revised: string;
  findings: Finding[];
  stats: { originalSentences: number; revisedSentences: number; alignedSentences: number };
  generatedAt: string;
}
