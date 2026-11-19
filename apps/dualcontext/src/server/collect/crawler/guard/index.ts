import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch } from "undici";

/** 허용하는 포트. 문서 사이트는 사실상 이 넷이면 된다. DB·관리 포트 같은 곳으로의 접근을 막는 목적이다. */
const allowedPorts = new Set(["", "80", "443", "8080", "8443"]);

type Range = [base: number[], bits: number];

/** 공인 인터넷이 아닌 IPv4 대역(사설 · 루프백 · 링크 로컬(클라우드 메타데이터 169.254.169.254 포함) · CGNAT · 문서용 · 멀티캐스트 · 예약). */
const blockedV4: Range[] = [
  [[0, 0, 0, 0], 8], [[10, 0, 0, 0], 8], [[100, 64, 0, 0], 10], [[127, 0, 0, 0], 8], [[169, 254, 0, 0], 16],
  [[172, 16, 0, 0], 12], [[192, 0, 0, 0], 24], [[192, 0, 2, 0], 24], [[192, 88, 99, 0], 24], [[192, 168, 0, 0], 16],
  [[198, 18, 0, 0], 15], [[198, 51, 100, 0], 24], [[203, 0, 113, 0], 24], [[224, 0, 0, 0], 4], [[240, 0, 0, 0], 4]
];

function inRange(octets: number[], [base, bits]: Range): boolean {
  let remaining = bits;
  for (let i = 0; i < 4 && remaining > 0; i += 1, remaining -= 8) {
    const mask = remaining >= 8 ? 0xff : (0xff << (8 - remaining)) & 0xff;
    if ((octets[i] & mask) !== (base[i] & mask)) return false;
  }
  return true;
}

const blockedV4Octets = (octets: number[]) => blockedV4.some((range) => inRange(octets, range));

function parseV4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return octets.every((value) => value >= 0 && value <= 255) ? octets : null;
}

/** IPv6 문자열을 8개의 16비트 값으로 푼다(`::` 축약과 끝의 점 표기 IPv4 포함). */
function parseV6(address: string): number[] | null {
  let text = address.toLowerCase().split("%")[0];
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const v4 = parseV4(tail[1]);
    if (!v4) return null;
    text = `${text.slice(0, -tail[1].length)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const rest = halves.length === 2 ? (halves[1] === "" ? [] : halves[1].split(":")) : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const fill = 8 - head.length - rest.length;
  if (halves.length === 2 && fill < 1) return null;
  const zeros = halves.length === 2 ? Array<string>(fill).fill("0") : [];
  const groups = [...head, ...zeros, ...rest].map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN));
  return groups.length === 8 && groups.every((value) => Number.isInteger(value)) ? groups : null;
}

/** 공인 주소가 아니면 true. 해석할 수 없는 문자열도 막는 쪽(true)으로 본다. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = parseV4(address);
    return octets === null || blockedV4Octets(octets);
  }
  if (family !== 6) return true;
  const groups = parseV6(address);
  if (groups === null) return true;
  const embedded = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
  const zeroPrefix = groups.slice(0, 5).every((value) => value === 0);
  if (zeroPrefix && groups[5] === 0xffff) return blockedV4Octets(embedded); // ::ffff:a.b.c.d (IPv4 매핑)
  if (zeroPrefix && groups[5] === 0) return groups[6] === 0 && groups[7] <= 1 ? true : blockedV4Octets(embedded); // :: · ::1 · IPv4 호환
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((value) => value === 0)) return blockedV4Octets(embedded); // NAT64
  if (groups[0] === 0x2002) return blockedV4Octets([groups[1] >> 8, groups[1] & 0xff, groups[2] >> 8, groups[2] & 0xff]); // 6to4
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 고유 로컬(AWS 메타데이터 fd00:ec2::254 포함)
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 링크 로컬
  if ((groups[0] & 0xff00) === 0xff00) return true; // ff00::/8 멀티캐스트
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true; // 문서용
  return false;
}

/** 호스트 이름만으로 내부망이 확실한 것: localhost 류, 점 없는 이름(compose 서비스 이름·사내 호스트), .local/.internal/.lan 류. */
export function isInternalHostname(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, "");
  if (isIP(name) !== 0) return false;
  return name === "localhost" || !name.includes(".") || /\.(localhost|local|internal|lan|home|corp|intranet|localdomain|svc|cluster\.local)$/.test(name);
}

export type Resolver = (host: string) => Promise<string[]>;

export const systemResolver: Resolver = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

export class BlockedUrlError extends Error {}

/**
 * 크롤해도 되는 URL 인지 검사하고 URL 객체를 돌려준다. http/https 만, 사용자 정보 없음, 허용 포트만,
 * 내부 호스트 이름 금지, 그리고 이름이 풀리는 모든 주소가 공인 주소여야 한다(하나라도 내부면 거부).
 */
export async function assertPublicUrl(raw: string, resolve: Resolver = systemResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError(`not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError(`scheme not allowed: ${url.protocol}`);
  if (url.username !== "" || url.password !== "") throw new BlockedUrlError("credentials in URL are not allowed");
  if (!allowedPorts.has(url.port)) throw new BlockedUrlError(`port not allowed: ${url.port}`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isInternalHostname(host)) throw new BlockedUrlError(`internal host name: ${host}`);
  const addresses = isIP(host) !== 0 ? [host] : await resolve(host).catch(() => []);
  if (addresses.length === 0) throw new BlockedUrlError(`host does not resolve: ${host}`);
  const bad = addresses.find(isBlockedAddress);
  if (bad !== undefined) throw new BlockedUrlError(`${host} resolves to a non-public address (${bad})`);
  return url;
}

/**
 * 연결 시점에 주소를 다시 검사하는 Agent. 검사와 연결 사이에 DNS 응답이 바뀌는 공격(rebinding)을 막는다:
 * 연결에 쓰는 주소를 이 lookup 이 직접 고르고, 공인 주소가 아니면 연결 자체를 거부한다.
 */
const pinnedAgent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dnsLookup(hostname, { all: true, verbatim: true })
        .then((entries) => {
          if (entries.length === 0 || entries.some((entry) => isBlockedAddress(entry.address))) {
            return callback(new BlockedUrlError(`${hostname} is not a public host`) as NodeJS.ErrnoException, "", 4);
          }
          if ((options as { all?: boolean }).all) return (callback as unknown as (error: null, addresses: unknown) => void)(null, entries);
          return callback(null, entries[0].address, entries[0].family);
        })
        .catch((error: NodeJS.ErrnoException) => callback(error, "", 4));
    }
  }
});

/**
 * robots.txt 처럼 이 서버가 직접 받는 요청용. 리다이렉트는 수동으로 따라가며 매번 URL 을 다시 검사하고,
 * 연결은 pinnedAgent 로 한다. 본문은 maxBytes 까지만 읽는다.
 */
export async function guardedGetText(
  raw: string,
  options: { maxBytes: number; timeoutMs: number; userAgent: string; resolve?: Resolver; signal?: AbortSignal }
): Promise<{ status: number; text: string } | null> {
  let current = raw;
  for (let hop = 0; hop <= 3; hop += 1) {
    const url = await assertPublicUrl(current, options.resolve);
    const timeout = AbortSignal.timeout(options.timeoutMs);
    const response = await fetch(url, { redirect: "manual", dispatcher: pinnedAgent, signal: options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]), headers: { "user-agent": options.userAgent } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) return null;
      current = new URL(location, url).href;
      continue;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body ?? []) {
      size += (chunk as Uint8Array).length;
      chunks.push(Buffer.from(chunk as Uint8Array));
      if (size >= options.maxBytes) break;
    }
    await response.body?.cancel().catch(() => undefined);
    return { status: response.status, text: Buffer.concat(chunks).toString("utf8").slice(0, options.maxBytes) };
  }
  return null;
}
