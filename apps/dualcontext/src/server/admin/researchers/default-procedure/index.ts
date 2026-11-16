/**
 * 기본 프로시저 검증(순수). 기본 프로시저는 그 조사원에 연결된 프로시저여야 한다.
 * 연결을 해제하면서 그것을 기본으로 남기는 요청도 같은 규칙으로 거절한다(자동 해제하지 않는다. 본문이 저장 후 상태 전체이므로 모순은 호출자가 고친다).
 * 문제가 없으면 null, 있으면 400 본문에 실을 설명.
 */
export function defaultProcedureProblem(procedureIds: number[], defaultProcedureId: number | null): string | null {
  if (defaultProcedureId === null || procedureIds.includes(defaultProcedureId)) return null;
  return `defaultProcedureId ${defaultProcedureId} must be one of the researcher's procedureIds (${procedureIds.join(", ") || "none linked"}); link it or set defaultProcedureId to null`;
}
