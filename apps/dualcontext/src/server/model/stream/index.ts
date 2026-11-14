/** OpenAI 호환 chat/completions 스트림(SSE)의 누적 결과. */
export type StreamResult = { content: string; reasoningChars: number; finished: boolean };

/**
 * SSE 본문을 끝까지 읽어 본문(content)과 추론(reasoning_content) 길이를 모은다.
 * 청크 경계가 줄 중간에 걸쳐도 이어 붙여 해석한다. onChunk 는 바이트가 올 때마다 불린다(유휴 시간 측정용).
 * 정상 종료는 `data: [DONE]` 또는 finish_reason 이 있는 조각을 본 경우다.
 */
export async function readChatStream(body: AsyncIterable<Uint8Array>, onChunk?: () => void, into?: StreamResult): Promise<StreamResult> {
  const decoder = new TextDecoder();
  // into 를 넘기면 읽는 도중(중단 포함)에도 호출자가 진행량을 볼 수 있다.
  const result: StreamResult = into ?? { content: "", reasoningChars: 0, finished: false };
  let buffer = "";
  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      result.finished = true;
      return;
    }
    let choice: { delta?: { content?: string; reasoning_content?: string }; finish_reason?: string | null } | undefined;
    try {
      choice = JSON.parse(data).choices?.[0];
    } catch {
      return;
    }
    if (choice?.delta?.content) result.content += choice.delta.content;
    if (choice?.delta?.reasoning_content) result.reasoningChars += choice.delta.reasoning_content.length;
    if (choice?.finish_reason) result.finished = true;
  };
  for await (const chunk of body) {
    onChunk?.();
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      handle(buffer.slice(0, newline).trim());
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  handle((buffer + decoder.decode()).trim());
  return result;
}
