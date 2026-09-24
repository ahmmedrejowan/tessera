import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { McpCall, McpStatus } from '@shared/mcp';
import { call, on } from '../api';
import { failed } from '../notices/store';

/** The agent server's state, kept fresh as it starts, stops and answers calls. */
export function useMcp(): McpStatus | undefined {
  const client = useQueryClient();
  useEffect(() => on('mcp:changed', () => void client.invalidateQueries({ queryKey: ['mcp'] })), [client]);
  return useQuery({ queryKey: ['mcp'], queryFn: () => call('mcp:status'), staleTime: 0 }).data;
}

/** Every tool, with whether it is switched on. */
export function useMcpTools() {
  const client = useQueryClient();
  useEffect(() => on('mcp:changed', () => void client.invalidateQueries({ queryKey: ['mcp-tools'] })), [client]);
  return useQuery({ queryKey: ['mcp-tools'], queryFn: () => call('mcp:tools'), staleTime: 0 }).data ?? [];
}

/** What agents have called, newest first: a page of it, kept fresh as calls arrive. */
export function useMcpCalls(limit = 5, offset = 0): { rows: McpCall[]; total: number } {
  const client = useQueryClient();
  useEffect(() => on('mcp:changed', () => void client.invalidateQueries({ queryKey: ['mcp-calls'] })), [client]);
  return useQuery({ queryKey: ['mcp-calls', limit, offset], queryFn: () => call('mcp:calls', limit, offset), staleTime: 0 }).data ?? { rows: [], total: 0 };
}

/** Change what agents may reach. */
export async function setMcp(change: { enabled?: boolean; port?: number; group?: { id: string; on: boolean }; tool?: { name: string; on: boolean } }): Promise<void> {
  try {
    await call('mcp:set', change);
  } catch (e) {
    failed(e);
  }
}
