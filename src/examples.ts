import type { Locale } from './core/types';

export interface Example {
  id: string;
  label: Record<Locale, string>;
  original: string;
  revised: string;
}

export const examples: Example[] = [
  {
    id: 'financial',
    label: { zh: '财务摘要 · 数量级与确定性', en: 'Financial summary · magnitude & certainty' },
    original: '2026年3月，项目营收约2.3亿元，同比增长12%。由于样本有限，这一增长可能无法持续。数据将在2026年4月15日复核。',
    revised: '2026年3月，项目营收达到23亿元，同比增长12%。这一增长将持续。数据将在2026年4月18日复核。',
  },
  {
    id: 'product',
    label: { zh: 'English 产品说明 · 条件与否定', en: 'Product description · conditions & negation' },
    original: 'The beta supports up to 12 projects. Offline mode is not available on Linux. A workspace may be shared with invited members. The trial ends on 2026-10-20.',
    revised: 'The beta supports 20 projects. Offline mode is available on Linux. A workspace will be shared with invited members. The trial ends on 2026-10-20.',
  },
  {
    id: 'technical',
    label: { zh: '技术文档 · 链接与代码', en: 'Technical documentation · links & code' },
    original: 'Send a request to `/v1/events` with `timeout: 30`. Do not log access tokens. See the [API guide](https://example.com/docs/v1). Requests are limited to 100 per minute.',
    revised: 'Send a request to `/v2/events` with `timeout: 300`. Log access tokens. See the [API guide](https://example.com/docs/v2). Requests are limited to 100 per minute.',
  },
  {
    id: 'equivalent',
    label: { zh: '等值与重排 · 无需改动的事实', en: 'Equivalent units & reordered facts' },
    original: '项目预算为2.3亿元。发布日期为2026年10月6日。团队目前有12人。',
    revised: '团队目前有12人。项目预算为23000万元。发布日期为2026年10月6日。',
  },
];
