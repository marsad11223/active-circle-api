export type NotificationEventType =
  | 'booking_confirmed'
  | 'new_booking_host'
  | 'booking_pending'
  | 'booking_approved'
  | 'booking_declined'
  | 'activity_updated'
  | 'activity_cancelled'
  | 'activity_reminder_24h'
  | 'activity_reminder_1h'
  | 'new_message'
  | 'host_broadcast'
  | 'review_request'
  | 'feature_announcement';

export type NotificationPayload = {
  type: NotificationEventType;
  screen: string;
  entityId: string;
  params: Record<string, string>;
  sentAt: string;
};

export function buildNotificationData(
  type: NotificationEventType,
  screen: string,
  entityId: string,
  params: Record<string, string> = {},
): NotificationPayload {
  return {
    type,
    screen,
    entityId,
    params,
    sentAt: new Date().toISOString(),
  };
}
