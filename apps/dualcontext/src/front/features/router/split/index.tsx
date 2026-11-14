import type { SplitConfig, SplitMethod } from "dualcontext_domain/common";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input, Select, Textarea } from "../../../components/ui/input";
import { Field } from "../../../components/layout";
import type { Texts } from "../../../i18n";
import { RSC } from "./resource";

type Props = { config: SplitConfig; t: Texts; onChange: (config: SplitConfig) => void };

/** 질의 분해 설정: 복합 질의를 하위 질문으로 나누는 방법과 상한. */
export function SplitEditor({ config, t, onChange }: Props) {
  const set = (field: keyof SplitConfig, value: string | number) => onChange({ ...config, [field]: value });
  return (
    <Card role="group" aria-labelledby="split-heading">
      <CardHeader><CardTitle id="split-heading">{t[RSC.ROUTER_SPLIT_HEADING_TEXT]}</CardTitle></CardHeader>
      <CardContent className="grid gap-3">
        <p className="max-w-3xl text-sm text-muted">{t[RSC.ROUTER_SPLIT_HINT_MESSAGE]}</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label={t[RSC.ROUTER_SPLIT_METHOD_LABEL]}>
            <Select data-testid="split-method" value={config.method} onChange={(e) => set("method", e.target.value as SplitMethod)}>
              <option value="none">{t[RSC.ROUTER_SPLIT_METHOD_NONE_TEXT]}</option>
              <option value="heuristic">{t[RSC.ROUTER_SPLIT_METHOD_HEURISTIC_TEXT]}</option>
              <option value="llm">{t[RSC.ROUTER_SPLIT_METHOD_LLM_TEXT]}</option>
            </Select>
          </Field>
          <Field label={t[RSC.ROUTER_SPLIT_MAXPARTS_LABEL]}>
            <Input data-testid="split-maxparts" type="number" min={2} max={8} value={config.maxParts} onChange={(e) => set("maxParts", Number(e.target.value))} />
          </Field>
          <Field label={t[RSC.ROUTER_SPLIT_MINCHARS_LABEL]}>
            <Input data-testid="split-minchars" type="number" min={1} max={100} value={config.minChars} onChange={(e) => set("minChars", Number(e.target.value))} />
          </Field>
          <Field label={t[RSC.ROUTER_SPLIT_PARTTOPK_LABEL]}>
            <Input data-testid="split-parttopk" type="number" min={1} max={5} value={config.partTopK} onChange={(e) => set("partTopK", Number(e.target.value))} />
          </Field>
        </div>
        {config.method === "llm" && (
          <Field label={t[RSC.ROUTER_SPLIT_PROMPT_LABEL]}>
            <Textarea data-testid="split-prompt" className="min-h-32" value={config.prompt} onChange={(e) => set("prompt", e.target.value)} />
          </Field>
        )}
      </CardContent>
    </Card>
  );
}
