import { pinProblem } from "@/lib/auth/pin";

export function setupPinProblem(pin: string, confirmation: string): string | null {
  return pinProblem(pin) ?? (pin !== confirmation ? "PIN tekrarını aynı girin." : null);
}
