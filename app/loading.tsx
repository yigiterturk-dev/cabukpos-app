export default function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center" aria-busy="true">
      <div className="h-8 w-8 animate-pulse rounded-full bg-neutral-300" />
    </div>
  );
}
