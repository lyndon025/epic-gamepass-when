import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

// 1. Create a Query Client with default options
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            gcTime: 1000 * 60 * 60 * 24, // 24 hours (keep in cache)
            staleTime: 1000 * 10,        // 10 seconds (consider fresh for 10s, then background refresh)
            retry: 1,
        },
    },
});

// 2. Create a Persister (Client-side LocalStorage)
export const persister = createSyncStoragePersister({
    storage: window.localStorage,
});
