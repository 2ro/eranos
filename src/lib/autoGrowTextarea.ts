/**
 * Resize a textarea to fit its content: collapse to `auto` first so shrinking
 * works, then grow to `scrollHeight`. Shared by the {@link AutoGrowTextarea}
 * component and by callers with bespoke textareas (e.g. {@link ProfileCard}'s
 * editable fields) that want the same behavior without the shared styling.
 */
export function autoGrowTextarea(el: HTMLTextAreaElement): void {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
