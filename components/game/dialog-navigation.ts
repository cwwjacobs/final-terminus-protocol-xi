import type { KeyboardEvent } from 'react';

const selector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]';
export function dialogControls(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(node => node.getClientRects().length > 0);
}

export function trapDialogTab(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return;
  const nodes = dialogControls(event.currentTarget), first = nodes[0], last = nodes.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

/** Controller navigation follows the visible reading order; no pointer is required. */
export function navigateDialog(root: HTMLElement, direction: 'up' | 'down' | 'left' | 'right') {
  const nodes = dialogControls(root), current = document.activeElement as HTMLElement | null;
  const delta = direction === 'up' || direction === 'left' ? -1 : 1;
  if ((direction === 'left' || direction === 'right') && current && root.contains(current)) {
    if (current instanceof HTMLSelectElement) {
      current.selectedIndex = Math.max(0, Math.min(current.options.length - 1, current.selectedIndex + delta));
      current.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (current instanceof HTMLInputElement && ['range', 'number'].includes(current.type)) {
      if (delta > 0) current.stepUp(); else current.stepDown();
      current.dispatchEvent(new Event('input', { bubbles: true }));
      current.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }
  const index = current ? nodes.indexOf(current) : -1;
  const next = nodes[(index + delta + nodes.length) % nodes.length];
  next?.focus({ preventScroll: true }); next?.scrollIntoView({ block: 'nearest' });
}
