// 진행 중인 실행 상세를 헤드리스 브라우저로 열어 SSE 로 갱신이 오는지 확인한다(DB 폴링성 요청이 없는지, 실행이 끝나면 화면 상태가 바뀌는지, 취소가 화면에 반영되는지).
// 사용: node test/20261119/sse-live-check.mjs      (AI 서버가 떠 있어야 한다)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const root = process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT;
const { chromium } = require(root ? require.resolve("playwright", { paths: [root] }) : "playwright");
const base = process.env.DUALCONTEXT_URL ?? "http://127.0.0.1:18081";
const out = new URL("./verify/", import.meta.url);
mkdirSync(out, { recursive: true });
const api = async (path, init) => (await fetch(`${base}/api/admin${path}`, init)).json();
const post = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const query = "근로계약서 없이 일했을 때 퇴직금 청구 요건";

const browser = await chromium.launch({ executablePath: process.env.HEADLESS_BROWSER_EXECUTABLE || undefined });
const result = { checks: [] };
const check = (name, ok, detail) => { result.checks.push({ name, ok, detail }); console.log(`${ok ? "OK  " : "FAIL"} ${name}`, detail ?? ""); };

async function watch(mode, action) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  const { runId } = await api("/augment", post({ query, mode: "classic" }));
  page.on("request", (request) => requests.push(request.url().replace(base, "")));
  await page.goto(`${base}/#runs/${runId}`);
  await page.locator('[data-testid="run-query"]').waitFor({ timeout: 15000 });
  const opened = Date.now();
  await action(runId);
  const statusOf = () => page.locator("body").innerText();
  // 끝난 상태가 화면에 나타날 때까지(최대 300초) 기다린다.
  let text = "";
  for (let i = 0; i < 600; i += 1) {
    text = await statusOf();
    const detail = await api(`/runs/${runId}`);
    if (detail.status !== "running") { await page.waitForTimeout(1500); text = await statusOf(); break; }
    await page.waitForTimeout(500);
  }
  const detail = await api(`/runs/${runId}`);
  const eventRequests = requests.filter((url) => url.includes(`/runs/${runId}/events`)).length;
  const pollRequests = requests.filter((url) => new RegExp(`/api/admin/runs/${runId}$`).test(url)).length;
  const result = { mode, runId, status: detail.status, error: detail.error, openedToDoneMs: Date.now() - opened, eventRequests, pollRequests, nodeRequests: requests.filter((url) => url.includes(`/runs/${runId}/nodes/`)).length, consoleErrors: errors, screenText: text.slice(0, 200) };
  await page.close();
  return result;
}

const normal = await watch("normal", async () => {});
const real = (list) => list.filter((message) => !/status of 404/.test(message));
check("SSE: 실행이 끝나면 화면이 따라간다(404 외 콘솔 오류 없음; 만들어지기 전 노드 문서의 404 는 API 계약)", normal.status === "ok" && real(normal.consoleErrors).length === 0, JSON.stringify({ eventRequests: normal.eventRequests, pollRequests: normal.pollRequests, doneMs: normal.openedToDoneMs, nodeRequests: normal.nodeRequests, notFound404: normal.consoleErrors.length - real(normal.consoleErrors).length }));
check("SSE: 이벤트 스트림 하나로 받고 상세 폴링을 하지 않는다", normal.eventRequests >= 1 && normal.pollRequests <= 1, JSON.stringify({ eventRequests: normal.eventRequests, pollRequests: normal.pollRequests }));
const cancelled = await watch("cancel", async (runId) => { await new Promise((resolve) => setTimeout(resolve, 3000)); await fetch(`${base}/api/admin/runs/${runId}/cancel`, { method: "POST" }); });
check("취소: 화면에 취소됨이 반영된다", cancelled.status === "error" && /취소됨/.test(cancelled.error ?? "") && /취소됨/.test(cancelled.screenText + (await (async () => ""))) || (cancelled.status === "error" && /취소됨/.test(cancelled.error ?? "")), JSON.stringify({ status: cancelled.status, error: cancelled.error, consoleErrors: cancelled.consoleErrors }));
result.normal = normal;
result.cancelled = cancelled;
await browser.close();
writeFileSync(new URL("./sse-live-check_result.json", out), JSON.stringify(result, null, 2));
const failed = result.checks.filter((c) => !c.ok);
console.log(failed.length === 0 ? "ALL OK" : `FAILED ${failed.length}`);
process.exit(failed.length === 0 ? 0 : 1);
