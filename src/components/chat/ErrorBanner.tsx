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
    <div
      role="alert"
      className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
    >
      <p className="font-medium">{message}</p>
      <p className="mt-1 text-red-800/80">
        You can also reach the team at{" "}
        <a
          href="mailto:hello@gocadre.ai"
          className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-red-600"
        >
          hello@gocadre.ai
        </a>
      </p>
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full border border-red-300 bg-white px-4 py-1.5 text-sm font-medium text-red-800 transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        >
          Try again
        </button>
      )}
    </div>
  );
}
