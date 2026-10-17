export function ErrorBanner({
  message,
  onRetry,
  canRetry,
}: {
  message: string;
  onRetry: () => void;
  canRetry: boolean;
}) {
  return (
    <div role="alert" className="flex animate-rise items-start gap-3 rounded-card bg-white p-4 text-sm shadow-pill">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cadre-red-tint">
        <svg viewBox="0 0 24 24" className="size-[18px] fill-none stroke-red-700 stroke-2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 17h.01" strokeLinecap="round" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{message}</p>
        <p className="mt-1 leading-relaxed text-ink-800">
          You can also reach the team at{" "}
          <a
            href="mailto:hello@gocadre.ai"
            className="font-medium text-cadre-red-deep underline decoration-cadre-red/35 underline-offset-[3px] hover:decoration-cadre-red focus-visible:outline-2 focus-visible:outline-cadre-red-dark"
          >
            hello@gocadre.ai
          </a>
        </p>
        {canRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-11 items-center rounded-full bg-sand px-5 text-sm font-medium text-ink ring-1 ring-hairline transition-colors hover:bg-sand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
