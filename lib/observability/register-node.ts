import { captureError, captureEvent } from "@/lib/observability/telemetry";

/** Node-only process hooks; keep process.on out of the Edge instrumentation bundle. */
export function registerNodeTelemetry() {
  process.on("uncaughtException", (err) => { void captureError("uncaughtException", err); });
  process.on("unhandledRejection", (reason) => { void captureError("unhandledRejection", reason); });
  void captureEvent("server.start", { runtime: "nodejs" });
}
