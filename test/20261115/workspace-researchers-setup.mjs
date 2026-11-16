// F:\dev 의 프로젝트를 코드베이스 조사원(directory 출처, 컨테이너 안 workspace/<폴더>)으로 등록한다. 이미 있으면 건너뜀.
// 코드 파일이 거의 없는 폴더(muse1 · rpg1 · vibeprompt · relay-lab · comfy · youtube* 등)와 비공개 스테이징은 뺀다.
// node test/20261115/workspace-researchers-setup.mjs   (되돌리기: UNDO=1)
const base = "http://127.0.0.1:18081/api/admin";
const projects = [
  ["apibond", "Rust 로 만든 OpenAI·Anthropic·Responses API 세션 고정 본딩(bonding) 프록시", ["rust", "bonding", "api", "프록시"]],
  ["bsidesoft", "비사이드소프트 업무용 프로젝트 모음", ["bsidesoft", "비사이드소프트"]],
  ["clauding", "Claude Code 를 로컬·자체 호스팅 Messages API 에 붙여 실행하는 도구", ["claude code", "messages api", "로컬 모델"]],
  ["codebase-memory-mcp", "코드베이스 메모리 MCP 서버: 소스를 인덱싱해 호출 그래프와 아키텍처 검색을 제공", ["mcp", "codebase memory", "call graph", "인덱싱"]],
  ["codexmcp", "Codex CLI 웹 검색, 파일시스템, 터미널 명령 세 가지 독립 stdio MCP 서버", ["mcp", "codex", "stdio", "terminal"]],
  ["dms", "dms 서비스 모노레포(Turbo 캐시 설정 포함)", ["dms", "turbo"]],
  ["dualcontext", "dualcontext 자신: 확장된 Dual RAG MCP 서버(조사원·프로시저 라우팅, 관리자 사이트)", ["dualcontext", "dual rag", "조사원", "프로시저", "augment_context"]],
  ["ggufconverter", "모델을 GGUF 로 변환해 허깅페이스에 올리는 자동화 파이프라인", ["gguf", "변환", "허깅페이스", "양자화"]],
  ["issus", "에이전트용 이슈 서비스: 별칭별 받은편지함, ACK, COMPACT, 세션 push", ["issus", "inbox", "ack", "compact", "이슈"]],
  ["lmstudiothinkpatcher", "LM Studio 모델 폴더를 훑어 thinking 설정을 패치하는 Windows Forms 유틸리티", ["lm studio", "thinking", "patcher", "windows forms"]],
  ["ndx2", "TypeScript 기반 웹 서비스 중심 코딩 에이전트 프로젝트 ndx2", ["ndx2", "코딩 에이전트", "agent"]],
  ["ndx_business", "ndx 업무용 TypeScript Turbo 웹 서비스 모노레포", ["ndx", "business", "turbo"]],
  ["opencodesearch", "OpenCode 무료 모델로 출처 URL 이 붙은 웹 검색 결과를 만드는 독립 MCP 서버", ["opencode", "웹 검색", "mcp", "검색"]],
  ["p4", "P4 분산 추론 에이전트 저장소: 대형 모델 적재, 노드 배포 계획과 테스트 기록", ["p4", "분산 추론", "노드", "모델 적재"]],
  ["p4studio", "P4 Studio: P4 에이전트와 모델·노드·파이프라인 지식을 관리하는 웹 콘솔", ["p4 studio", "콘솔", "파이프라인", "노드"]],
  ["p4system", "P4 설치형 분산 추론 에이전트와 P4 Studio OUTER 웹서비스 통합 저장소", ["p4system", "분산 추론", "outer", "에이전트"]],
  ["pdfgpu", "PDFGPU: 공급자 독립 점진적 PDF 뷰어 코어(WebGPU)", ["pdf", "뷰어", "webgpu", "렌더링"]],
  ["pdfit", "PDFit: PDF 변환·처리 서비스(무료판)", ["pdfit", "pdf", "변환"]],
  ["pdfit-public-verify", "PDFit 공개 배포 검증용 사본", ["pdfit", "검증", "pdf"]],
  ["poseImages", "포즈 이미지 라이브러리 색인과 검색 도구", ["포즈", "이미지", "pose"]],
  ["relay", "Agent Relay 모노레포: 에이전트 간 메시지 릴레이", ["relay", "agent relay", "에이전트 통신"]],
  ["relaycast", "Relaycast: 에이전트를 위한 헤드리스 Slack", ["relaycast", "slack", "에이전트 채널"]],
  ["RLVR", "RLVR 실험용 TypeScript Turbo 웹 서비스 모노레포", ["rlvr", "강화학습", "turbo"]],
  ["rpg", "rpg 게임 프로젝트", ["rpg", "게임"]],
  ["vibeagent", "주요 오픈소스 코딩 에이전트 6종의 턴 루프와 내장 도구를 소스 레벨로 추적한 분석 저장소", ["coding agent", "turn loop", "built-in tools", "코딩 에이전트"]],
  ["voice", "로컬 설치형 TTS·ASR 웹 서비스(음성 합성과 인식)", ["tts", "asr", "voice", "음성 합성", "음성 인식"]],
  ["whodistibute", "WHO 가이드라인 기반 운영 지원 도구 모노레포(React 관리자 UI + Express API)", ["who", "가이드라인", "운영 지원"]],
  ["ytkit", "유튜브 스크립트 추출·장면 캡처·구간 저장 웹 서비스", ["ytkit", "유튜브", "자막", "yt-dlp"]],
  ["AIservice", "AIservice 프로젝트", ["aiservice"]]
];
const list = await (await fetch(`${base}/researchers`)).json();
for (const [folder, summary, keywords] of projects) {
  const name = `코드: ${folder}`;
  const found = list.find((r) => r.name === name);
  if (process.env.UNDO) { if (found) console.log((await fetch(`${base}/researchers/${found.id}`, { method: "DELETE" })).status, "삭제", name); continue; }
  if (found) { console.log("있음", name); continue; }
  const def = { name, description: `${folder} 프로젝트의 소스 코드. ${summary}. 이 프로젝트의 함수·클래스 구현, 모듈 구조, 호출 관계, 설정이 코드에서 어떻게 되어 있는지 묻는 질의를 맡는다.`, keywords: [folder, ...keywords, "소스 코드"], enabled: true, type: "codebase", procedureIds: [],
    config: { source: "directory", path: `workspace/${folder}`, refreshHours: 24, maxFiles: 3000, maxRepoMB: 100, maxIndexSeconds: 180, topK: 5 } };
  const r = await fetch(`${base}/researchers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(def) });
  console.log(r.status, name, r.ok ? "" : await r.text());
}
