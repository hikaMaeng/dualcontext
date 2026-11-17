import assert from "node:assert/strict";
import test from "node:test";
import { extractJson, limits, parseAnalyze, parseDedupe, parseEvaluate, parsePrerequisites, PlanParseError } from "./index.js";

test("extractJson: 코드펜스 · 앞뒤 잡설 · 추론 문장 속 괄호를 건너뛰고 첫 해석 가능한 균형 구간을 꺼낸다", () => {
  assert.deepEqual(extractJson('```json\n{"items":[]}\n```'), { items: [] });
  assert.deepEqual(extractJson('생각: {이건 JSON 이 아님} 그래서 답은 {"a":"}{ 문자열 속 괄호"} 끝'), { a: "}{ 문자열 속 괄호" });
  assert.deepEqual(extractJson("목록: [1, 2] 이다"), [1, 2]);
  assert.throws(() => extractJson("JSON 없음"), PlanParseError);
  assert.throws(() => extractJson('{"a": 1'), PlanParseError);
});

test("parseAnalyze: 잘못된 항목은 버리고, 공백을 정리하고, 이름 중복을 없애고, 상한으로 자른다", () => {
  const text = JSON.stringify({ items: [
    { name: " 환불  규정 ", description: "사내 환불 규정" },
    { name: "", description: "이름 없음" },
    { name: "설명 없음" },
    "문자열",
    { name: "환불규정", description: "중복" },
    { name: "배송", description: "배송 정책" },
    { name: "세 번째", description: "c" }
  ] });
  assert.deepEqual(parseAnalyze(text, 2), [{ name: "환불 규정", description: "사내 환불 규정" }, { name: "배송", description: "배송 정책" }]);
  assert.deepEqual(parseAnalyze('{"items":[]}'), []);
  assert.throws(() => parseAnalyze('{"other":[]}'), PlanParseError);
});

test("parseAnalyze: 길이 상한을 넘는 이름 · 설명은 자른다", () => {
  const [draft] = parseAnalyze(JSON.stringify({ items: [{ name: "가".repeat(200), description: "나".repeat(2000) }] }));
  assert.equal(draft.name.length, limits.name);
  assert.equal(draft.description.length, limits.description);
});

test("parsePrerequisites: needs 배열 또는 맨 배열을 받는다", () => {
  assert.deepEqual(parsePrerequisites('결과: {"needs":[{"name":"a","description":"b"}]}', 4), [{ name: "a", description: "b" }]);
  assert.deepEqual(parsePrerequisites('[{"name":"a","description":"b"},{"name":"c","description":"d"}]', 1), [{ name: "a", description: "b" }]);
});

test("parseDedupe: 범위 밖 번호 · 모르는 기존 id · 두 번 나온 후보 · 한 개짜리 묶음은 버린다", () => {
  const text = JSON.stringify({ groups: [[0, 2, 9], [2, 3], [1], ["3", 4]], existing: { "1": "i1", "4": "i9", x: "i1", "0": 3 } });
  assert.deepEqual(parseDedupe(text, 5, ["i1", "i2"]), { groups: [[0, 2], [3, 4]], existing: { 1: "i1" } });
  assert.deepEqual(parseDedupe('{"groups":[],"existing":{}}', 2, []), { groups: [], existing: {} });
  assert.throws(() => parseDedupe("[]", 2, []), PlanParseError);
});

test("parseEvaluate: 점수는 0~100 정수로 클램프하고 missing 은 자르지 않고 전부, reason 없는 항목은 그 필드를 빼고 둔다", () => {
  const text = `평가합니다.\n{"score": 132.6, "reason": " 충분 ", "missing": [{"name":"a","description":"b","reason":"c"},{"name":"d","description":"e"},{"name":"f","description":"g"}]}`;
  assert.deepEqual(parseEvaluate(text), { score: 100, reason: "충분", missing: [{ name: "a", description: "b", reason: "c" }, { name: "d", description: "e" }, { name: "f", description: "g" }] });
  assert.equal(parseEvaluate('{"score":-5,"missing":[]}').score, 0);
  assert.equal(parseEvaluate('{"score":"71.4","missing":[]}').score, 71);
  assert.equal(parseEvaluate('{"score":90,"missing":[]}').reason, "");
  const many = Array.from({ length: 120 }, (_v, index) => ({ name: `m${index}`, description: "d" }));
  assert.equal(parseEvaluate(JSON.stringify({ score: 10, missing: many })).missing.length, limits.missing);
});

test("parseEvaluate: 형식 오류는 던진다(missing 없음 · 배열 아님 · 항목 검증 실패 · score 없음) — 빈 배열로 바꿔 통과시키지 않는다", () => {
  for (const text of ['{"score":100}', '{"score":50,"missing":"없음"}', '{"score":50,"missing":[{"name":"a"}]}', '{"score":50,"missing":[{"name":"a","description":"b"},3]}', '{"reason":"점수 없음","missing":[]}', '{"score":"","missing":[]}']) {
    assert.throws(() => parseEvaluate(text), PlanParseError, text);
  }
});

test("후보 순회: 잡설 속 다른 모양의 JSON 을 건너뛰고 기대 스키마에 맞는 첫 후보를 고른다", () => {
  assert.deepEqual(parseAnalyze('Consider [1,2] first. Final JSON: {"items":[{"name":"a","description":"b"}]}'), [{ name: "a", description: "b" }]);
  assert.deepEqual(parsePrerequisites('예: {"x":1} 그리고 [3] 답: {"needs":[{"name":"n","description":"d"}]}', 4), [{ name: "n", description: "d" }]);
  assert.deepEqual(parseDedupe('먼저 [0,1] 을 보면 {"note":"x"} 결론 {"groups":[[0,1]],"existing":{}}', 2, []), { groups: [[0, 1]], existing: {} });
  assert.equal(parseEvaluate('예시 {"items":[]} 와 [{"score":1}] 다음이 답: {"score":77,"missing":[]}').score, 77);
  assert.deepEqual(extractJson("a [1] b {\"k\":2}", (value) => !Array.isArray(value)), { k: 2 });
  assert.throws(() => parseAnalyze("[1,2] 만 있다"), PlanParseError);
});

test("빠진 여는 중괄호 복구: 둘째 이후 객체의 `{` 를 빠뜨린 실측 응답을 항목으로 해석한다", () => {
  const dropped = '{"items":[{"name":"a","description":"A"},"name":"b","description":"B"},"name":"c","description":"C"}]}';
  const quoted = '{"items":[{"name":"a","description":"A"},"{"name":"b","description":"B"}]}';
  assert.deepEqual(parseAnalyze(dropped), [{ name: "a", description: "A" }, { name: "b", description: "B" }, { name: "c", description: "C" }]);
  assert.deepEqual(parseAnalyze(quoted), [{ name: "a", description: "A" }, { name: "b", description: "B" }]);
  assert.deepEqual(parsePrerequisites(dropped, 2), [{ name: "a", description: "A" }, { name: "b", description: "B" }]);
  // 정상 JSON 은 건드리지 않는다: name 이 아닌 키가 뒤따르는 객체 · 복구해도 안 풀리는 응답은 그대로 던진다.
  assert.deepEqual(parseAnalyze('{"items":[{"name":"a","description":"A","meta":{"x":1},"name2":"z"}]}'), [{ name: "a", description: "A" }]);
  assert.throws(() => parseAnalyze('{"items":[{"name":"a"},"name":"b"'), PlanParseError);
});
