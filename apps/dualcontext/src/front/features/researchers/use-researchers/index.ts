import { useCallback, useEffect, useState } from "react";
import type { Procedure, Researcher } from "dualcontext_domain/common";
import { api } from "../../../lib/api";

export type ResearchersData = {
  items: Researcher[];
  procedures: Procedure[];
  /** 개별 라우터를 처음 켤 때 채울 LLM 단계의 기본 프롬프트(서버가 준다). */
  individualPrompt: string;
  /** 처음 읽기를 마쳤는가(실패해도 true — failed 로 구분한다). */
  loaded: boolean;
  failed: boolean;
  reload: () => Promise<void>;
};

/** 조사원 · 프로시저 목록과 개별 라우터 기본 프롬프트를 읽는다. reload 는 저장 · 삭제 뒤에 목록을 다시 읽는다. */
export function useResearchers(): ResearchersData {
  const [items, setItems] = useState<Researcher[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [individualPrompt, setIndividualPrompt] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [researchers, linked, defaults] = await Promise.all([
        api<Researcher[]>("/researchers"),
        api<Procedure[]>("/procedures"),
        api<{ prompts: { individual: string } }>("/router/defaults")
      ]);
      setItems(researchers);
      setProcedures(linked);
      setIndividualPrompt(defaults.prompts.individual);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  return { items, procedures, individualPrompt, loaded, failed, reload };
}
