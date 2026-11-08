import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { kv } from '@/lib/storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000, // 1 day — offline cache
      retry: 2,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'offlineFirst', retry: 1 },
  },
});

// MMKV-backed persister (wrapper matching AsyncStorage interface).
const persister = createAsyncStoragePersister({
  storage: {
    getItem: async (k) => kv.getString(k) ?? null,
    setItem: async (k, v) => kv.set(k, v),
    removeItem: async (k) => kv.delete(k),
  },
  key: 'wacrm-query-cache',
  throttleTime: 1_000,
});

persistQueryClient({
  queryClient,
  persister,
  maxAge: 24 * 60 * 60 * 1000,
  buster: 'v1',
});
