const fs=require('fs');
const qs=JSON.parse(fs.readFileSync('_experiments/F1/queries.json','utf8'));
const root='C:/Users/hika0/AppData/Roaming/Claude-2/side-session-notes/local_75901231-cd58-40c3-96f2-906fa1b15187/data/';
const judgments={
 Q1:[[['partial','활성화/가중치 희소화; top-K와 학습 추정기는 없음'],['hit','top-K sparsification ... straight-through estimator']], [['miss','full-precision 및 1-bit 적용 범위 언급 없음'],['miss','모든 대형 언어 모델이라고만 언급']], [['contradict','14.4 GB/s'],['hit','25.60 GB/s']], [['contradict','300W 이상'],['hit','250 W']], [['miss','강력한 수요와 공급 제약 전망; 목표가 인상 언급 없음'],['miss','확인 불가']]],
 Q2:[[['partial','메모리 대역폭 (가중치 로딩); 전역 메모리에서 레지스터로의 이동은 미기재'],['hit','글로벌 메모리에서 레지스터로 전송']], [['contradict','상수 메모리에 저장 ... 브로드캐스트'],['miss','역양자화와 matmul 결합만 언급; LUT 복제·벡터화 없음']], [['contradict','24 GB/s'],['hit','32.00 GB/s']], [['hit','6핀 PCIe 보조 전원 커넥터'],['hit','1x 6-pin']]],
 Q3:[[['contradict','bug_report.php ... 1.1.0 ~ 1.1.7'],['hit','core/summary_api.php ... Summary ... 1.2.3 이전']], [['partial','BLOB (또는 64KB 초과 시 LONGBLOB)'],['hit','bin_data LONGBLOB']], [['hit','mysql_real_escape_string()'],['miss','구체적인 입력 처리 함수명을 확인할 수 없음']]],
 Q4:[[['unavailable','답변 없음: fetch failed'],['hit','State ... REJECTED']], [['unavailable','답변 없음: fetch failed'],['hit','No description available (설명 없음)']], [['unavailable','답변 없음: fetch failed'],['hit','application/vnd.openxmlformats-officedocument.wordprocessingml.document']], [['unavailable','답변 없음: fetch failed'],['hit','application/vnd.ms-word.document.macroEnabled.12']]]
};
const extra={
 Q1:{wall_ms:210809,hallucination:{before:['MSI GT 330 대역폭 14.4 GB/s 및 PSU 300W: 지정된 행과 불일치','Q-Sparse가 사전 학습이나 파인튜닝을 대체하지 않는다는 적용 범위: 초록의 학습·파인튜닝 적용과 상충','GTC 2024에 Rubin 로드맵과 B200·GB200 발표를 묶은 주장 및 수요·공급 전망: 제공된 목표 기사에서 확인 불가'],after:['CUDA 1.1을 CUDA 버전으로 확정하고 현대 프레임워크가 CUDA 7.5 이상 필요하다고 단정: 제공 사양표는 CUDA 값의 의미를 정의하지 않음','FP32 0.24에 TFLOPS 단위 부여: 전달된 사양에는 단위 없음']},after_declared_gaps:{declared:true,evidence:'GTC 발표 이후의 애널리스트 동향 ... 확인할 수 없습니다; 실행 가능성을 단정할 수 없습니다'}},
 Q2:{wall_ms:167262,hallucination:{before:['FLUTE LUT를 상수 메모리에 저장하고 브로드캐스트한다는 설명은 목표 논문 발췌로 뒷받침되지 않음','8600 GTS 대역폭 24 GB/s: 지정 사양 32.00 GB/s와 불일치'],after:['CUDA 1.1을 CUDA 버전/컴퓨트 능력으로 해석: 사양 필드의 의미가 확정되지 않음']},after_declared_gaps:{declared:true,evidence:'논문이 요구하는 최소 CUDA 버전 및 컴퓨트 캡빌리티가 초록에 명시되지 않음'}},
 Q3:{wall_ms:121542,hallucination:{before:['CVE 공격 위치 bug_report.php, 영향 버전 1.1.0~1.1.7, 수정 1.1.8: 지정 기록과 불일치'],after:['두 기록의 주제가 다르다는 관찰을 넘어 실제로 수정책 관계가 아니라고 단정: 제공 자료는 관계 부재를 입증하지 못함']},after_declared_gaps:{declared:true,evidence:'함수 본문이 생략되어 ... 함수명을 확인할 수 없음; 두 기록만으로 ... 판단할 수 없으며'}},
 Q4:{wall_ms:303893,hallucination:{before:[],after:['할당 기관이 atlassian이므로 Atlassian 제품군과 관련 있을 가능성이 높다는 추정: 제공 기록에는 영향 제품 정보가 없음','CVE 자료를 cve.org 기반이라고 출처 단정: 제공된 합성 덤프에서 해당 출처가 확인되지 않음']},after_declared_gaps:{declared:true,evidence:'어떤 제품, 어떤 진입 경로 ... 기술 설명이 없습니다; 원문 ... 확인해야 합니다'}}
};
const scores=qs.map(q=>{
 const run=JSON.parse(fs.readFileSync(`_experiments/F1/runs/${q.id}.json`,'utf8'));
 const pairs=run.pairs||[];
 const names=[...new Set(pairs.map(p=>p.researcher))];
 const procs=[...new Set(pairs.map(p=>p.procedure))];
 const compare=(expected,actual)=>({matched:expected.filter(x=>actual.includes(x)),missing:expected.filter(x=>!actual.includes(x)),extra:actual.filter(x=>!expected.includes(x))});
 const facts=q.gold_facts.map((f,i)=>{
  const row=fs.readFileSync(root+f.source_table+'.jsonl','utf8').trim().split(/\r?\n/).map(JSON.parse).find(x=>x.id===f.source_row_id);
  const all=pairs.flatMap(p=>p.materials||[]);
  const rowFound=all.some(m=>m.title===row.title || (m.text||'').includes(f.quote));
  const quoteFound=all.some(m=>(m.text||'').includes(f.quote)||(m.title||'').includes(f.quote));
  const [b,a]=judgments[q.id][i];
  return {id:f.id,validity:'valid',before:{status:b[0],evidence:b[1]},after:{status:a[0],evidence:a[1]},context_has_evidence:rowFound,context_has_exact_quote:quoteFound};
 });
 return {id:q.id,runId:run.runId,success:true,wall_ms:extra[q.id].wall_ms,answer_ms:{before:run.answers.before.ms,after:run.answers.after.ms},facts,routing:{researcherRouting:run.researcherRouting,procedureRouting:[...new Set(pairs.map(p=>p.procedureRouting))],actual_researchers:names,actual_pairs:pairs.map(p=>({researcher:p.researcher,procedure:p.procedure})),researchers:compare(q.expect_researchers,names),procedures:compare(q.expect_procedures,procs)},hallucination:extra[q.id].hallucination,after_declared_gaps:extra[q.id].after_declared_gaps};
});
const all=scores.flatMap(x=>x.facts);
const aggregate={facts:all.length,before_available:all.filter(x=>x.before.status!=='unavailable').length,after_available:all.filter(x=>x.after.status!=='unavailable').length,before_hits:all.filter(x=>x.before.status==='hit').length,after_hits:all.filter(x=>x.after.status==='hit').length,context_row_hits:all.filter(x=>x.context_has_evidence).length,context_quote_hits:all.filter(x=>x.context_has_exact_quote).length};
fs.writeFileSync('_experiments/F1/scores.json',JSON.stringify({scoring:'hit만 적중; unavailable은 적중률 분모에서 제외. context_has_evidence는 같은 행의 제목 또는 인용 발견, context_has_exact_quote는 실제 인용 전달 여부.',aggregate,queries:scores},null,2)+'\n','utf8');
