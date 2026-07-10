import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
} from 'electron';
import path from 'node:path';
import {
  COMMON_PORTS,
  type KillResult,
  type PortInfo,
  type ScanResult,
} from '../shared/common-ports';
import { findListenersOnPort, killPort } from './port-service';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 860,
    minHeight: 600,
    title: 'PortKiller',
    backgroundColor: '#e8eef2',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

async function scanPorts(ports?: number[]): Promise<ScanResult> {
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

  const results: PortInfo[] = [];

  // Scan in small batches to keep UI responsive and avoid spawning too many processes
  const batchSize = 6;
  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (target) => {
        const processes = await findListenersOnPort(target.port);
        return {
          port: target.port,
          label: target.label,
          category: target.category,
          status: processes.length > 0 ? ('occupied' as const) : ('free' as const),
          processes,
        };
      }),
    );
    results.push(...batchResults);
  }

  results.sort((a, b) => a.port - b.port);

  return {
    scannedAt: new Date().toISOString(),
    platform: process.platform,
    ports: results,
  };
}

function registerIpc(): void {
  ipcMain.handle('ports:scan', async (_event, ports?: number[]) => {
    return scanPorts(ports);
  });

  ipcMain.handle(
    'ports:kill',
    async (_event, port: number, force = true): Promise<KillResult> => {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return {
          port,
          success: false,
          killedPids: [],
          message: 'Invalid port number',
        };
      }

      const before = await findListenersOnPort(port);
      if (before.length === 0) {
        return {
          port,
          success: true,
          killedPids: [],
          message: `Port ${port} is already free`,
        };
      }

      const { killed, failed } = await killPort(port, force);

      // Brief pause then verify
      await new Promise((resolve) => setTimeout(resolve, 150));
      const after = await findListenersOnPort(port);
      const success = after.length === 0;

      let message: string;
      if (success) {
        message =
          killed.length > 0
            ? `Freed port ${port} (killed ${killed.join(', ')})`
            : `Port ${port} is free`;
      } else if (failed.length > 0) {
        message = `Could not kill: ${failed
          .map((f) => `${f.pid} (${f.error})`)
          .join('; ')}. Try running as administrator.`;
      } else {
        message = `Port ${port} still occupied after kill attempt`;
      }

      return {
        port,
        success,
        killedPids: killed,
        message,
      };
    },
  );

  ipcMain.handle('ports:common', () => COMMON_PORTS);

  ipcMain.handle('app:platform', () => process.platform);
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
