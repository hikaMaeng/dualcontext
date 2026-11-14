import assert from "node:assert/strict";
import test from "node:test";
import { splitQuery } from "./index.js";

test("한 문장 단순 질의는 나누지 않는다", () => {
  assert.deepEqual(splitQuery("중학생 아이의 사춘기 반항을 어떻게 대해야 할지 조언해 주세요."), ["중학생 아이의 사춘기 반항을 어떻게 대해야 할지 조언해 주세요."]);
});

test("목록의 쉼표에서는 나누지 않는다", () => {
  const query = "MSI GT 330, AMD Radeon HD 6670, NVIDIA GeForce 8600 GTS 세 그래픽카드의 메모리 대역폭을 비교해 주세요";
  assert.deepEqual(splitQuery(query), [query]);
});

test("문장 사이와 의문 어미 뒤 쉼표에서 하위 질문으로 나눈다", () => {
  const parts = splitQuery("의료기기 부품 수입 지연으로 공장 가동이 멈춘 상황을 검토 중입니다. 해당 산업 자료에서 생산에 무슨 일이 생겼는지, 사용자 귀책 휴업의 수당 기준은 무엇인지, 정리해 주세요.");
  assert.equal(parts.length, 3);
  assert.match(parts[1], /^해당 산업 자료에서 생산에 무슨 일이 생겼는지$/);
  assert.match(parts[2], /^사용자 귀책 휴업의 수당 기준은 무엇인지/);
});

test("짧은 조각은 이웃에 붙고 개수는 4개를 넘지 않는다", () => {
  const long = Array.from({ length: 7 }, (_unused, index) => `질문 번호 ${index} 에 대해 자세히 설명해 주세요.`).join(" ");
  const parts = splitQuery(long);
  assert.equal(parts.length, 4);
  assert.ok(parts.every((part) => part.length >= 12));
  assert.deepEqual(splitQuery("안녕. 반가워."), ["안녕. 반가워."]);
});
