// #57: Sunucu tarafı telemetri kablolaması (register + onRequestError). Next 16 dosya sözleşmesi.
type ErrorRequest = { path: string; method: string; headers: NodeJS.Dict<string | string[]> };
type ErrorContext = { routerKind: string; routePath: string; routeType: "render" | "route" | "action" | "proxy"; revalidateReason?: string };

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { captureError, captureEvent } = await import("@/lib/observability/telemetry");
  process.on("uncaughtException", (err) => { void captureError("uncaughtException", err); });
  process.on("unhandledRejection", (reason) => { void captureError("unhandledRejection", reason); });
  void captureEvent("server.start", { runtime: process.env.NEXT_RUNTIME ?? "node" });
}

export async function onRequestError(err: unknown, request: ErrorRequest, context: ErrorContext) {
  const { captureError } = await import("@/lib/observability/telemetry");
  await captureError(`request.${context.routeType}`, err, { path: request.path, method: request.method, routePath: context.routePath });
}
