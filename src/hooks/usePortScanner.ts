import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getApi,
  type CategoryFilter,
  type KillResult,
  type PortInfo,
  type ScanResult,
} from '../lib/api';

export function usePortScanner() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [killing, setKilling] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'free' | 'occupied'>(
    'all',
  );
  const [customPort, setCustomPort] = useState('');
  const [platform, setPlatform] = useState<string>('');
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const scan = useCallback(async (extraPorts: number[] = []) => {
    setLoading(true);
    setError(null);
    try {
      const api = getApi();
      const known = await api.getCommonPorts();
      const ports = [
        ...new Set([...known.map((p) => p.port), ...extraPorts]),
      ];
      const next = await api.scanPorts(ports);
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const kill = useCallback(
    async (port: number) => {
      setKilling(port);
      setError(null);
      try {
        const api = getApi();
        const killResult: KillResult = await api.killPort(port, true);
        showToast(killResult.message);
        await scan(
          result?.ports
            .filter((p) => p.category === 'Custom')
            .map((p) => p.port) ?? [],
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        showToast(message);
      } finally {
        setKilling(null);
      }
    },
    [result, scan, showToast],
  );

  const addCustomPort = useCallback(async () => {
    const port = Number(customPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      showToast('Enter a port between 1 and 65535');
      return;
    }
    setCustomPort('');
    await scan([
      ...(result?.ports.map((p) => p.port) ?? []),
      port,
    ]);
    showToast(`Scanning port ${port}`);
  }, [customPort, result, scan, showToast]);

  useEffect(() => {
    void (async () => {
      const api = getApi();
      setPlatform(await api.getPlatform());
      await scan();
    })();
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [scan]);

  const ports: PortInfo[] = (result?.ports ?? []).filter((port) => {
    if (category !== 'All' && port.category !== category) return false;
    if (statusFilter !== 'all' && port.status !== statusFilter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hay = `${port.port} ${port.label} ${port.category} ${port.processes
        .map((p) => `${p.name} ${p.pid}`)
        .join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const occupiedCount =
    result?.ports.filter((p) => p.status === 'occupied').length ?? 0;
  const freeCount = result?.ports.filter((p) => p.status === 'free').length ?? 0;

  return {
    result,
    ports,
    loading,
    killing,
    error,
    toast,
    category,
    setCategory,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    customPort,
    setCustomPort,
    platform,
    occupiedCount,
    freeCount,
    scan,
    kill,
    addCustomPort,
  };
}
