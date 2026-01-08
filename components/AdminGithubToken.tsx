import React, { useEffect, useState } from 'react';

interface Props {
  onClose: () => void;
}

const AdminGithubToken = ({ onClose }: Props) => {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [owner, setOwner] = useState(localStorage.getItem('github_owner') || '');
  const [repo, setRepo] = useState(localStorage.getItem('github_repo') || '');
  const [autoPush, setAutoPush] = useState(localStorage.getItem('github_auto_push') === '1');

  const load = async () => {
    try {
      const anyWin: any = window as any;
      if (!anyWin?.electron?.getGithubToken) {
        setStatus('Keychain API not available in this environment.');
        return;
      }
      setLoading(true);
      const res = await anyWin.electron.getGithubToken();
      setLoading(false);
      if (res && res.success) {
        setToken(res.token || '');
        setStatus(res.token ? 'Token loaded from keychain' : 'No token stored');
      } else {
        setStatus('Could not read token: ' + (res?.error || 'unknown'));
      }
    } catch (e: any) {
      setLoading(false);
      setStatus('Error reading token: ' + (e.message || String(e)));
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const anyWin: any = window as any;
      if (!anyWin?.electron?.saveGithubToken) { setStatus('Keychain API not available.'); return; }
      setLoading(true);
      const res = await anyWin.electron.saveGithubToken(token);
      setLoading(false);
      if (res && res.success) setStatus('Token saved to OS keychain.');
      else setStatus('Save failed: ' + (res?.error || 'unknown'));
    } catch (e: any) {
      setLoading(false);
      setStatus('Save error: ' + (e.message || String(e)));
    }
  };

  const saveSettings = async () => {
    try {
      localStorage.setItem('github_owner', owner || '');
      localStorage.setItem('github_repo', repo || '');
      localStorage.setItem('github_auto_push', autoPush ? '1' : '0');
      // Persist setting into IndexedDB and start/stop processor accordingly
      try {
        // dynamic import to avoid circular dependency issues
        const storage = await import('../services/storageService');
        await storage.setGithubProcessorEnabled(autoPush);
      } catch (e) {
        console.warn('Failed to persist processor flag to IndexedDB', e);
      }
      setStatus('Settings saved');
    } catch (e: any) {
      setStatus('Failed to save settings: ' + (e.message || String(e)));
    }
  };

  const testPush = async () => {
    try {
      const anyWin: any = window as any;
      if (!anyWin?.electron?.pushToGithub) { setStatus('Push API not available.'); return; }
      setLoading(true);
      const now = new Date().toISOString();
      // small test file path so we don't overwrite important files
      const payload = {
        owner: 'Lawrie3607', // TODO: replace with your repo owner
        repo: 'booklet_library_backup_2025-12-31', // TODO: replace with target repo
        path: `data/desktop_test_${Date.now()}.txt`,
        branch: 'main',
        message: `desktop test commit ${now}`,
        content: `Desktop test commit at ${now}`
      };
      const res = await anyWin.electron.pushToGithub(payload);
      setLoading(false);
      if (res && res.success) setStatus('Push succeeded: ' + (res.url || 'OK'));
      else setStatus('Push failed: ' + JSON.stringify(res));
    } catch (e: any) {
      setLoading(false);
      setStatus('Push error: ' + (e.message || String(e)));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-8">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-xl">GitHub Token (Admin)</h2>
          <div>
            <button onClick={onClose} className="text-sm underline">Close</button>
          </div>
        </div>
        <div className="mb-4 text-sm text-gray-600">Store your personal access token securely in the OS keychain. The app will use it to push files to GitHub when required.</div>
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Token</label>
            <input value={token} onChange={e => setToken(e.target.value)} className="mt-1 block w-full border rounded p-2" placeholder="ghp_..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Owner / Repo</label>
            <div className="flex gap-2 mt-1">
              <input value={owner} onChange={e => setOwner(e.target.value)} className="block w-1/2 border rounded p-2" placeholder="owner" />
              <input value={repo} onChange={e => setRepo(e.target.value)} className="block w-1/2 border rounded p-2" placeholder="repo" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input id="autoPush" type="checkbox" checked={autoPush} onChange={e => setAutoPush(e.target.checked)} />
              <label htmlFor="autoPush" className="text-sm">Enable automatic push</label>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={save} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded">Save to Keychain</button>
          <button onClick={testPush} disabled={loading} className="px-4 py-2 bg-emerald-600 text-white rounded">Test Push</button>
          <button onClick={load} disabled={loading} className="px-4 py-2 border rounded">Reload</button>
          <button onClick={saveSettings} disabled={loading} className="px-4 py-2 border rounded">Save Settings</button>
        </div>
        <div className="mt-4 text-sm text-gray-700">{status}</div>
      </div>
    </div>
  );
};

export default AdminGithubToken;
