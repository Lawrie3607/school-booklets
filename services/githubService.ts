export const pushFileToGithub = async (opts: { owner: string; repo: string; path: string; branch?: string; message?: string; content: string; token?: string }) => {
  // renderer side helper that calls preload-exposed IPC
  const anyWindow: any = (window as any);
  if (!anyWindow || !anyWindow.electron || typeof anyWindow.electron.pushToGithub !== 'function') {
    throw new Error('GitHub push API not available in this environment');
  }
  const res = await anyWindow.electron.pushToGithub({ owner: opts.owner, repo: opts.repo, path: opts.path, branch: opts.branch, message: opts.message, content: opts.content, token: opts.token });
  return res;
};
