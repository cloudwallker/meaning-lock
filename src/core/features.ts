import { protectedSpans, replaceSpans } from './segments';

export interface FactToken { raw: string; key: string; anchor?: string }
export interface SentenceFeatures {
  number: FactToken[];
  date: FactToken[];
  qualifier: FactToken[];
  link: FactToken[];
  code: FactToken[];
  skeleton: string;
  contextSkeleton: string;
  grams: Set<string>;
}

// Decimal scaling uses strings/BigInt, including integers beyond Number.MAX_SAFE_INTEGER.
function scaledDecimal(raw: string, exponent: number): string {
  const normalized = raw.replace(/[,，\s]/g, '').replace('−', '-');
  const negative = normalized.startsWith('-');
  const unsigned = normalized.replace(/^[+-]/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  let digits = (whole || '0') + fraction;
  let scale = fraction.length - exponent;
  if (scale < 0) { digits += '0'.repeat(-scale); scale = 0; }
  let integer = BigInt(digits || '0');
  while (scale > 0 && integer % 10n === 0n) { integer /= 10n; scale--; }
  return (negative && integer !== 0n ? '-' : '') + integer.toString() + 'e-' + scale;
}

const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthPattern = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
const dates = new RegExp(
  '\\b\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}\\b|\\d{4}年(?:\\s*\\d{1,2}月(?:\\s*\\d{1,2}[日号])?)?|\\b\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}\\b|\\b' +
  monthPattern + '\\s+\\d{1,2}(?:st|nd|rd|th)?[,]?\\s+\\d{4}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+' +
  monthPattern + '[,]?\\s+\\d{4}\\b', 'gi');

function dateKey(raw: string): string {
  const ymd = raw.match(/^(\d{4})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})/);
  if (ymd) return ymd[1] + '-' + ymd[2].padStart(2, '0') + '-' + ymd[3].padStart(2, '0');
  const partial = raw.match(/^(\d{4})年(?:\s*(\d{1,2})月)?$/);
  if (partial) return partial[1] + (partial[2] ? '-' + partial[2].padStart(2, '0') : '');
  const month = raw.match(new RegExp(monthPattern, 'i'));
  const nums = raw.match(/\d+/g);
  if (month && nums?.length === 2) {
    return nums[1] + '-' + String(monthNames.indexOf(month[0].toLowerCase().slice(0, 3)) + 1).padStart(2, '0') + '-' + nums[0].padStart(2, '0');
  }
  return raw;
}

const physicalPattern = /^(kilograms?|grams?|kilometers?|kilometres?|centimeters?|centimetres?|millimeters?|millimetres?|meters?|metres?|milliseconds?|minutes?|seconds?|hours?|kg|mg|km|cm|mm|ms|lbs?|g|m|s|h|千克|公斤|毫克|克|千米|公里|厘米|毫米|米|毫秒|分钟|小时|秒)(?![a-z])/i;
const numberPattern = /(?:百分之\s*)?(?:US\$|CNY|USD|EUR|GBP|RMB|[$€£¥￥])?\s*[+−-]?(?:\d{1,3}(?:[,，]\d{3})+|\d+)(?:\.\d+)?(?:\s*(?:trillion|billion|million|thousand|百亿|千万|百万|十万|万亿|亿|万|千|百))?(?:\s*(?:百分比|percent(?:age)?|美元|人民币|元|欧元|英镑|USD|EUR|GBP|CNY|RMB|dollars?|euros?|pounds?|%|％|个|件|人|items?|people|users?|(?:kilograms?|grams?|kilometers?|kilometres?|centimeters?|centimetres?|millimeters?|millimetres?|meters?|metres?|milliseconds?|minutes?|seconds?|hours?|kg|mg|km|cm|mm|ms|lbs?|g|m|s|h)(?![a-z])|千克|公斤|毫克|克|千米|公里|厘米|毫米|米|毫秒|分钟|小时|秒))?/gi;
const magnitudeExponents: Record<string, number> = { 百: 2, 千: 3, 万: 4, 十万: 5, 百万: 6, 千万: 7, 亿: 8, 百亿: 10, 万亿: 12, thousand: 3, million: 6, billion: 9, trillion: 12 };

function numberKey(raw: string): string {
  const matchedAmount = raw.match(/[+−-]?(?:\d{1,3}(?:[,，]\d{3})+|\d+)(?:\.\d+)?/)!;
  const amount = matchedAmount[0];
  const lower = raw.toLowerCase();
  const suffix = lower.slice(matchedAmount.index! + amount.length);
  // 千克/千米 are complete physical units; their 千 is not an extra magnitude.
  const fullPhysical = suffix.trim().match(physicalPattern);
  const magnitude = fullPhysical ? null : suffix.trim().match(/^(trillion|billion|million|thousand|万亿|百亿|千万|百万|十万|亿|万|千|百)/);
  const unitSuffix = magnitude ? suffix.trim().slice(magnitude[0].length).trim() : suffix.trim();
  let exponent = magnitude ? magnitudeExponents[magnitude[0]] : 0;
  let unit = 'number';
  if (/百分之|%|％|percent/.test(lower)) { unit = 'ratio'; exponent -= 2; }
  else if (/us\$|usd|美元|\$|dollars?/.test(lower)) unit = 'USD';
  else if (/eur|€|欧元|euros?/.test(lower)) unit = 'EUR';
  else if (/gbp|£|英镑|pounds?/.test(lower)) unit = 'GBP';
  else if (/cny|rmb|人民币|元|¥|￥/.test(lower)) unit = 'CNY';
  else if (/人|people|users?/.test(lower)) unit = 'people';
  else if (/个|件|items?/.test(lower)) unit = 'items';
  else {
    const physical = unitSuffix.match(physicalPattern)?.[0];
    if (physical) {
      const aliases: Record<string, string> = {
        kilogram: 'kg', kilograms: 'kg', 千克: 'kg', 公斤: 'kg', gram: 'g', grams: 'g', 克: 'g', 毫克: 'mg',
        kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km', 公里: 'km', 千米: 'km',
        meter: 'm', meters: 'm', metre: 'm', metres: 'm', 米: 'm',
        centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm', 厘米: 'cm',
        millimeter: 'mm', millimeters: 'mm', millimetre: 'mm', millimetres: 'mm', 毫米: 'mm',
        millisecond: 'ms', milliseconds: 'ms', 毫秒: 'ms', second: 's', seconds: 's', 秒: 's',
        minute: 'min', minutes: 'min', 分钟: 'min', hour: 'h', hours: 'h', 小时: 'h', lbs: 'lb',
      };
      unit = 'physical:' + (aliases[physical.toLowerCase()] ?? physical.toLowerCase());
    }
  }
  return unit + ':' + scaledDecimal(amount, exponent);
}

const qualifierPattern = /不确定|无疑|很可能|大概率|可能|也许|或许|有望|预计|预期|似乎|大概|大约|约莫|约(?=\s*[+−-]?\d)|近(?=\s*\d)|左右|至少|最多|不少于|不超过|超过|低于|不足|确定|必然|一定|肯定|保证|已经|已|从未|并非|不能|不得|没有|不是|未|无|没|不(?!仅|但|止)|\b[a-z]+n['’]t\b|\b(?:does\s+not|do\s+not|will\s+not|not|no|never|without|cannot|may|might|could|possibly|perhaps|expected|probably|likely|seems?|approximately|approx\.?|about|around|roughly|at\s+least|at\s+most|more\s+than|less\s+than|definitely|certainly|must|guaranteed|already|will)\b/gi;

function qualifierKey(raw: string): string {
  const lower = raw.toLowerCase().replace(/\s+/g, ' ');
  if (/^(可能|也许|或许|有望|may|might|could|possibly|perhaps)$/.test(lower)) return 'possible';
  if (/^(预计|预期|expected)$/.test(lower)) return 'expected';
  if (/^(很可能|大概率|probably|likely)$/.test(lower)) return 'likely';
  if (/^(似乎|seem|seems)$/.test(lower)) return 'seems';
  if (/^(不确定|大概)$/.test(lower)) return 'uncertain';
  if (/^(大约|约莫|约|近|左右|approximately|approx\.?|about|around|roughly)$/.test(lower)) return 'approximate';
  if (/^(至少|不少于|at least)$/.test(lower)) return 'minimum';
  if (/^(最多|不超过|at most)$/.test(lower)) return 'maximum';
  if (/^(超过|more than)$/.test(lower)) return 'greater';
  if (/^(低于|不足|less than)$/.test(lower)) return 'less';
  if (/^(已经|已|already)$/.test(lower)) return 'realized';
  if (/^(确定|无疑|必然|一定|肯定|保证|definitely|certainly|must|guaranteed)$/.test(lower)) return 'certain';
  if (lower === 'will') return 'future';
  return 'negative';
}

export function sentenceFeatures(sentence: string, references?: ReadonlyMap<string, string>): SentenceFeatures {
  const spans = protectedSpans(sentence, references);
  const code = spans.flatMap((span) => span.kind === 'link' ? span.nestedCode ?? [] : [span]).map((span) => ({ raw: span.raw, key: span.key }));
  const link = spans.filter((span) => span.kind === 'link').map((span) => ({ raw: span.key, key: span.key }));
  const plain = replaceSpans(sentence, spans, (span) => span.kind === 'link' && !span.definition
    ? ' ' + replaceSpans(span.label, protectedSpans(span.label, references), () => ' ') + ' ' : ' ');
  const alignmentText = replaceSpans(sentence, spans, () => ' ');
  const date: FactToken[] = [];
  const withoutDates = plain.replace(dates, (raw) => { date.push({ raw, key: dateKey(raw) }); return ' '; });
  const qualifier: FactToken[] = [];
  let anchorSize = 0;
  let anchorCursor = 0;
  const withoutQualifiers = withoutDates.replace(qualifierPattern, (raw, offset: number) => {
    anchorSize += withoutDates.slice(anchorCursor, offset)
      .replace(new RegExp(numberPattern.source, numberPattern.flags), ' ')
      .replace(/[^\p{L}\p{N}]+/gu, '').length;
    anchorCursor = offset + raw.length;
    qualifier.push({ raw, key: qualifierKey(raw), anchor: String(anchorSize) });
    return ' ';
  });
  const number: FactToken[] = [];
  const contextPlain = withoutQualifiers.replace(numberPattern, (raw) => { number.push({ raw: raw.trim(), key: numberKey(raw) }); return ' '; });
  const skeletonPlain = alignmentText.replace(dates, ' ').replace(qualifierPattern, ' ').replace(numberPattern, ' ');
  const hasCode = code.length ? ' codefragment ' : '';
  const hasLink = link.length ? ' linktarget ' : '';
  const skeleton = (skeletonPlain + hasCode + hasLink).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  const contextSkeleton = (contextPlain + hasCode + hasLink).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  const compact = skeleton.replace(/\s+/g, '');
  const grams = new Set<string>();
  for (let i = 0; i < compact.length - 1; i++) grams.add(compact.slice(i, i + 2));
  if (compact.length === 1) grams.add(compact);
  return { number, date, qualifier, link, code, skeleton, contextSkeleton, grams };
}
