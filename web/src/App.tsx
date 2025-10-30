import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { Sync } from './pages/Sync';
import { History } from './pages/History';
import { Settings } from './pages/Settings';

function App() {
  const [diag, setDiag] = React.useState<{ ok:boolean; cors?:string; error?:string }>({ ok:false });
  const showDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1');

  React.useEffect(() => {
    if (!showDebug) return;
    const url = `${import.meta.env.VITE_API_BASE_URL}/health`;
    fetch(url, { method:'GET', credentials:'include' })
      .then(async r => setDiag({ ok:r.ok, cors: r.headers.get('access-control-allow-origin') || 'n/a' }))
      .catch(e => setDiag({ ok:false, error: String(e) }));
  }, [showDebug]);

  return (
    <div className="app">
      <Header />
      {showDebug && (
        <div style={{fontFamily:'monospace', padding:12, border:'1px solid #ccc', borderRadius:8, margin:'12px'}}>
          <div>isSecureContext: <b>{String(window.isSecureContext)}</b></div>
          <div>protocol: <b>{location.protocol}</b></div>
          <div>origin: <b>{location.origin}</b></div>
          <div>VITE_API_BASE_URL: <b>{import.meta.env.VITE_API_BASE_URL}</b></div>
          <div>Backend reachable: <b>{String(diag.ok)}</b></div>
          <div>CORS allow-origin: <b>{diag.cors}</b></div>
          {diag.error && <div style={{color:'red'}}>fetch error: {diag.error}</div>}
          <button onClick={() => {
            const data = [
              ['isSecureContext', String(window.isSecureContext)],
              ['protocol', location.protocol],
              ['origin', location.origin],
              ['VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL as string],
              ['backend.ok', String(diag.ok)],
              ['backend.cors', diag.cors || ''],
              ['error', diag.error || '']
            ].map(([k,v]) => `${k}: ${v}`).join('\n');
            navigator.clipboard.writeText(data);
            alert('Diagnostics copied to clipboard');
          }}>Copy diagnostics</button>
        </div>
      )}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sync" element={<Sync />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

