import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isBlockedAddress } from "./address.js";

export type Lookup = (host: string) => Promise<string[]>;

const systemLookup: Lookup = async (host) => (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

/**
 * 호스트를 풀어 모든 주소가 공개 주소인지 확인하고 하나를 돌려준다. 하나라도 내부 주소면 거부한다.
 * 돌려준 주소는 git 에 고정(curloptResolve)해, 검사와 접속 사이에 DNS 가 바뀌는 재바인딩을 막는다.
 */
export async function resolveSafe(host: string, resolver: Lookup = systemLookup): Promise<string> {
  const bare = host.replace(/^\[|\]$/g, "");
  const addresses = isIP(bare) !== 0 ? [bare] : await resolver(bare);
  if (addresses.length === 0) throw new Error("repository host did not resolve");
  for (const address of addresses) {
    if (isBlockedAddress(address)) throw new Error("repository host resolves to a private or reserved address");
  }
  return addresses[0] as string;
}
