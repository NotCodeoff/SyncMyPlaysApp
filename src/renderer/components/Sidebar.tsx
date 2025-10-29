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
    // Try multiple possible URLs
    const urls = [
      'http://localhost:8080',  // Vite web version
      'http://[::1]:8080',      // IPv6 Vite
      'http://localhost:3000',  // Webpack dev server
      'http://[::1]:3000',      // IPv6 Webpack
    ];
    
    // Try to find which one is running
    let workingUrl = null;
    
    try {
      // Check if web version is running on 8080
      const response8080 = await fetch('http://localhost:8080/health', { 
        method: 'GET',
        mode: 'no-cors',
        timeout: 2000 
      }).catch(() => null);
      
      if (response8080) {
        workingUrl = 'http://localhost:8080';
      } else {
        // Check if webpack dev server is running on 3000
        const response3000 = await fetch('http://localhost:3000/health', { 
          method: 'GET',
          mode: 'no-cors',
          timeout: 2000 
        }).catch(() => null);
        
        if (response3000) {
          workingUrl = 'http://localhost:3000';
        }
      }
    } catch (error) {
      console.log('Could not detect running web server');
    }
    
    if (workingUrl) {
      // Web version is running, open it
      if (window.electronAPI) {
        window.electronAPI.openExternal(workingUrl);
      } else {
        window.open(workingUrl, '_blank');
      }
    } else {
      // Web version is not running, show instructions
      const message = `
🌐 Web Version Not Running

To use the web version, you need to start it first:

1. Open Command Prompt or PowerShell
2. Navigate to your SyncMyPlays folder
3. Run: cd web
4. Run: npm run dev
5. Wait for it to start (you'll see "Local: http://localhost:8080")
6. Then click "Open Web Version" again

Alternatively, you can:
- Use the desktop app (which you're already using!)
- Or run: npm run start:both (starts both desktop and web)

The web version runs on http://localhost:8080
      `;
      
      alert(message);
      
      // Also try to open the URL anyway (in case it starts up)
      if (window.electronAPI) {
        window.electronAPI.openExternal('http://localhost:8080');
      } else {
        window.open('http://localhost:8080', '_blank');
      }
    }
  };

  // Theme-based colors
  const themeColors = {
    apple: {
      gradient: 'linear-gradient(135deg, #ec4899 0%, #ef4444 100%)',
      hoverGradient: 'linear-gradient(135deg, #f43f5e 0%, #dc2626 100%)',
      shadow: 'rgba(236, 72, 153, 0.5)',
    },
    purple: {
      gradient: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
      hoverGradient: 'linear-gradient(135deg, #c084fc 0%, #9333ea 100%)',
      shadow: 'rgba(168, 85, 247, 0.5)',
    },
    blue: {
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      hoverGradient: 'linear-gradient(135deg, #60a5fa 0%, #1d4ed8 100%)',
      shadow: 'rgba(59, 130, 246, 0.5)',
    },
    green: {
      gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      hoverGradient: 'linear-gradient(135deg, #34d399 0%, #047857 100%)',
      shadow: 'rgba(16, 185, 129, 0.5)',
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
          e.currentTarget.style.boxShadow = `0 8px 20px ${currentTheme.shadow}`;
          e.currentTarget.style.background = currentTheme.hoverGradient;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.background = currentTheme.gradient;
        }}
      >
        <span className="sidebar-label">🌐 Open Web Version</span>
      </button>
    </nav>
  );
};

export default Sidebar;
 