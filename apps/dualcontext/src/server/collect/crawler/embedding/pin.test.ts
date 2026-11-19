import assert from "node:assert/strict";
import test from "node:test";
import { pinEmbedder } from "./index.js";

test("pinned 를 지원하는 모델 클라이언트면 설정을 한 번 읽은 값으로 고정해 호출한다(A→B→A 변경에도 안전)", async () => {
  let model = "A";
  const used: string[] = [];
  const port = {
    settings: async () => ({ embedding: { baseUrl: "http://e", model } }),
    embed: async () => { throw new Error("고정 클라이언트를 써야 한다"); },
    pinned: (ai: { embedding: { model: string } }) => ({ embed: async (texts: string[]) => { used.push(ai.embedding.model); return texts.map(() => [1]); } })
  };
  const embedder = await pinEmbedder(port);
  assert.equal(embedder.key, "A");
  model = "B";
  await embedder.embed(["x"]);
  model = "A";
  await embedder.embed(["y"]);
  assert.deepEqual(used, ["A", "A"], "중간에 설정이 바뀌었다 돌아와도 처음 읽은 설정으로만 호출한다");
});

test("pinned 가 없는 포트는 호출 앞뒤 설정 비교로 폴백한다(바뀌면 벡터를 버린다)", async () => {
  let model = "A";
  const port = {
    settings: async () => ({ embedding: { baseUrl: "http://e", model } }),
    embed: async (texts: string[]) => { model = "B"; return texts.map(() => [1]); }
  };
  const embedder = await pinEmbedder(port);
  await assert.rejects(embedder.embed(["x"]), /settings changed/);
});
