import type { ReactNode } from "react";

// A deliberately tiny markdown subset for assistant replies: paragraphs,
// **bold**, and bullet / numbered lists. Everything is rendered as React text
// nodes (never dangerouslySetInnerHTML), so model output cannot inject markup.
// Links are intentionally not rendered: the only clickable URLs come from the
// show_action tool, which resolves ids against an allowlist.

type Block =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const line of text.split("\n")) {
    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);

    if (!line.trim()) {
      flush();
    } else if (bullet) {
      if (current?.kind !== "ul") flush();
      current ??= { kind: "ul", items: [] };
      (current as Extract<Block, { kind: "ul" }>).items.push(bullet[1]);
    } else if (numbered) {
      if (current?.kind !== "ol") flush();
      current ??= { kind: "ol", items: [] };
      (current as Extract<Block, { kind: "ol" }>).items.push(numbered[1]);
    } else {
      if (current?.kind !== "paragraph") flush();
      current ??= { kind: "paragraph", lines: [] };
      (current as Extract<Block, { kind: "paragraph" }>).lines.push(line.trim());
    }
  }
  flush();
  return blocks;
}

// Splits on **bold** spans. An unclosed ** (common mid-stream) stays literal.
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4 ? (
      <strong key={i} className="font-semibold">
        {chunk.slice(2, -2)}
      </strong>
    ) : (
      chunk
    ),
  );
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {parseBlocks(text).map((block, i) => {
        switch (block.kind) {
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case "paragraph":
            return <p key={i}>{renderInline(block.lines.join(" "))}</p>;
        }
      })}
    </div>
  );
}
