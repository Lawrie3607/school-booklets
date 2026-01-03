import { app, BrowserWindow } from 'electron';
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
    icon: path.join(__dirname, '../public/app-icon.png'),
  });

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

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
