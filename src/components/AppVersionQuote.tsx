export function AppVersionQuote() {
  const version = import.meta.env.VITE_APP_VERSION ?? "0.0.0";
  const sha = import.meta.env.VITE_GIT_SHA ?? "";
  const label = sha ? `v${version} · ${sha}` : `v${version}`;

  return (
    <p
      className="fixed top-2 right-2 z-[100] pointer-events-none max-w-[min(100vw-1rem,12rem)] truncate text-right text-[10px] leading-tight text-muted-foreground/60 tabular-nums tracking-tight select-none"
      title={label}
      aria-hidden
    >
      {label}
    </p>
  );
}
