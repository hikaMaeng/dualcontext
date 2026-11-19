/** OpenAI 호환 chat/completions 스트림(SSE)의 누적 결과. */
export type StreamResult = { content: string; reasoningChars: number; finished: boolean };

/** 스트림 가드(수신 상한)를 넘었다. 같은 요청을 다시 보내도 같으므로 재시도하지 않는다. */
export class StreamLimitError extends Error {}

/** 수신 상한. 줄 하나(개행 없는 입력 포함)와 누적 content 를 제한해 메모리와 동기 파싱 비용을 묶는다. */
export type StreamLimits = { maxContentChars: number; maxLineChars: number };

export const defaultStreamLimits: StreamLimits = { maxContentChars: 4_000_000, maxLineChars: 1_000_000 };

/**
 * SSE 본문을 끝까지 읽어 본문(content)과 추론(reasoning_content) 길이를 모은다.
 * 청크 경계가 줄 중간에 걸쳐도 이어 붙여 해석한다. onChunk 는 바이트가 올 때마다 불린다(유휴 시간 측정용).
 * 정상 종료는 `data: [DONE]` 또는 finish_reason 이 있는 조각을 본 경우이며, **종료 표지를 보면 바로 읽기를 멈추고** 스트림을 닫는다.
 * limits 를 넘으면 StreamLimitError 로 중단한다(수신 중에 검사하므로 전체를 받은 뒤 자르지 않는다).
 */
export async function readChatStream(body: AsyncIterable<Uint8Array>, onChunk?: () => void, into?: StreamResult, limits: StreamLimits = defaultStreamLimits): Promise<StreamResult> {
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
    if (result.content.length > limits.maxContentChars) throw new StreamLimitError(`chat content exceeded ${limits.maxContentChars} chars`);
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
    if (buffer.length > limits.maxLineChars) throw new StreamLimitError(`chat stream line exceeded ${limits.maxLineChars} chars`);
    // 종료 표지 뒤에는 더 읽지 않는다(for await 를 빠져나오면 이터레이터가 정리되어 연결이 닫힌다).
    if (result.finished) return result;
  }
  handle((buffer + decoder.decode()).trim());
  return result;
}
