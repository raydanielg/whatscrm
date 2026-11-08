import { useEffect, type ReactNode } from 'react';
import * as Network from 'expo-network';
import { useAppStore } from '@/stores/appStore';
import { flush } from './outbox';
import { queryClient } from '@/api/queryClient';

/**
 * Watches connectivity, flushes the offline outbox on reconnect,
 * and invalidates React Query caches so screens refetch.
 */
export function NetworkGate({ children }: { children: ReactNode }) {
  const setOnline = useAppStore((s) => s.setNetworkOnline);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const state = await Network.getNetworkStateAsync();
      const online = !!state.isConnected && !!state.isInternetReachable;
      if (!alive) return;
      setOnline(online);
      if (online) {
        flush().finally(() => queryClient.invalidateQueries());
      }
    };
    check();
    const t = setInterval(check, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [setOnline]);

  return <>{children}</>;
}
