// 라우팅 평가 채점: route-eval-results/*.json 을 평가 세트의 정답과 대조해 설정·세트별 지표를 계산한다.
//   node test/20261115/route-eval-score.mjs > test/20261115/route-eval-summary.json
// 지표 정의(모두 이 파일이 계산하며, 결과 파일의 수치를 그대로 센다):
//  topicRecall  양성 질의에서 「충족한 주제 수 / 주제 수」의 평균. 주제는 그 주제의 조사원 조각 중 하나라도 선택되면 충족.
//  fullRecall   양성 질의 중 모든 주제를 충족한 질의의 비율.
//  extra        양성 질의에서 정답(topics)도 허용(allowed)도 아닌 조사원이 선택된 개수의 평균.
//  negClean     무관 질의 중 허용 밖 조사원이 하나도 선택되지 않은 질의의 비율(컨텍스트가 비는 것은 아니고 「불필요 선택 없음」이다).
//  negEmpty     무관 질의 중 선택이 아예 비어 있는 질의의 비율(허용 조사원 선택도 선택으로 센다).
//  avgSelected  모든 질의의 평균 선택 수.
//  p50/p95      질의 하나의 라우팅 전체 시간(ms). 서버 한 대를 다른 작업과 나눠 쓴 환경의 값이라 절대값이 아니라 설정 간 상대 비교용이다.
import { readdirSync, readFileSync } from "node:fs";

const items = JSON.parse(readFileSync("test/20261115/route-eval-set.json", "utf8"));
const byId = new Map(items.map((item) => [item.id, item]));
const dir = "test/20261115/route-eval-results";
const files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort();
const hit = (fragments, names) => names.some((name) => fragments.some((fragment) => name.includes(fragment)));
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; };
const round = (value, digits = 3) => (value === null ? null : Number(value.toFixed(digits)));

function score(results, filter) {
  const rows = results.filter((result) => !result.error && filter(byId.get(result.id)));
  const positives = rows.filter((row) => byId.get(row.id).topics.length > 0);
  const negatives = rows.filter((row) => byId.get(row.id).topics.length === 0);
  const hits = (row) => byId.get(row.id).topics.filter((topic) => hit(topic, row.selected)).length;
  const extraCount = (row) => { const item = byId.get(row.id); const ok = [...item.topics.flat(), ...item.allowed]; return row.selected.filter((name) => !ok.some((fragment) => name.includes(fragment))).length; };
  return {
    n: rows.length, positives: positives.length, negatives: negatives.length,
    topicRecall: round(positives.reduce((sum, row) => sum + hits(row) / byId.get(row.id).topics.length, 0) / (positives.length || 1)),
    fullRecall: round(positives.filter((row) => hits(row) === byId.get(row.id).topics.length).length / (positives.length || 1)),
    extra: round(positives.reduce((sum, row) => sum + extraCount(row), 0) / (positives.length || 1), 2),
    negClean: negatives.length === 0 ? null : round(negatives.filter((row) => extraCount(row) === 0).length / negatives.length),
    negEmpty: negatives.length === 0 ? null : round(negatives.filter((row) => row.selected.length === 0).length / negatives.length),
    avgSelected: round(rows.reduce((sum, row) => sum + row.selected.length, 0) / (rows.length || 1), 2),
    p50: percentile(rows.map((row) => row.ms), 0.5), p95: percentile(rows.map((row) => row.ms), 0.95)
  };
}

const sets = { all: () => true, calibration: (item) => item.set === "calibration", real: (item) => item.set === "real", heldout: (item) => item.set === "heldout" };
const out = { runs: [] };
const loaded = files.map((file) => ({ file, data: JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) }));
for (const { file, data } of loaded) {
  out.runs.push({ file, name: data.name, run: data.run, errors: data.results.filter((r) => r.error).length, elapsedMs: data.elapsedMs, concurrency: data.concurrency, metrics: Object.fromEntries(Object.entries(sets).map(([setName, filter]) => [setName, score(data.results, filter)])) });
}
// 같은 설정을 여러 번 돌린 경우 회차 간 일치도: 질의별 선택 집합이 같았던 비율(LLM 단계의 비결정성).
out.agreement = {};
for (const name of new Set(loaded.map(({ data }) => data.name))) {
  const runs = loaded.filter(({ data }) => data.name === name).map(({ data }) => data.results);
  if (runs.length < 2) continue;
  const key = (row) => (row.error ? "error" : [...row.selected].sort().join("|"));
  const same = runs[0].filter((row, index) => key(row) === key(runs[1][index])).length;
  out.agreement[name] = { runs: runs.length, identicalSelection: `${same}/${runs[0].length}` };
}
console.log(JSON.stringify(out, null, 1));
