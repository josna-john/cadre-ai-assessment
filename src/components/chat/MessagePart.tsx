import type { UIMessage } from "ai";
import { z } from "zod";
import { actionIdSchema, resolveActions } from "@/lib/actions";
import { clipSummary, handoffToolInputSchema } from "@/lib/handoff";
import { ActionButtons, ActionPlaceholder, isActionsOutput } from "./ActionButtons";
import { HandoffFallback, HandoffForm, isHandoffOffer } from "./HandoffForm";
import { Markdown } from "./Markdown";

type Part = UIMessage["parts"][number];

const showActionInputSchema = z.object({ actions: z.array(actionIdSchema) });

// One case per part type we render. Adding a tool is a new
// `case "tool-<name>"`; unknown parts render nothing.
//
// `hasHandoff`: this reply also shows the handoff form. The form is the lead
// capture, so a "Talk to an AI strategist" button beside it would be a second,
// competing way to reach the same team. The prompt asks the model not to pair
// them; this is the deterministic backstop.
//
// `finished`: the reply has stopped streaming. A tool call can end up never
// executed: a reply that hits the output-token cap ends before its tools run,
// and a stopped one ends mid-call. While streaming, a placeholder is right.
// After that it would pulse forever under text that says "use the buttons
// below", so each tool falls back to something real.
export function MessagePart({
  part,
  role,
  hasHandoff = false,
  finished = true,
}: {
  part: Part;
  role: UIMessage["role"];
  hasHandoff?: boolean;
  finished?: boolean;
}) {
  const withoutBooking = (actions: ReturnType<typeof resolveActions>) =>
    hasHandoff ? actions.filter((a) => a.id !== "book_call") : actions;

  switch (part.type) {
    case "text":
      // User text is shown verbatim; only assistant text gets markdown.
      return role === "assistant" ? (
        <Markdown text={part.text} />
      ) : (
        <p className="whitespace-pre-wrap">{part.text}</p>
      );

    case "tool-show_action":
      if (part.state === "output-available") {
        return isActionsOutput(part.output) ? <ActionButtons actions={withoutBooking(part.output.actions)} /> : null;
      }
      if (!finished && (part.state === "input-streaming" || part.state === "input-available")) {
        return <ActionPlaceholder />;
      }
      // Never executed, but the model finished choosing: its ids are checked
      // against the same allowlist the tool uses, so the buttons are safe.
      if (part.state === "input-available") {
        const input = showActionInputSchema.safeParse(part.input);
        return input.success ? <ActionButtons actions={withoutBooking(resolveActions(input.data.actions))} /> : null;
      }
      return null;

    case "tool-offer_handoff":
      if (part.state === "output-available") {
        return isHandoffOffer(part.output) ? <HandoffForm offer={part.output} /> : <HandoffFallback />;
      }
      if (part.state === "output-error") return <HandoffFallback />;
      if (!finished && (part.state === "input-streaming" || part.state === "input-available")) {
        return <ActionPlaceholder />;
      }
      // Never executed. A complete offer becomes the form (validated and
      // clipped exactly as the tool would); a cut-off one gets the direct
      // contact fallback, since the reply text promised a way to reach the team.
      if (part.state === "input-available") {
        const input = handoffToolInputSchema.safeParse(part.input);
        return input.success ? (
          <HandoffForm offer={{ topic: input.data.topic, summary: clipSummary(input.data.summary) }} />
        ) : (
          <HandoffFallback />
        );
      }
      if (part.state === "input-streaming") return <HandoffFallback />;
      return null;

    default:
      return null;
  }
}
