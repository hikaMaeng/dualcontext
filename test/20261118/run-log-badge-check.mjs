// 실행 로그 목록 · 뷰에서 MCP 뱃지가 MCP 실행에만 있고 시험 실행에는 없는지 testid 로 확인한다.
// 사용: HEADLESS_BROWSER_PLAYWRIGHT_ROOT(필요 시) node test/20261118/run-log-badge-check.mjs <mcpRunId> <testRunId>
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const root = process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT;
const { chromium } = require(root ? require.resolve("playwright", { paths: [root] }) : "playwright");
const [mcpId, testId] = process.argv.slice(2).map(Number);
const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const browser = await chromium.launch({ executablePath: process.env.HEADLESS_BROWSER_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
const result = {};
await page.goto(`${base}/#runs`);
await page.locator(`[data-testid="run-item"][data-run-id="${mcpId}"]`).waitFor({ timeout: 15000 });
const item = (id) => page.locator(`[data-testid="run-item"][data-run-id="${id}"]`);
result.list = {
  mcpItemBadgeCount: await item(mcpId).locator('[data-testid="run-item-source"]').count(),
  mcpItemBadgeText: await item(mcpId).locator('[data-testid="run-item-source"]').first().textContent(),
  testItemBadgeCount: await item(testId).locator('[data-testid="run-item-source"]').count(),
  mcpItemEffort: await item(mcpId).locator('[data-testid="run-item-effort"]').count() ? await item(mcpId).locator('[data-testid="run-item-effort"]').first().textContent() : null,
  mcpItemEffortAttr: await item(mcpId).locator('[data-testid="run-item-effort"]').count() ? await item(mcpId).locator('[data-testid="run-item-effort"]').first().getAttribute("data-effort") : null,
  testItemEffortCount: await item(testId).locator('[data-testid="run-item-effort"]').count()
};
await page.screenshot({ path: new URL("./run-log-badge-list.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
const failed = [];
page.on("response", (response) => response.status() >= 400 && failed.push(`${response.status()} ${response.url()}`));
for (const [name, id] of [["mcpView", mcpId], ["testView", testId]]) {
  await page.goto(`${base}/#runs/${id}`);
  await page.locator('[data-testid="run-query"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  result[name] = {
    id,
    badgeCount: await page.locator('[data-testid="run-source"]').count(),
    effortCount: await page.locator('[data-testid="run-effort"]').count(),
    effortText: await page.locator('[data-testid="run-effort"]').count() ? await page.locator('[data-testid="run-effort"]').first().textContent() : null,
    badgeText: await page.locator('[data-testid="run-source"]').count() ? await page.locator('[data-testid="run-source"]').first().textContent() : null,
    heading: (await page.locator("#run-heading").textContent())?.trim(),
    // 그래프에 증강 전 답변 노드가 있는지(MCP 실행은 최종 답변을 만들지 않으므로 없어야 한다).
    beforeAnswerNodeInPage: (await page.locator("body").innerText()).includes("증강 전 답변")
  };
}
result.consoleErrors = errors;
result.failedResponses = failed;
await browser.close();
writeFileSync(new URL("./run-log-badge-check_result.json", import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
