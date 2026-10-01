import { z } from "zod";

export const growthEventInput = z.object({
  type: z.enum(["sent", "delivered", "converted", "opt_out", "failed"]),
  externalId: z.string().trim().min(1).max(200),
  recipientRef: z.string().regex(/^hmac-sha256:[a-f0-9]{64}$/, "recipientRef hmac-sha256 referansı olmalı").optional(),
  amount: z.number().int().min(0).max(1_000_000_000).optional(),
  customerId: z.string().uuid().optional(),
}).superRefine((value, ctx) => {
  if (value.type === "opt_out" && !value.customerId) ctx.addIssue({ code: "custom", path: ["customerId"], message: "opt_out için müşteri kimliği gerekli" });
  if (value.type !== "opt_out" && value.customerId) ctx.addIssue({ code: "custom", path: ["customerId"], message: "müşteri kimliği yalnız opt_out için kullanılabilir" });
  if (["sent", "delivered", "converted"].includes(value.type) && !value.recipientRef) ctx.addIssue({ code: "custom", path: ["recipientRef"], message: "ölçüm olayı için recipientRef gerekli" });
});
