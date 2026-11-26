# How Meaning Lock checks a rewrite

[English README](../README.md) · [中文说明](../README_ZH.md)

Meaning Lock compares extracted facts within aligned segments and keeps unmatched content visible. Review marks record your decisions; exports retain both input texts and every finding.

## Segments and alignment

The checker splits text on Chinese / English sentence punctuation and line breaks. It keeps Markdown code and link spans together, protects decimal points, and treats fenced code as one segment. Common abbreviations receive special handling.

Unique, unchanged segments are matched first, so moving a sentence usually produces no finding. Remaining segments are compared using character bigrams after masking extracted facts. A match must have sufficient similarity and a clear margin over competing matches. Repeated or close competing segments are shown as **Alignment review**. Unmatched segments appear as added or removed content. Splitting or merging a sentence can therefore create several findings to review together.

The aligned-segment count records confident matches. It helps interpret the report alongside the original and revised segment counts. When extracted facts stay the same but the surrounding wording changes, a content finding preserves that wording for review. This catches cases where the same numbers now describe different subjects and also brings ordinary paraphrases to your review desk.

## Checks and examples

| Category | Example change | Interpretation |
|---|---|---|
| Numbers | `2.3亿元` → `23亿元` | The magnitude changed. |
| Equivalent quantity | `2.3亿元` → `23000万元` | Both values normalize to the same amount. |
| Percentage | `12.5%` → `15%` | The percentage changed. |
| Percentage points | `2 percent` → `2 percentage points` | The unit of change differs. |
| Basis points | `25 basis points` → `0.25 percentage points` | Both express the same absolute change in a rate. |
| Currency | `20 USD` → `20 EUR` | The currency changed. |
| Date | `2026年7月1日` → `2026-07-02` | The recognized date changed. |
| Qualifier | `may launch` → `will launch` | Certainty or modality changed. |
| Negation | `does not store files` → `stores files` | A recognized negative expression disappeared. |
| Link | `/docs/v1` → `/docs/v2` in a Markdown URL | The destination changed. |
| Code | `` `retry(3)` `` → `` `retry(5)` `` | The code changed. |
| Content | A segment is removed, added or its fact-bearing wording changes | The surrounding text needs review. |

Decimal quantities are normalized using integer arithmetic, preserving values beyond JavaScript's safe integer range. Rules recognize Arabic numerals, grouping separators, common Chinese magnitude units (百、千、万、亿 and combinations), English magnitude words, percentages, common currencies, basic person / item counts and common physical units. Physical units are compared by unit name, including common aliases such as 千克 / kg. A switch from kg to g is shown for review even when the quantities can be converted. Code and URL contents are checked as their own categories. Markdown references resolve through the document's link definitions.

Dates use recognized textual patterns and equivalent year-month-day forms. Qualifier rules group common expressions such as `may / might / 可能`, `about / roughly / 约`, and minimum / maximum terms. A rule compares recognized expressions and their order inside each aligned segment.

**Zero findings means these rules found no differences.** Alignment and supported patterns determine coverage. Review the context for changes to names, relationships, units outside the listed patterns, subtle grammatical scope, and meaning expressed through other wording. The checker compares the two supplied texts; the original text remains the reference for your review.

## Reports and local processing

The browser sends text to a local Web Worker. The application uses bundled assets and system fonts, with no model API, analytics or automatic text storage. Refreshing clears the workspace. Both UTF-8 file imports and pasted text are supported; each input is limited to 50,000 UTF-16 code units and 300 segments.

JSON exports include the report version, input texts, segment statistics, generated time, findings, and reviewed IDs. Each exported finding has a `reviewed` boolean. A review mark acknowledges your review of that item; both texts stay unchanged.

HTML reports escape supplied text, use inline styles, and include a Content Security Policy that blocks scripts and external resources. The report is readable as a standalone local file. Both formats contain the complete supplied texts, so use the same sharing practices you would use for the source documents.

## 中文使用要点

先对齐句段，再比较句段中的事实标记。句段重排通常能直接对应；句子拆分、合并、重复或相近匹配会产生需要结合上下文核对的内容与对齐提示。数字采用整数方式归一化，避免浮点舍入合并不同的大整数；常见等值数量会按相同值比较。

规则覆盖数字、常用数量和币种、日期、否定与确定性词、链接及代码。零条命中表示这些规则没有发现变化。人名、关系、列表之外的单位和隐含表达需结合原稿判断。逐项确认记录审阅动作，导出仍保留两份完整文本。修改输入后，请重新检查。
