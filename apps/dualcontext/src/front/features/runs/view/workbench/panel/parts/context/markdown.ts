/** 줄 단위로 마크다운 구문(제목 · 목록 · 코드 울타리 · 표 · 인용 · 가로선)이 하나라도 있거나 글 안에 굵게 · 링크 표기가 있는가. */
const blockSyntax = /^(\s{0,3}#{1,6}\s+\S|\s*[-*+]\s+\S|\s*\d+[.)]\s+\S|\s*```|\s*>\s?\S|\s*\|.*\|\s*$|\s*([-*_])\2{2,}\s*$)/m;
const inlineSyntax = /(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`)/;

export function looksLikeMarkdown(text: string): boolean {
  return blockSyntax.test(text) || inlineSyntax.test(text);
}
