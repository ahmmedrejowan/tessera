import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { Settings, SettingsPatch } from '@shared/types';
import { call, on } from '../api';

export const queryClient = new QueryClient({
  defaultOptions: {
    // Data comes from the local main process: it's fresh until main says it changed.
    queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: false },
  },
});

export const keys = {
  settings: ['settings'] as const,
  appInfo: ['app-info'] as const,
};

export function useSettings() {
  const client = useQueryClient();
  useEffect(() => on('settings:changed', (s) => client.setQueryData(keys.settings, s)), [client]);
  return useQuery({ queryKey: keys.settings, queryFn: () => call('settings:get') });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => call('settings:update', patch),
    onSuccess: (s: Settings) => client.setQueryData(keys.settings, s),
  });
}

export function useAppInfo() {
  return useQuery({ queryKey: keys.appInfo, queryFn: () => call('app:info') });
}
