const fs = require('fs');
const path = require('path');
const base = __dirname;
const qs = JSON.parse(fs.readFileSync(path.join(base, 'queries.json'), 'utf8'));
const attempts = JSON.parse(fs.readFileSync(path.join(base, 'attempts.json'), 'utf8'));
const grades = {
  'E3b-1': [
    {before:['contradict','약 45~55% 수준'],after:['miss','12월 금리 인하 가능성: 언급 없음']},
    {before:['contradict','약 45~55% 수준'],after:['miss','12월 금리 인하 가능성: 언급 없음']},
    {before:['contradict','약 8.98 백만 건'],after:['miss','10월 구인 건수: 언급 없음']}
  ],
  'E3b-2': [
    {before:['miss','정확한 순유입 규모 ... 확인해 드리지 못합니다'],after:['hit','380억 달러 (2024년 11월까지)']},
    {before:['miss','정확한 순유입 규모 ... 확인해 드리지 못합니다'],after:['hit','314억 달러 (암호화폐 관련 레버리지 및 인버스 ETF)']},
    {invalid:'질문에 특정 코스피 보고서나 시점이 지정되지 않아 다른 행의 코스피 수치도 유효한 답이다.',before:['miss','해당 수치 없음'],after:['miss','1.19% 하락 ... 2,857.00포인트는 다른 보고서의 수치']}
  ],
  'E3b-3': [
    {before:[null,'답변 생성 시간 초과'],after:['miss','미국 구인 건수: 컨텍스트에 없음']},
    {before:[null,'답변 생성 시간 초과'],after:['miss','코스피 지수: 컨텍스트에 없음']},
    {invalid:'F1과 같은 구인 건수 및 예상치 초과를 반복하며 독립적인 원자적 사실이 아니다.',before:[null,'답변 생성 시간 초과'],after:['miss','미국 구인 건수: 컨텍스트에 없음']}
  ],
  'E3b-4': []
};
const notes = {
  'E3b-1': {before:['10월 구인 898만 건 및 예상 880만~890만 건, 인하 확률 45~55%: 대상 덤프 행과 불일치','2024년 11월 5일 발표 등 특정 날짜는 검색된 근거로 확인되지 않음'],after:['합성 금융 시황 자료 전체에 인하 가능성과 구인 건수가 전혀 없다는 단정은 덤프의 1·3행과 모순','Christian Daily 기사에 2026.10.06 날짜를 부여했으나 검색 결과 본문은 연·월 없이 6일만 제시','서로 다른 시점일 수 있는 합성 고용 수치와 웹 고용 수치를 정반대 모순이라 단정'],gap:'컨텍스트에 없다고 밝히나 전체 자료에도 없다고 과잉 일반화'},
  'E3b-2': {before:['2024년 코스피 연초 약 2,400, 5월 약 2,600, 연말 약 2,480 등은 제공된 근거 없이 제시'],after:[],gap:'부산 거주 투자자 순매수액은 컨텍스트에 없다고 명시'},
  'E3b-3': {before:[],after:[],gap:'구인·코스피 수치와 최신 웹 결정에 대한 근거 부족을 명시'},
  'E3b-4': {before:[],after:[],gap:'구체적 조작 순서가 컨텍스트에 없다고 밝힘. 무관한 산업·의학 자료를 편집 근거로 인용하지 않음'}
};
const results = qs.map(q => {
  const run = JSON.parse(fs.readFileSync(path.join(base,'runs',q.id+'.json'),'utf8'));
  const pairs = run.pairs || [];
  const researchers = [...new Set(pairs.map(p=>p.researcher))];
  const procedures = [...new Set(pairs.map(p=>p.procedure))];
  const actual = pairs.flatMap(p=>(p.materials||[]).map(m=>({table:p.researcher,title:m.title,text:m.text})));
  const facts = q.gold_facts.map((f,i)=>{
    const g=grades[q.id][i];
    const sourceResearcher = '금융 시황 리포트(합성)';
    const evidence = actual.some(m=>m.table===sourceResearcher && ((m.text||'').includes(f.quote) || (m.title||'').includes(f.quote)));
    return {id:f.id, invalid:!!g.invalid, invalid_reason:g.invalid||null, before:{status:g.before[0],reason:g.before[1]}, after:{status:g.after[0],reason:g.after[1]}, context_has_evidence:evidence};
  });
  const diff=(expected,got)=>({matched:expected.filter(x=>got.includes(x)),missing:expected.filter(x=>!got.includes(x)),extra:got.filter(x=>!expected.includes(x))});
  return {id:q.id, runId:run.runId, http_success:true, elapsed_ms:attempts.find(a=>a.id===q.id && a.status===200).ms, answer_ms:{before:run.answers.before.ms,after:run.answers.after.ms}, answer_errors:{before:run.answers.before.error,after:run.answers.after.error}, facts,
    routing:{researcherRouting:run.researcherRouting,researchers,procedures,pairs:pairs.map(p=>({researcher:p.researcher,procedure:p.procedure,procedureRouting:p.procedureRouting,materialCount:p.materialCount,error:p.error||null})),researcher_comparison:diff(q.expect_researchers,researchers),procedure_comparison:diff(q.expect_procedures,procedures)},
    hallucination:{before:notes[q.id].before,after:notes[q.id].after}, after_declared_gaps:notes[q.id].gap,
    web_observation:q.id==='E3b-3'?'웹 조사원 미선택, 웹 결과 없음':q.id==='E3b-4'?'웹 조사원 선택, 사진 합치기 관련 결과 5개':null};
});
const counts=(facts,side)=>{let available=facts.filter(f=>!f.invalid&&f[side].status!==null);return {hit:available.filter(f=>f[side].status==='hit').length,denominator:available.length};};
const all=results.flatMap(r=>r.facts);
const paired=all.filter(f=>!f.invalid&&f.before.status!==null&&f.after.status!==null);
const summary={query_count:qs.length,http_success_count:results.length,before:counts(all,'before'),after:counts(all,'after'),paired_before:counts(paired,'before'),paired_after:counts(paired,'after'),context_evidence:{found:all.filter(f=>!f.invalid&&f.context_has_evidence).length,denominator:all.filter(f=>!f.invalid).length}};
fs.writeFileSync(path.join(base,'scores.json'),JSON.stringify({summary,results},null,2),'utf8');
