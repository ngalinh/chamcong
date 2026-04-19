export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-40 rounded-lg bg-neutral-200/60" />
      <div className="rounded-3xl bg-neutral-200/40 h-32" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="h-20 rounded-2xl bg-neutral-200/40" />
        <div className="h-20 rounded-2xl bg-neutral-200/40" />
        <div className="h-20 rounded-2xl bg-neutral-200/40" />
      </div>
      <div className="h-40 rounded-2xl bg-neutral-200/40" />
    </div>
  );
}
