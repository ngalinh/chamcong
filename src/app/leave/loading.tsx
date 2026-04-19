export default function Loading() {
  return (
    <main className="mx-auto max-w-md min-h-dvh px-safe pt-safe pb-safe flex flex-col gap-6 animate-pulse">
      <div className="pt-2 flex gap-2">
        <div className="h-10 w-10 rounded-full bg-neutral-200/60" />
        <div>
          <div className="h-3 w-16 rounded bg-neutral-200/60 mb-2" />
          <div className="h-7 w-24 rounded bg-neutral-200/60" />
        </div>
      </div>
      <div className="h-72 rounded-2xl bg-neutral-200/40" />
      <div className="h-32 rounded-2xl bg-neutral-200/40" />
    </main>
  );
}
