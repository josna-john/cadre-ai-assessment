import { Fragment, type ReactNode } from "react";
import { SOURCES, citedSources, splitCitations, type SourceId } from "@/lib/sources";

// A deliberately tiny markdown subset for assistant replies: paragraphs,
// **bold**, and bullet / numbered lists. Everything is rendered as React text
// nodes (never dangerouslySetInnerHTML), so model output cannot inject markup.
// Markdown links are intentionally not rendered. The only clickable URLs come
// from the show_action tool and from source markers ([[src:id]]), both resolved
// against allowlists (src/lib/actions.ts, src/lib/sources.ts).

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

// Wraps each word in a span that fades in when it mounts. Keys are positional,
// so as text streams in only the new words mount (and animate); earlier words
// keep their DOM nodes and stay still.
function fadeWords(text: string): ReactNode[] {
  return text.split(/(\s+)/).map((token, i) =>
    !token || /^\s+$/.test(token) ? (
      token
    ) : (
      <span key={i} className="animate-word">
        {token}
      </span>
    ),
  );
}

// A citation: a small numbered dot after the sentence it backs, so it reads as
// a footnote, not a call to action (D18). Hover or keyboard focus shows the
// page it opens; screen readers hear "Source: <page>".
function SourceLink({ id, n }: { id: SourceId; n: number }) {
  const { label, href } = SOURCES[id];
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // select-none: copying an answer to forward it should give clean prose,
      // not "1 Source: … (opens in a new tab)".
      className="group relative ml-0.5 inline-flex h-5 min-w-5 animate-word select-none items-center justify-center rounded-full bg-cadre-red-tint px-1.5 align-[2px] text-[11px] leading-none font-semibold text-cadre-red-deep no-underline transition-colors hover:bg-cadre-red-dark hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cadre-red-dark"
    >
      <span aria-hidden="true">{n}</span>
      <span className="sr-only">Source: {label} (opens in a new tab)</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label} · {new URL(href).hostname}
      </span>
    </a>
  );
}

// Prose with its citations swapped in, then **bold** spans and the word fade.
// `numbers` numbers sources in order across the whole reply, so a source cited
// twice keeps its number.
function renderInline(text: string, numbers: Map<SourceId, number>): ReactNode[] {
  return splitCitations(text).map((part, i) =>
    part.kind === "source" ? (
      <SourceLink key={i} id={part.id} n={numbers.get(part.id) ?? 0} />
    ) : (
      <Fragment key={i}>{renderBold(part.text)}</Fragment>
    ),
  );
}

// Splits on **bold** spans. An unclosed ** (common mid-stream) stays literal.
function renderBold(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4 ? (
      <strong key={i} className="font-semibold">
        {fadeWords(chunk.slice(2, -2))}
      </strong>
    ) : (
      <Fragment key={i}>{fadeWords(chunk)}</Fragment>
    ),
  );
}

// `sourceOrder`: every source the whole reply cites, in order. A reply can
// have several text parts (text before and after a tool call); numbering
// across all of them keeps the dots in step with the reply's Sources row.
export function Markdown({ text, sourceOrder }: { text: string; sourceOrder?: SourceId[] }) {
  const numbers = new Map((sourceOrder ?? citedSources(text)).map((id, i) => [id, i + 1]));
  const inline = (t: string) => renderInline(t, numbers);
  return (
    <div className="space-y-3">
      {parseBlocks(text).map((block, i) => {
        switch (block.kind) {
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ol>
            );
          case "paragraph":
            return <p key={i}>{inline(block.lines.join(" "))}</p>;
        }
      })}
    </div>
  );
}
