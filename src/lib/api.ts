import type {
  CommonPortDefinition,
  KillResult,
  ScanResult,
} from '../../shared/common-ports';
import { COMMON_PORTS } from '../../shared/common-ports';

export type {
  CommonPortDefinition,
  KillResult,
  ScanResult,
  PortInfo,
  PortProcess,
  PortStatus,
  CategoryFilter,
} from '../../shared/common-ports';
export { COMMON_PORTS, CATEGORIES } from '../../shared/common-ports';

export interface PortKillerApi {
  scanPorts: (ports?: number[]) => Promise<ScanResult>;
  killPort: (port: number, force?: boolean) => Promise<KillResult>;
  getCommonPorts: () => Promise<CommonPortDefinition[]>;
  getPlatform: () => Promise<NodeJS.Platform>;
}

declare global {
  interface Window {
    portkiller?: PortKillerApi;
  }
}

/** Lightweight browser fallback so `vite` preview still works without Electron. */
function createBrowserFallback(): PortKillerApi {
  const occupied = new Map<number, { pid: number; name: string }>();

  // Seed a few demo occupations for UI preview
  occupied.set(3000, { pid: 4242, name: 'node' });
  occupied.set(5173, { pid: 5173, name: 'vite' });
  occupied.set(5432, { pid: 999, name: 'postgres' });

  return {
    async scanPorts(ports) {
      const targets =
        ports && ports.length > 0
          ? ports.map((port) => {
              const known = COMMON_PORTS.find((item) => item.port === port);
              return {
                port,
                label: known?.label ?? 'Custom port',
                category: known?.category ?? 'Custom',
              };
            })
          : COMMON_PORTS;

      return {
        scannedAt: new Date().toISOString(),
        platform: 'linux',
        ports: targets
          .map((target) => {
            const proc = occupied.get(target.port);
            return {
              ...target,
              status: proc ? ('occupied' as const) : ('free' as const),
              processes: proc
                ? [{ pid: proc.pid, name: proc.name }]
                : [],
            };
          })
          .sort((a, b) => a.port - b.port),
      };
    },
    async killPort(port) {
      if (occupied.has(port)) {
        const proc = occupied.get(port)!;
        occupied.delete(port);
        return {
          port,
          success: true,
          killedPids: [proc.pid],
          message: `Freed port ${port} (demo mode — killed ${proc.pid})`,
        };
      }
      return {
        port,
        success: true,
        killedPids: [],
        message: `Port ${port} is already free`,
      };
    },
    async getCommonPorts() {
      return COMMON_PORTS;
    },
    async getPlatform() {
      return 'linux';
    },
  };
}

export function getApi(): PortKillerApi {
  return window.portkiller ?? createBrowserFallback();
}
