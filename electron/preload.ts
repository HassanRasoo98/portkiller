import { contextBridge, ipcRenderer } from 'electron';
import type {
  CommonPortDefinition,
  KillResult,
  ScanResult,
} from '../shared/common-ports';

export interface PortKillerApi {
  scanPorts: (ports?: number[]) => Promise<ScanResult>;
  killPort: (port: number, force?: boolean) => Promise<KillResult>;
  getCommonPorts: () => Promise<CommonPortDefinition[]>;
  getPlatform: () => Promise<NodeJS.Platform>;
}

const api: PortKillerApi = {
  scanPorts: (ports) => ipcRenderer.invoke('ports:scan', ports),
  killPort: (port, force = true) =>
    ipcRenderer.invoke('ports:kill', port, force),
  getCommonPorts: () => ipcRenderer.invoke('ports:common'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
};

contextBridge.exposeInMainWorld('portkiller', api);
