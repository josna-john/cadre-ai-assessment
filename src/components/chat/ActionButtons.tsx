import type { ResolvedAction } from "@/lib/actions";

// Tool output crosses the network as JSON, so check its shape before trusting it.
export function isActionsOutput(output: unknown): output is { actions: ResolvedAction[] } {
  if (!output || typeof output !== "object") return false;
  const actions = (output as { actions?: unknown }).actions;
  return (
    Array.isArray(actions) &&
    actions.every(
      (a) =>
        a &&
        typeof a === "object" &&
        typeof (a as ResolvedAction).id === "string" &&
        typeof (a as ResolvedAction).label === "string" &&
        typeof (a as ResolvedAction).href === "string",
    )
  );
}

export function ActionButtons({ actions }: { actions: ResolvedAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="flex animate-rise flex-wrap gap-2">
      {actions.map((action) => {
        const external = action.href.startsWith("http");
        return (
          <a
            key={action.id}
            href={action.href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="inline-flex items-center gap-1.5 rounded-full bg-cadre-blue px-4 py-3 text-sm sm:py-2 tracking-[-0.14px] text-white transition-colors hover:bg-cadre-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadre-blue"
          >
            {action.label}
            <span aria-hidden="true">{external ? "↗" : "→"}</span>
            {external && <span className="sr-only">(opens in a new tab)</span>}
          </a>
        );
      })}
    </div>
  );
}

export function ActionPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="h-8 w-40 animate-pulse rounded-full bg-ink/5"
    />
  );
}
