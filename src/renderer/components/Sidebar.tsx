import React from 'react';

const navItems = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'auto-sync', label: 'Auto Sync' },
  { key: 'features', label: 'Features' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'settings', label: 'Settings' },
];

interface SidebarProps {
  current: string;
  onNavigate: (key: string) => void;
  theme?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ current, onNavigate, theme = 'apple' }) => {
  const openWebVersion = async () => {
    // Try common dev ports: Vite (8080/8081/5173), Webpack (3000)
    const candidates = [
      'http://localhost:8080/',
      'http://localhost:8081/',
      'http://localhost:5173/',
      'http://localhost:3000/',
    ];

    // Probe each candidate with its own timeout controller to avoid aborting subsequent tries
    let chosen: string | null = null;
    for (const url of candidates) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      try {
        const res = await fetch(url, { method: 'HEAD', signal: controller.signal }).catch(() => null as any);
        if (res && typeof res.status === 'number' && res.status < 500) {
          chosen = url;
          clearTimeout(timeoutId);
          break;
        }
      } catch (_) {
        // try next
      } finally {
        clearTimeout(timeoutId);
      }
    }

    const finalUrl = chosen || candidates[0];
    if (window.electronAPI) {
      window.electronAPI.openExternal(finalUrl);
    } else {
      window.open(finalUrl, '_blank');
    }
  };

  // Theme-based colors
  const themeColors = {
    apple: {
      gradient: 'linear-gradient(135deg, #ec4899 0%, #ef4444 100%)',
      hoverGradient: 'linear-gradient(135deg, #f43f5e 0%, #dc2626 100%)',
      // dual-tone glow to match the pink→red gradient
      shadow1: 'rgba(236, 72, 153, 0.45)', // pink
      shadow2: 'rgba(239, 68, 68, 0.35)',  // red
    },
    purple: {
      gradient: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
      hoverGradient: 'linear-gradient(135deg, #c084fc 0%, #9333ea 100%)',
      shadow1: 'rgba(192, 132, 252, 0.45)',
      shadow2: 'rgba(124, 58, 237, 0.35)',
    },
    blue: {
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      hoverGradient: 'linear-gradient(135deg, #60a5fa 0%, #1d4ed8 100%)',
      shadow1: 'rgba(96, 165, 250, 0.45)',
      shadow2: 'rgba(29, 78, 216, 0.35)',
    },
    green: {
      gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      hoverGradient: 'linear-gradient(135deg, #34d399 0%, #047857 100%)',
      shadow1: 'rgba(52, 211, 153, 0.45)',
      shadow2: 'rgba(4, 120, 87, 0.35)',
    },
  };

  const currentTheme = themeColors[theme as keyof typeof themeColors] || themeColors.apple;

  return (
    <nav className="sidebar">
      <div className="sidebar-title">
        <span className="sidebar-title-accent" data-theme={theme}>● </span>SyncMyPlays
      </div>
      <div className="sidebar-section">Main</div>
      {navItems.map(item => (
        <button
          key={item.key}
          className={`sidebar-item ${current === item.key ? 'active' : 'inactive'}`}
          onClick={() => onNavigate(item.key)}
        >
          {current === item.key && <span className="sidebar-active-bar" />}
          <span className="sidebar-label">{item.label}</span>
        </button>
      ))}
      <div className="sidebar-divider" />
      <div className="sidebar-section">Quick Access</div>
      <button
        className="sidebar-item web-version-button"
        onClick={openWebVersion}
        title="Open web version in browser"
        style={{
          background: currentTheme.gradient,
          color: 'white',
          fontWeight: '600',
          marginTop: '8px',
          borderRadius: '10px',
          padding: '12px',
          transition: 'all 0.3s ease',
          border: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          // layered glow that matches the gradient hues
          const s1 = (currentTheme as any).shadow1 || 'rgba(0,0,0,0.3)';
          const s2 = (currentTheme as any).shadow2 || 'rgba(0,0,0,0.2)';
          e.currentTarget.style.boxShadow = `0 10px 24px ${s2}, 0 6px 14px ${s1}`;
          e.currentTarget.style.background = currentTheme.hoverGradient;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.12)';
          e.currentTarget.style.background = currentTheme.gradient;
        }}
      >
        <span className="sidebar-label">🌐 Open Web Version</span>
      </button>
    </nav>
  );
};

export default Sidebar;
 