import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '@/api/supabase';

/**
 * Enterprise push notifications.
 *
 * Architecture: Expo Push Service is the single transport — it delivers
 * through APNs on iOS and FCM on Android. Categories map to Android
 * channels (per-category importance / sound) and iOS action buttons
 * (quick reply, primary CTA, dismiss).
 */

export type NotificationCategory =
  | 'messages'
  | 'assignments'
  | 'mentions'
  | 'appointments'
  | 'deals'
  | 'payments'
  | 'tickets'
  | 'ai'
  | 'workflows'
  | 'announcements'
  | 'general';

export const CATEGORY_META: Record<NotificationCategory, { name: string; importance: Notifications.AndroidImportance }> = {
  messages: { name: 'New messages', importance: Notifications.AndroidImportance.HIGH },
  assignments: { name: 'Assignments', importance: Notifications.AndroidImportance.HIGH },
  mentions: { name: 'Mentions', importance: Notifications.AndroidImportance.HIGH },
  appointments: { name: 'Appointments', importance: Notifications.AndroidImportance.HIGH },
  deals: { name: 'Deals', importance: Notifications.AndroidImportance.DEFAULT },
  payments: { name: 'Payments', importance: Notifications.AndroidImportance.HIGH },
  tickets: { name: 'Tickets', importance: Notifications.AndroidImportance.HIGH },
  ai: { name: 'AI alerts', importance: Notifications.AndroidImportance.DEFAULT },
  workflows: { name: 'Workflow alerts', importance: Notifications.AndroidImportance.DEFAULT },
  announcements: { name: 'Announcements', importance: Notifications.AndroidImportance.DEFAULT },
  general: { name: 'General', importance: Notifications.AndroidImportance.DEFAULT },
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerAndroidChannels() {
  if (Platform.OS !== 'android') return;
  for (const [id, meta] of Object.entries(CATEGORY_META)) {
    await Notifications.setNotificationChannelAsync(id, {
      name: meta.name,
      importance: meta.importance,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#075E54',
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

async function registerIOSCategories() {
  await Notifications.setNotificationCategoryAsync('messages', [
    {
      identifier: 'REPLY',
      buttonTitle: 'Reply',
      textInput: { submitButtonTitle: 'Send', placeholder: 'Type a reply' },
    },
    { identifier: 'MARK_READ', buttonTitle: 'Mark read', options: { isDestructive: false, opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync('assignments', [
    { identifier: 'ACCEPT', buttonTitle: 'Accept' },
    { identifier: 'DECLINE', buttonTitle: 'Decline', options: { isDestructive: true } },
  ]);
  await Notifications.setNotificationCategoryAsync('appointments', [
    { identifier: 'JOIN', buttonTitle: 'Join' },
    { identifier: 'RESCHEDULE', buttonTitle: 'Reschedule' },
  ]);
  await Notifications.setNotificationCategoryAsync('tickets', [
    { identifier: 'OPEN', buttonTitle: 'Open ticket' },
    { identifier: 'RESOLVE', buttonTitle: 'Resolve' },
  ]);
  await Notifications.setNotificationCategoryAsync('payments', [{ identifier: 'VIEW', buttonTitle: 'View' }]);
  await Notifications.setNotificationCategoryAsync('deals', [{ identifier: 'VIEW', buttonTitle: 'Open deal' }]);
}

export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true, allowAnnouncements: true },
    });
    status = req.status;
  }
  if (status !== 'granted') return null;

  await registerAndroidChannels();
  await registerIOSCategories();

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const tokenResp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const token = tokenResp.data;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && token) {
    await supabase.from('push_tokens').upsert(
      {
        user_id: user.id,
        token,
        platform: Platform.OS,
        device_name: Device.deviceName ?? null,
        app_version: Constants.expoConfig?.version ?? null,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        disabled: false,
      },
      { onConflict: 'user_id,token' },
    );
  }
  return token;
}

/**
 * Route a tapped-notification / quick-action into the app.
 * Called from the listener wired in RootLayout.
 */
export async function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const actionUrl = typeof data?.actionUrl === 'string' ? data.actionUrl : null;
  const category = typeof data?.category === 'string' ? data.category : 'general';
  const notificationId = typeof data?.notificationId === 'string' ? data.notificationId : null;
  const actionId = response.actionIdentifier;
  const userText = (response as unknown as { userText?: string }).userText;

  // Mark read.
  if (notificationId) {
    supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId).then(() => {});
  }

  // Quick reply on messages.
  if (actionId === 'REPLY' && userText && typeof data?.conversationId === 'string') {
    supabase.from('messages').insert({
      conversation_id: data.conversationId,
      body: userText,
      direction: 'outbound',
    }).then(() => {});
    return;
  }
  if (actionId === 'MARK_READ') return;

  // Deep-link navigation.
  if (actionUrl) {
    router.push(actionUrl as never);
    return;
  }
  // Category-based fallbacks.
  const map: Partial<Record<string, string>> = {
    messages: '/(tabs)/inbox',
    assignments: '/(tabs)/inbox',
    mentions: '/(tabs)/inbox',
    appointments: '/sales/calendar',
    deals: '/sales/kanban',
    payments: '/(tabs)/commerce',
    tickets: '/(tabs)/inbox',
    ai: '/(tabs)/ai',
    workflows: '/notifications',
    announcements: '/notifications',
  };
  router.push((map[category] ?? '/notifications') as never);
}

export async function setBadgeCount(n: number) {
  await Notifications.setBadgeCountAsync(Math.max(0, n));
}

export async function unregisterPush() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('push_tokens').update({ disabled: true }).eq('user_id', user.id);
}
