/** Dispatched after transfer settle/sync so NotificationBell can refresh. */
export const NOTIFICATIONS_CHANGED_EVENT = 'airafin:notifications-changed';

export function notifyNotificationsChanged(period?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { period } }),
  );
}
