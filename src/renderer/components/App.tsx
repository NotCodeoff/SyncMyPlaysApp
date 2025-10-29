import React, { useState } from 'react';
import Sidebar from './Sidebar';
import TitleBar from './TitleBar';
import MainContent from './MainContent';
import { AnimatePresence, motion } from 'framer-motion';
import AdminDashboard from './AdminDashboard';
import iconPath from '../icon.ico';

// Add ErrorBoundary component
class ErrorBoundary extends React.Component<{children: React.ReactNode}, { hasError: boolean, error: Error | null }> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // You can log errorInfo here if needed
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: '#e94560', padding: 32, textAlign: 'center' }}>
          <h2>Something went wrong.</h2>
          <pre>{this.state.error && this.state.error.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  const [current, setCurrent] = useState('dashboard');
  const [showAbout, setShowAbout] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('apple');

  // Define menuItems inside the component to access currentTheme state
  const menuItems = [
    {
      label: 'File',
      items: [
        { label: 'Quit', shortcut: 'Ctrl+Q', action: () => window.close() },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Reload', shortcut: 'Ctrl+R', action: () => window.location.reload() },
        { label: 'Toggle Full Screen', shortcut: 'F11', action: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() },
      ],
    },
    {
      label: 'Theme',
      items: [
        { label: `Accent: Apple (Default)${currentTheme === 'apple' ? ' ✓' : ''}`, action: () => applyTheme('apple', () => { 
          document.documentElement.style.setProperty('--accent-purple', '#FF4E6B'); 
          document.documentElement.style.setProperty('--accent-purple-dark', '#FF0436'); 
          document.documentElement.style.setProperty('--accent-gradient', 'linear-gradient(135deg, #FF4E6B 0%, #FF0436 100%)'); 
          document.documentElement.style.setProperty('--primary-glow-color', 'rgba(255, 78, 107, 0.3)'); 
        }) },
        { label: `Accent: Purple${currentTheme === 'purple' ? ' ✓' : ''}`, action: () => applyTheme('purple', () => { 
          document.documentElement.style.setProperty('--accent-purple', '#7851A9'); 
          document.documentElement.style.setProperty('--accent-purple-dark', '#5B2C6F'); 
          document.documentElement.style.setProperty('--accent-gradient', 'linear-gradient(135deg, #7851A9 0%, #5B2C6F 100%)'); 
          document.documentElement.style.setProperty('--primary-glow-color', 'rgba(120, 81, 169, 0.3)'); 
        }) },
        { label: `Accent: Blue${currentTheme === 'blue' ? ' ✓' : ''}`, action: () => applyTheme('blue', () => { 
          document.documentElement.style.setProperty('--accent-purple', '#007AFF'); 
          document.documentElement.style.setProperty('--accent-purple-dark', '#0056CC'); 
          document.documentElement.style.setProperty('--accent-gradient', 'linear-gradient(135deg, #007AFF 0%, #00B4FF 100%)'); 
          document.documentElement.style.setProperty('--primary-glow-color', 'rgba(0, 122, 255, 0.3)'); 
        }) },
        { label: `Accent: Green${currentTheme === 'green' ? ' ✓' : ''}`, action: () => applyTheme('green', () => { 
          document.documentElement.style.setProperty('--accent-purple', '#34C759'); 
          document.documentElement.style.setProperty('--accent-purple-dark', '#28A745'); 
          document.documentElement.style.setProperty('--accent-gradient', 'linear-gradient(135deg, #34C759 0%, #30D158 100%)'); 
          document.documentElement.style.setProperty('--primary-glow-color', 'rgba(52, 199, 89, 0.3)'); 
        }) },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'About', action: 'about' },
      ],
    },
  ];

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        setShowAdmin(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Add global unhandledrejection handler
  React.useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      // Using a custom modal or toast would be better than alert
      console.error('An unexpected error occurred: ' + (event.reason?.message || event.reason || 'Unknown error'));
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  // Load saved theme on app startup
  React.useEffect(() => {
    const savedTheme = localStorage.getItem('syncmyplays-theme');
    if (savedTheme) {
      // Find and apply the saved theme
      const themeItem = menuItems.find(menu => menu.label === 'Theme')?.items?.find(item => 
        item.label.toLowerCase().includes(savedTheme.toLowerCase())
      );
      if (themeItem && typeof themeItem.action === 'function') {
        themeItem.action();
        setCurrentTheme(savedTheme);
      }
    }
  }, []);

  if (showAdmin) {
    return <AdminDashboard />;
  }

  const handleMenuClick = (menu: string) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  // Theme management functions
  const applyTheme = (themeName: string, themeAction: () => void) => {
    themeAction();
    setCurrentTheme(themeName);
    localStorage.setItem('syncmyplays-theme', themeName);
  };

  const handleMenuItemClick = (item: any) => {
    if (item.action === 'about') setShowAbout(true);
    else if (typeof item.action === 'function') item.action();
    setOpenMenu(null);
  };

  return (
    <ErrorBoundary>
      <div className="app-container" style={{ flexDirection: 'column', height: '100vh', display: 'flex' }}>
        <TitleBar />
        {/* Top Menu Bar */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="top-menu-bar"
        >
          {menuItems.map(menu => (
            <div key={menu.label} style={{ position: 'relative', height: '100%' }}>
              <button
                className="top-menu-button"
                onClick={() => handleMenuClick(menu.label)}
              >
                {menu.label}
              </button>
              <AnimatePresence>
                {openMenu === menu.label && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="top-menu-dropdown"
                  >
                    {menu.items.map((item, idx) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ delay: idx * 0.03, duration: 0.18, ease: 'easeOut' }}
                        className="top-menu-item"
                        onClick={() => handleMenuItemClick(item)}
                        onMouseDown={e => e.preventDefault()}
                      >
                        <span>{item.label}</span>
                        {'shortcut' in item && item.shortcut && <span>{item.shortcut}</span>}
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </motion.div>
        {/* Main App Layout */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ display: 'flex', flex: 1, minHeight: 0 }}
        >
          <Sidebar current={current} onNavigate={setCurrent} theme={currentTheme} />
          <main className="main-panel">
            <MainContent current={current} />
          </main>
        </motion.div>
        {/* About Modal */}
        <AnimatePresence>
          {showAbout && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={() => setShowAbout(false)}
            >
              <motion.div
                className="modal-content"
                style={{ maxWidth: 420, textAlign: 'center' }}
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: 0.22 }}
                onClick={e => e.stopPropagation()}
              >
                <button className="modal-close-button" onClick={() => setShowAbout(false)}>&times;</button>
                <div style={{ margin: '0 auto 18px', width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                  <img 
                    src={iconPath} 
                    alt="SyncMyPlays Icon" 
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover'
                    }} 
                  />
                </div>
                <h2 style={{ margin: 0, fontWeight: 800, fontSize: 26, letterSpacing: 1 }}>SyncMyPlays</h2>
                <div style={{ color: '#aeaeb2', fontSize: 17, margin: '10px 0 18px' }}>Version 1.0.0<br />Major thanks to the SyncMyPlays community and all contributors.</div>
                <div style={{ color: '#ffb300', fontSize: 15, marginBottom: 18 }}>
                  Apple Music features require a paid Apple Developer account. If enough users support this app, full Apple Music support will be added in the future!
                </div>
                <div style={{ color: '#8e8e93', fontSize: 13, marginBottom: 8 }}>
                  &copy; {new Date().getFullYear()} SyncMyPlays. All rights reserved.<br />
                  <span style={{ color: '#ff3b30' }}>Not affiliated with Apple, Spotify, or YouTube.</span>
                </div>
                <div style={{ color: '#aeaeb2', fontSize: 13 }}>
                  <b>Build Info:</b> v1.0.0<br />
                  <b>Branch:</b> main
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {globalLoading && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" style={{ width: 64, height: 64, border: '8px solid rgba(255,255,255,0.2)', borderTop: '8px solid #fa233b', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;
