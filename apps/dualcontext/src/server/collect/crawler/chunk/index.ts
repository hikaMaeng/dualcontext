import { parseTitle } from "./title.js";

export type Chunk ={ index: number; heading: string; text: string };

/**
 * 마크다운을 검색용 조각으로 나눈다. 제목(#)에서 먼저 끊고, 한 절이 chunkChars 보다 길면 문단 → 문장 경계에서 자른다.
 * 각 조각 앞에는 가장 가까운 제목을 붙여(검색 때 맥락이 남도록) 저장한다. 너무 짧은 조각(<40자)은 앞 조각에 붙인다.
 */
export function chunkMarkdown(markdown: string, chunkChars: number): Chunk[] {
  const sections: { heading: string; body: string }[] = [];
  let heading = "";
  let lines: string[] = [];
  let inFence = false;
  const flush = () => {
    const body = lines.join("\n").trim();
    if (body !== "") sections.push({ heading, body });
    lines = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const title = !inFence ? parseTitle(line) : null;
    if (title !== null) {
      flush();
      heading = title;
    } else lines.push(line);
  }
  flush();

  const pieces: { heading: string; text: string }[] = [];
  for (const section of sections) {
    for (const text of splitBody(section.body, chunkChars)) {
      const last = pieces[pieces.length - 1];
      if (text.length < 40 && last && last.heading === section.heading && last.text.length + text.length < chunkChars) last.text += `\n\n${text}`;
      else pieces.push({ heading: section.heading, text });
    }
  }
  return pieces.map((piece, index) => ({ index, heading: piece.heading, text: piece.heading ? `${piece.heading}\n${piece.text}` : piece.text }));
}

function splitBody(body: string, max: number): string[] {
  if (body.length <= max) return [body];
  const out: string[] = [];
  let buffer = "";
  const push = (part: string) => {
    if (buffer !== "" && buffer.length + part.length + 2 > max) {
      out.push(buffer);
      buffer = "";
    }
    buffer = buffer === "" ? part : `${buffer}\n\n${part}`;
  };
  for (const paragraph of body.split(/\n{2,}/)) {
    if (paragraph.length <= max) push(paragraph);
    else for (const sentence of hardSplit(paragraph, max)) push(sentence);
  }
  if (buffer !== "") out.push(buffer);
  return out;
}

/** 문단 하나가 한도를 넘을 때: 문장 끝(. ? ! 。 다음 공백)에서, 없으면 한도에서 자른다. */
function hardSplit(text: string, max: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "), window.lastIndexOf("。"), window.lastIndexOf("\n"));
    const at = cut > max * 0.5 ? cut + 1 : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest !== "") parts.push(rest);
  return parts;
}
