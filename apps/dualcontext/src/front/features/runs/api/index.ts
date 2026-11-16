import { api } from "../../../lib/api";
import type { ListQuery } from "../query";
import { buildListPath } from "./path";
import type { RunFilterOptions, RunListPage } from "./types";

export const listRuns = (query: ListQuery) => api<RunListPage>(buildListPath(query));
export const loadFilterOptions = () => api<RunFilterOptions>("/runs/filters");
export const deleteRun = (id: number) => api<void>(`/runs/${id}`, { method: "DELETE" });
