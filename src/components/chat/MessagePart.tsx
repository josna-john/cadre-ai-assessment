import type { UIMessage } from "ai";
import { ActionButtons, ActionPlaceholder, isActionsOutput } from "./ActionButtons";
import { HandoffFallback, HandoffForm, isHandoffOffer } from "./HandoffForm";
import { Markdown } from "./Markdown";

type Part = UIMessage["parts"][number];

// One case per part type we render. Adding a tool is a new
// `case "tool-<name>"`; unknown parts render nothing.
//
// `hasHandoff`: this reply also shows the handoff form. The form is the lead
// capture, so a "Talk to an AI strategist" button beside it would be a second,
// competing way to reach the same team. The prompt asks the model not to pair
// them; this is the deterministic backstop.
export function MessagePart({
  part,
  role,
  hasHandoff = false,
}: {
  part: Part;
  role: UIMessage["role"];
  hasHandoff?: boolean;
}) {
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
        return isActionsOutput(part.output) ? (
          <ActionButtons
            actions={hasHandoff ? part.output.actions.filter((a) => a.id !== "book_call") : part.output.actions}
          />
        ) : null;
      }
      if (part.state === "input-streaming" || part.state === "input-available") {
        return <ActionPlaceholder />;
      }
      return null;

    case "tool-offer_handoff":
      if (part.state === "output-available") {
        return isHandoffOffer(part.output) ? <HandoffForm offer={part.output} /> : <HandoffFallback />;
      }
      if (part.state === "output-error") return <HandoffFallback />;
      if (part.state === "input-streaming" || part.state === "input-available") {
        return <ActionPlaceholder />;
      }
      return null;

    default:
      return null;
  }
}
