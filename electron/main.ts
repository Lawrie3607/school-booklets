import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

// Provide __dirname in ESM scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Handle creating/removing shortcuts on Windows when installing/uninstalling
const requireShim = createRequire(import.meta.url);
try {
  const squirrel = requireShim('electron-squirrel-startup');
  if (squirrel) {
    app.quit();
  }
} catch (err) {
  // Ignore if module not present in this environment
}

let mainWindow: BrowserWindow | null = null;

// Disable Chromium Autofill features (silences some DevTools protocol calls)
try {
  app.commandLine.appendSwitch('disable-features', 'Autofill,AutofillServerCommunication');
} catch (e) {
  // ignore in environments where commandLine isn't available yet
}

const createWindow = () => {
  // Determine the best icon to use at runtime (dev vs packaged locations)
  const resolveIconPath = (): string | undefined => {
    const candidates = [
      // dev server / source
      path.join(__dirname, '../public/app-icon.png'),
      // project data folder (user-provided)
      path.join(__dirname, '../data/Gartoon.png'),
      // when packaged, app files may live under resources/app or resources/app.asar
      path.join(process.resourcesPath, 'app', 'data', 'Gartoon.png'),
      // converted ico placed by electron-builder during packaging
      path.join(process.resourcesPath, '.icon-ico', 'icon.ico'),
      path.join(process.resourcesPath, 'icon.ico'),
    ];

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch (e) {
        // ignore
      }
    }

    return undefined;
  };
  const iconPath = resolveIconPath();
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#d1d5db',
      webPreferences: {
      // built preload file may be .js, .mjs or .cjs depending on build
      preload: (() => {
        const candidates = ['preload.js', 'preload.mjs', 'preload.cjs'];
        for (const c of candidates) {
          const p = path.join(__dirname, c);
          if (fs.existsSync(p)) return p;
        }
        return path.join(__dirname, 'preload.js');
      })(),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: iconPath ?? undefined,
  });

  // Prevent OS-level screenshots / screen recording where supported
  try {
    // This is a no-op on platforms that don't support it, but helps on Windows/macOS
    mainWindow.setContentProtection(true);
  } catch (e) {
    console.warn('setContentProtection not supported in this environment', e);
  }

  // In development, load from Vite dev server
  // In production, load the built files
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
    // Filter noisy DevTools protocol autofill messages
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      if (typeof message === 'string' && (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses'))) {
        // swallow known harmless autofill protocol errors
        return;
      }
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window only when ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    mainWindow.show();
  });

  // Register global shortcuts to reduce risk of students opening devtools or refreshing
  try {
    // Disable common devtools and reload shortcuts while the window is focused
    const reg = (accel: string) => {
      try { globalShortcut.register(accel, () => {}); } catch (e) { /* ignore */ }
    };
    reg('CommandOrControl+Shift+I');
    reg('CommandOrControl+Shift+C');
    reg('F12');
    reg('CommandOrControl+R');
    reg('F5');
  } catch (e) {
    console.warn('globalShortcut registration failed', e);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  // IPC handlers for data file operations
  ipcMain.handle('list-data-files', () => {
    try {
      // In dev mode __dirname is dist-electron, data is at project root
      const dataDir = path.join(__dirname, '..', 'data');
      console.log('list-data-files: checking', dataDir);
      if (!fs.existsSync(dataDir)) {
        console.log('list-data-files: data dir not found');
        return [];
      }
      const files = fs.readdirSync(dataDir).filter(f => f.toLowerCase().endsWith('.json'));
      console.log('list-data-files: found', files);
      return files;
    } catch (e) {
      console.error('list-data-files error:', e);
      return [];
    }
  });

  ipcMain.handle('read-data-file', (event, name: string) => {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      const filePath = path.join(dataDir, name);
      console.log('read-data-file:', filePath);
      if (!fs.existsSync(filePath)) {
        console.log('read-data-file: file not found');
        return null;
      }
      const content = fs.readFileSync(filePath, 'utf8');
      console.log('read-data-file: read', content.length, 'chars from', name);
      return content;
    } catch (e) {
      console.error('read-data-file error:', e);
      return null;
    }
  });

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up global shortcuts on exit
app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (e) { /* ignore */ }
});
