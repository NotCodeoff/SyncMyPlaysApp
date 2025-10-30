let initialized = false;

export async function ensureMusicKitReady(): Promise<any> {
  const w = window as any;
  if (w.MusicKit && initialized) return w.MusicKit.getInstance();

  if (!w.MusicKit) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load MusicKit'));
      document.head.appendChild(s);
    });
  }

  const r = await fetch(`${import.meta.env.VITE_API_BASE_URL}/apple/developer-token`);
  if (!r.ok) throw new Error('Cannot fetch Apple developer token');
  const { token } = await r.json();

  (window as any).MusicKit.configure({
    developerToken: token,
    app: { name: import.meta.env.VITE_APP_NAME || 'SyncMyPlays', build: '1.0.0' },
  });

  initialized = true;
  return (window as any).MusicKit.getInstance();
}

export async function authorizeAppleMusic(): Promise<string> {
  const mk = await ensureMusicKitReady();
  if (!mk.isAuthorized) await mk.authorize();
  return mk.musicUserToken as string;
}


