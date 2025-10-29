import React from 'react';
import { motion } from 'framer-motion';

const TitleBar: React.FC = () => {
  const [isFullscreen, setIsFullscreen] = React.useState<boolean>(false);

  React.useEffect(() => {
    const handler = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', handler);
    handler();
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  
  // Check if electronAPI is available
  React.useEffect(() => {
    console.log('TitleBar mounted, checking electronAPI availability...');
    console.log('window.electronAPI:', window.electronAPI);
    
    // Wait a bit for electronAPI to be available (in case it loads asynchronously)
    const checkAPI = () => {
      if (window.electronAPI) {
        console.log('electronAPI methods available:', Object.keys(window.electronAPI));
        console.log('Window controls should now work properly');
      } else {
        console.error('electronAPI not available - window controls will not work');
        // Retry after a short delay
        setTimeout(checkAPI, 50); // Faster API check
      }
    };
    
    checkAPI();
  }, []);

  const minimize = () => {
    console.log('Minimize clicked, electronAPI available:', !!window.electronAPI);
    if (window.electronAPI?.minimizeWindow) {
      try {
        window.electronAPI.minimizeWindow();
      } catch (error) {
        console.error('Error calling minimizeWindow:', error);
      }
    } else {
      console.error('electronAPI.minimizeWindow not available');
    }
  };
  
  const maximize = () => {
    console.log('Maximize clicked, electronAPI available:', !!window.electronAPI);
    if (window.electronAPI?.maximizeWindow) {
      try {
        window.electronAPI.maximizeWindow();
      } catch (error) {
        console.error('Error calling maximizeWindow:', error);
      }
    } else {
      console.error('electronAPI.maximizeWindow not available');
    }
  };
  
  const close = () => {
    console.log('Close clicked, electronAPI available:', !!window.electronAPI);
    if (window.electronAPI?.closeWindow) {
      try {
        window.electronAPI.closeWindow();
      } catch (error) {
        console.error('Error calling closeWindow:', error);
      }
    } else {
      console.error('electronAPI.closeWindow not available');
    }
  };
  
  const toggleFullscreen = () => {
    console.log('Toggle fullscreen clicked, electronAPI available:', !!window.electronAPI);
    if (isFullscreen) {
      if (window.electronAPI?.exitFullscreen) {
        try {
          window.electronAPI.exitFullscreen();
        } catch (error) {
          console.error('Error calling exitFullscreen:', error);
        }
      } else {
        console.error('electronAPI.exitFullscreen not available');
      }
    } else {
      if (window.electronAPI?.enterFullscreen) {
        try {
          window.electronAPI.enterFullscreen();
        } catch (error) {
          console.error('Error calling enterFullscreen:', error);
        }
      } else {
        console.error('electronAPI.enterFullscreen not available');
      }
    }
  };

  return (
    <div className="title-bar">
      <div className="title-bar-content">
        <div className="app-title">
          <span className="app-name">SyncMyPlays</span>
        </div>
      </div>
      <div className="window-controls">
        <motion.button className="window-control minimize" onClick={minimize} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} title="Minimize" />
        <motion.button className={`window-control ${isFullscreen ? 'restore' : 'maximize'}`} onClick={isFullscreen ? toggleFullscreen : maximize} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} title={isFullscreen ? 'Exit Fullscreen' : 'Maximize'} />
        <motion.button className="window-control close" onClick={close} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} title="Close" />
      </div>
    </div>
  );
};

export default TitleBar;


