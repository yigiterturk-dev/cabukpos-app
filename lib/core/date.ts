/** Date-only values stored at legacy UTC midnight represent the whole Istanbul calendar day. */
export function endOfStoredIstanbulDay(date: Date): Date {
  if (date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0 || date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) return date;
  return new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999+03:00`);
}
