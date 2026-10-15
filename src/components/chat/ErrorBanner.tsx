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
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-100"
    >
      <p className="font-medium">{message}</p>
      <p className="mt-1 text-red-800/80 dark:text-red-200/80">
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
          className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-red-400/40 dark:bg-transparent dark:text-red-100 dark:hover:bg-red-400/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}
