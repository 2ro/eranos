/**
 * Date helpers for HTML `<input type="date">` fields. The browser's date
 * input expects a `YYYY-MM-DD` string in the user's local timezone, never
 * an ISO UTC string — these helpers produce that exact shape.
 */

/**
 * Today, formatted as `YYYY-MM-DD` in the user's local timezone — suitable
 * for the `min` attribute of a `<input type="date">` so users can't pick a
 * date in the past.
 */
export function getTodayDateInput(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}
