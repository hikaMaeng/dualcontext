import { BlockList, isIP } from "node:net";

/** 내부망 · 루프백 · 링크로컬(클라우드 메타데이터 169.254.169.254 포함) · 예약 대역. 클론 대상이 이 대역으로 풀리면 거부한다. */
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
// ::/96 은 IPv4 호환, 64:ff9b::/96 은 NAT64, 2002::/16 은 6to4 — 임의의 IPv4 로 돌릴 수 있어 통째로 막는다.
// (IPv4 매핑 ::ffff:a.b.c.d 는 BlockList 의 IPv6 규칙에 넣으면 모든 IPv4 가 걸리므로 아래에서 따로 푼다.)
for (const [net, prefix] of [["::", 96], ["64:ff9b::", 96], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32]] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** IP 문자열이 막힌 대역이면 true. IP 가 아닌 문자열도 true(판단 불가는 거부). */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 4) return blocked.check(address, "ipv4");
  // URL 파서로 ::ffff:127.0.0.1 과 ::ffff:7f00:1 을 같은 압축 꼴(16진 두 묶음)로 맞춘 뒤, 매핑 주소면 안의 IPv4 를 검사한다.
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (mapped !== null) {
    const high = parseInt(mapped[1] as string, 16);
    const low = parseInt(mapped[2] as string, 16);
    return blocked.check(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`, "ipv4");
  }
  return blocked.check(address, "ipv6");
}
