import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  // Add any IPC communication methods here as needed
  send: (channel: string, data: any) => {
    // Whitelist channels
    const validChannels = ['toMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel: string, func: (...args: any[]) => void) => {
    const validChannels = ['fromMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  // Read local JSON files from the app's `data` folder via IPC. Returns an array of filenames.
  listDataFiles: () => ipcRenderer.invoke('list-data-files'),
  // Read a specific data file content (utf8) via IPC
  readDataFile: (name: string) => ipcRenderer.invoke('read-data-file', name)
});
