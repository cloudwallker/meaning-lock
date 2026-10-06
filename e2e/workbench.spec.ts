import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('review, filter, export, invalidate and bilingual workflow stays local', async ({ page }) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', request => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) external.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('试用案例').selectOption('financial');
  await page.getByRole('button', { name: '检查改写', exact: true }).click();
  await expect(page.locator('.finding-card').first()).toBeVisible();
  await expect(page.locator('.category-number')).not.toHaveCount(0);
  await page.getByRole('button', { name: /^数字与数量/ }).click();
  await expect(page.locator('.finding-card')).toHaveCount(1);
  await expect(page.locator('.finding-card .category-tag').first()).toHaveText('数字与数量');
  await page.getByRole('checkbox', { name: /我已核对这项变化/ }).first().check();
  await expect(page.locator('.is-reviewed')).toHaveCount(1);
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON' }).click();
  const file = await (await jsonDownload).path();
  const report = JSON.parse(await readFile(file!, 'utf8'));
  expect(report.findings.some((finding: { reviewed: boolean }) => finding.reviewed)).toBe(true);
  expect(report.original).toContain('2.3亿元');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check rewrite', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('textbox', { name: /Rewrite/ }).fill('Revenue is 23 billion.');
  await expect(page.locator('.finding-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export JSON' })).toHaveCount(0);
  await expect(page.getByText('The input changed. Run the check again.')).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('UTF-8 imports, keyboard check and inert HTML export', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').nth(0).setInputFiles({ name: 'original.md', mimeType: 'text/markdown', buffer: Buffer.from('The amount is 12 dollars. <script>window.reportInjected=true</script>') });
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'rewrite.md', mimeType: 'text/markdown', buffer: Buffer.from('The amount is 120 dollars. <script>window.reportInjected=true</script>') });
  await page.getByRole('textbox', { name: /改写稿/ }).press('Control+Enter');
  await expect(page.locator('.finding-card').first()).toBeVisible();
  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 HTML' }).click();
  const html = await readFile((await (await htmlDownload).path())!, 'utf8');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>window');
  await page.setContent(html);
  expect(await page.evaluate(() => (window as any).reportInjected)).toBeUndefined();
  await expect(page.getByText('The amount is 12 dollars.', { exact: false }).first()).toBeVisible();
});

test('input validation and refresh clears user text', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '检查改写', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(2);
  await page.locator('input[type=file]').nth(0).setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from([0xff, 0xfe, 0x81]) });
  await expect(page.getByRole('alert')).toContainText('UTF-8');
  await page.getByRole('textbox', { name: /原文/ }).fill('Locally entered text');
  await page.reload();
  await expect(page.getByRole('textbox', { name: /原文/ })).toHaveValue('');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

for (const width of [375, 768, 1440]) {
  test(`workbench fits ${width}px with reduced motion`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByLabel('试用案例').selectOption('equivalent');
    await page.getByRole('button', { name: '检查改写', exact: true }).click();
    await expect(page.getByText('这次没有规则命中')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  });
}
