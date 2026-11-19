import assert from "node:assert/strict";
import test from "node:test";
import { extractJson } from "./index.js";

test("extractJson: 닫히지 않는 여는 괄호가 수십만 개여도 끝난다(O(n²) 폭주 없음)", () => {
  const started = Date.now();
  assert.throws(() => extractJson("[".repeat(300_000)), /JSON/);
  assert.ok(Date.now() - started < 2000, `병적 입력이 ${Date.now() - started}ms 걸렸다`);
});

test("extractJson: 정상 응답은 앞에 잡설과 많은 괄호가 있어도 뒤쪽의 JSON 을 찾는다(의미 보존)", () => {
  const prose = Array.from({ length: 300 }, (_, i) => `생각 ${i}: {메모} [참고 ${i}]`).join("\n");
  assert.deepEqual(extractJson(`${prose}\n{"items":[{"name":"a"}]}`, (v) => typeof v === "object" && v !== null && "items" in v), { items: [{ name: "a" }] });
});
