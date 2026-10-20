/** Dispatched after transfer settle/sync so NotificationBell can refresh. */
export const NOTIFICATIONS_CHANGED_EVENT = 'airafin:notifications-changed';

export function notifyNotificationsChanged(period?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { period } }),
  );
}

/** Dispatched after a change that can move spent or remaining. */
export const SUMMARY_CHANGED_EVENT = 'airafin:summary-changed';

export function notifySummaryChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SUMMARY_CHANGED_EVENT));
}
