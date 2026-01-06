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
  ,
  // Capture a single image from the user's camera and return a data URL (base64).
  // Runs in renderer context and requests permission via browser APIs.
  getCameraSnapshot: async () => {
    try {
      // @ts-ignore - navigator is available in preload context
      const stream = await (navigator.mediaDevices as any).getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const track = stream.getVideoTracks()[0];
      const imageCapture = new (window as any).ImageCapture?.(track);
      let blob: Blob | null = null;
      if (imageCapture && typeof imageCapture.takePhoto === 'function') {
        try {
          blob = await imageCapture.takePhoto();
        } catch (e) {
          // fallback to grabbing a frame via canvas
          blob = null;
        }
      }
      if (!blob) {
        // use video element -> canvas fallback
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await new Promise((res) => { video.onloadedmetadata = () => { video.play(); res(null); }; });
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas not supported');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        // stop tracks
        try { track.stop(); } catch (_) {}
        // stop any other tracks
        stream.getTracks().forEach(t => { try { t.stop(); } catch(_) {} });
        return dataUrl;
      }
      // convert blob to dataURL
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(blob as Blob);
      });
      try { track.stop(); } catch (_) {}
      stream.getTracks().forEach(t => { try { t.stop(); } catch(_) {} });
      return dataUrl;
    } catch (e) {
      console.error('getCameraSnapshot failed', e);
      return null;
    }
  }
});
