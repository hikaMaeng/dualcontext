export type RegexRequest = { id: string; include: string[]; exclude: string[]; targets: string[] };

export type RegexReply =
  | { type: "started"; id: string }
  | { type: "done"; id: string; wanted: boolean[] }
  | { type: "failed"; id: string; message: string };
