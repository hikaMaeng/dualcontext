import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const plugins = [remarkGfm];

/** 마크다운 요소를 이 화면의 토큰(글자색 · 경계선 · 배경)으로 꾸민다. 원문 HTML 은 렌더하지 않는다(react-markdown 기본). */
const components: ComponentProps<typeof Markdown>["components"] = {
  h1: (props) => <h4 className="mt-3 text-base font-semibold first:mt-0" {...props} />,
  h2: (props) => <h4 className="mt-3 text-base font-semibold first:mt-0" {...props} />,
  h3: (props) => <h5 className="mt-3 text-sm font-semibold first:mt-0" {...props} />,
  h4: (props) => <h5 className="mt-3 text-sm font-semibold first:mt-0" {...props} />,
  h5: (props) => <h5 className="mt-3 text-sm font-semibold first:mt-0" {...props} />,
  h6: (props) => <h5 className="mt-3 text-sm font-semibold first:mt-0" {...props} />,
  p: (props) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
  ul: (props) => <ul className="my-2 list-disc pl-5" {...props} />,
  ol: (props) => <ol className="my-2 list-decimal pl-5" {...props} />,
  blockquote: (props) => <blockquote className="my-2 border-l-2 border-line pl-3 text-muted" {...props} />,
  a: (props) => <a className="underline" target="_blank" rel="noreferrer noopener" {...props} />,
  hr: () => <hr className="my-3 border-line" />,
  pre: (props) => <pre className="my-2 overflow-auto rounded-md border border-line bg-canvas p-3 font-mono text-xs leading-5" {...props} />,
  code: ({ className, ...props }) => <code className={className ? `${className} font-mono` : "rounded bg-canvas px-1 py-0.5 font-mono text-[0.85em]"} {...props} />,
  table: (props) => <div className="my-2 overflow-auto"><table className="w-full border-collapse text-left text-xs" {...props} /></div>,
  th: (props) => <th className="border border-line px-2 py-1 font-semibold" {...props} />,
  td: (props) => <td className="border border-line px-2 py-1" {...props} />
};

export function MarkdownText({ text }: { text: string }) {
  return <Markdown remarkPlugins={plugins} components={components}>{text}</Markdown>;
}
