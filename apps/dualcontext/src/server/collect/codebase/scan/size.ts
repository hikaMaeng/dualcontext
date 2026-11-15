import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

/** 폴더 트리의 바이트 합(심볼릭 링크는 따라가지 않는다). limit 을 넘으면 거기서 멈추고 그때까지의 합을 돌려준다. */
export async function treeSize(root: string, limit: number): Promise<number> {
  let total = 0;
  const stack = [root];
  while (stack.length > 0 && total <= limit) {
    const current = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) total += (await lstat(full).catch(() => ({ size: 0 }))).size;
    }
  }
  return total;
}
