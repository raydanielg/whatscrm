import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { View, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { useAppStore } from '@/stores/appStore';
import { pending, flush } from '@/offline/outbox';

/**
 * Compact online/offline + outbox indicator. Used at the top of dashboards.
 */
export function SyncStatusBar() {
  const t = useTheme();
  const online = useAppStore((s) => s.networkOnline);
  const [queue, setQueue] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const tick = () => setQueue(pending().length);
    tick();
    const id = setInterval(tick, 3000);
    const unsub = NetInfo.addEventListener((s) => {
      const on = Boolean(s.isConnected && s.isInternetReachable !== false);
      useAppStore.getState().setNetworkOnline(on);
      if (on && pending().length) {
        setSyncing(true);
        flush().finally(() => {
          setSyncing(false);
          tick();
        });
      }
    });
    return () => {
      clearInterval(id);
      unsub();
    };
  }, []);

  const dotColor = !online ? t.colors.destructive : syncing || queue > 0 ? t.colors.warning : t.colors.success;
  const label = !online
    ? `Offline${queue ? ` • ${queue} pending` : ''}`
    : syncing
    ? `Syncing ${queue} change${queue === 1 ? '' : 's'}`
    : queue > 0
    ? `${queue} pending sync`
    : 'Online';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: t.radius.full,
        backgroundColor: t.colors.muted,
        alignSelf: 'flex-start',
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
      <Text style={{ color: t.colors.mutedFg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
