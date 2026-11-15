import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input, Textarea } from "../../../components/ui/input";
import { Field } from "../../../components/layout";
import { api, splitList } from "../../../lib/api";
import type { Texts } from "../../../i18n";
import { RSC } from "./resource";

/** 크롤러 조사원 설정 폼 상태. 입력은 문자열로 들고 있다가 저장할 때 숫자·배열로 바꾼다. */
export type CrawlerForm = {
  startUrls: string;
  allowedDomains: string;
  depth: string;
  maxPages: string;
  delayMs: string;
  refreshHours: string;
  maxCrawlSeconds: string;
  chunkChars: string;
  minScore: string;
  perPage: string;
  includePatterns: string;
  excludePatterns: string;
};

export const blankCrawler: CrawlerForm = {
  startUrls: "", allowedDomains: "", depth: "1", maxPages: "30", delayMs: "1000", refreshHours: "24",
  maxCrawlSeconds: "120", chunkChars: "1000", minScore: "0.5", perPage: "2", includePatterns: "", excludePatterns: ""
};

export function toCrawlerForm(config: Record<string, unknown>): CrawlerForm {
  const list = (value: unknown) => (Array.isArray(value) ? value.join("\n") : "");
  const text = (value: unknown, fallback: string) => (value === undefined || value === null ? fallback : String(value));
  return {
    startUrls: list(config.startUrls), allowedDomains: list(config.allowedDomains), depth: text(config.depth, blankCrawler.depth),
    maxPages: text(config.maxPages, blankCrawler.maxPages), delayMs: text(config.delayMs, blankCrawler.delayMs),
    refreshHours: text(config.refreshHours, blankCrawler.refreshHours), maxCrawlSeconds: text(config.maxCrawlSeconds, blankCrawler.maxCrawlSeconds),
    chunkChars: text(config.chunkChars, blankCrawler.chunkChars), minScore: text(config.minScore, blankCrawler.minScore),
    perPage: text(config.perPage, blankCrawler.perPage), includePatterns: list(config.includePatterns), excludePatterns: list(config.excludePatterns)
  };
}

export function toCrawlerConfig(form: CrawlerForm, topK: number) {
  const lines = (text: string) => splitList(text, /\r?\n|,/);
  return {
    startUrls: lines(form.startUrls), allowedDomains: lines(form.allowedDomains), depth: Number(form.depth), maxPages: Number(form.maxPages),
    delayMs: Number(form.delayMs), refreshHours: Number(form.refreshHours), maxCrawlSeconds: Number(form.maxCrawlSeconds),
    chunkChars: Number(form.chunkChars), minScore: Number(form.minScore), perPage: Number(form.perPage),
    includePatterns: lines(form.includePatterns), excludePatterns: lines(form.excludePatterns), topK
  };
}

type Status = { status: "idle" | "running" | "ok" | "error"; running: boolean; pages: number; chunks: number; finishedAt: string | null; error: string | null };

/** 저장된 크롤러 조사원의 캐시 상태와 「지금 크롤」「캐시 지우기」. 크롤이 도는 동안 2초마다 상태를 다시 읽는다. */
function CrawlerStatus({ id, t }: { id: number; t: Texts }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    try {
      setStatus(await api<Status>(`/researchers/${id}/crawl`));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => void load(), [id]);
  useEffect(() => {
    if (!status?.running) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [status?.running, id]);

  const act = async (method: "POST" | "DELETE") => {
    try {
      await api(`/researchers/${id}/crawl`, { method });
      await load();
    } catch {
      setFailed(true);
    }
  };

  const state = status === null ? null : status.running ? RSC.RESEARCHERS_CRAWLER_STATE_RUNNING_STATUS : status.status === "ok" ? RSC.RESEARCHERS_CRAWLER_STATE_OK_STATUS : status.status === "error" ? RSC.RESEARCHERS_CRAWLER_STATE_ERROR_ALERT : RSC.RESEARCHERS_CRAWLER_STATE_IDLE_STATUS;
  return (
    <fieldset className="grid gap-2 rounded-md border border-line p-3" data-testid="crawler-status">
      <legend className="px-1 text-sm text-muted">{t[RSC.RESEARCHERS_CRAWLER_STATUS_LABEL]}</legend>
      {state !== null && (
        <p role={status?.status === "error" && !status.running ? "alert" : "status"} className="text-sm">
          {t[state]}
          {status && status.status !== "idle" && ` · ${t[RSC.RESEARCHERS_CRAWLER_PAGES_LABEL]} ${status.pages} · ${t[RSC.RESEARCHERS_CRAWLER_CHUNKS_LABEL]} ${status.chunks}`}
          {status?.finishedAt && ` · ${t[RSC.RESEARCHERS_CRAWLER_FINISHED_LABEL]} ${new Date(status.finishedAt).toLocaleString()}`}
          {status?.error && ` · ${status.error}`}
        </p>
      )}
      {failed && <p role="alert" className="text-sm text-danger">{t[RSC.RESEARCHERS_CRAWLER_STATE_ERROR_ALERT]}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={status?.running} onClick={() => void act("POST")}>{t[RSC.RESEARCHERS_CRAWLER_CRAWLNOW_BUTTON]}</Button>
        <Button type="button" variant="outline" size="sm" disabled={status?.running} onClick={() => void act("DELETE")}>{t[RSC.RESEARCHERS_CRAWLER_CLEAR_BUTTON]}</Button>
      </div>
    </fieldset>
  );
}

/** 타입 `crawler` 의 설정 입력 영역. 저장된 조사원(id 있음)이면 캐시 상태 패널도 보인다. */
export function CrawlerFields({ value, onChange, id, t }: { value: CrawlerForm; onChange: (next: CrawlerForm) => void; id: number | null; t: Texts }) {
  const set = (key: keyof CrawlerForm, next: string) => onChange({ ...value, [key]: next });
  const number = (key: keyof CrawlerForm, label: RSC, min: number, max: number, step?: number) => (
    <Field label={t[label]}><Input type="number" min={min} max={max} step={step} value={value[key]} onChange={(e) => set(key, e.target.value)} /></Field>
  );
  return (
    <div className="grid gap-3" data-testid="crawler-fields">
      <p className="max-w-3xl text-sm text-muted">{t[RSC.RESEARCHERS_CRAWLER_HINT_MESSAGE]}</p>
      <Field label={t[RSC.RESEARCHERS_CRAWLER_STARTURLS_LABEL]}><Textarea required rows={3} value={value.startUrls} onChange={(e) => set("startUrls", e.target.value)} /></Field>
      <Field label={t[RSC.RESEARCHERS_CRAWLER_DOMAINS_LABEL]}><Textarea rows={2} value={value.allowedDomains} onChange={(e) => set("allowedDomains", e.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        {number("depth", RSC.RESEARCHERS_CRAWLER_DEPTH_LABEL, 0, 3)}
        {number("maxPages", RSC.RESEARCHERS_CRAWLER_MAXPAGES_LABEL, 1, 200)}
        {number("delayMs", RSC.RESEARCHERS_CRAWLER_DELAY_LABEL, 500, 60000)}
        {number("refreshHours", RSC.RESEARCHERS_CRAWLER_REFRESH_LABEL, 1, 720)}
        {number("maxCrawlSeconds", RSC.RESEARCHERS_CRAWLER_MAXSECONDS_LABEL, 10, 600)}
        {number("chunkChars", RSC.RESEARCHERS_CRAWLER_CHUNKCHARS_LABEL, 300, 4000)}
        {number("minScore", RSC.RESEARCHERS_CRAWLER_MINSCORE_LABEL, 0, 1, 0.05)}
        {number("perPage", RSC.RESEARCHERS_CRAWLER_PERPAGE_LABEL, 1, 5)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t[RSC.RESEARCHERS_CRAWLER_INCLUDE_LABEL]}><Textarea rows={2} value={value.includePatterns} onChange={(e) => set("includePatterns", e.target.value)} /></Field>
        <Field label={t[RSC.RESEARCHERS_CRAWLER_EXCLUDE_LABEL]}><Textarea rows={2} value={value.excludePatterns} onChange={(e) => set("excludePatterns", e.target.value)} /></Field>
      </div>
      {id === null ? <p className="text-sm text-muted">{t[RSC.RESEARCHERS_CRAWLER_SAVEFIRST_MESSAGE]}</p> : <CrawlerStatus id={id} t={t} />}
    </div>
  );
}
