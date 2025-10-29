import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaExclamationTriangle, FaCog, FaTimes, FaApple, FaSpotify } from 'react-icons/fa';
import { API_CONFIG, buildApiUrl } from '../config/api';

interface SetupNotificationProps {
  onClose: () => void;
}

const SetupNotification: React.FC<SetupNotificationProps> = ({ onClose }) => {
  const [appleTokenStatus, setAppleTokenStatus] = useState<'loading' | 'set' | 'not-set' | 'error'>('loading');
  const [spotifyConfigStatus, setSpotifyConfigStatus] = useState<'loading' | 'set' | 'not-set' | 'error'>('loading');
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  useEffect(() => {
    checkConfigurations();
  }, []);

  const checkConfigurations = async () => {
    try {
      // Check Apple Music token
      const appleResponse = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.APPLE_TOKEN_STATUS));
      const appleData = await appleResponse.json();
      setAppleTokenStatus(appleData.hasToken ? 'set' : 'not-set');

      // Check Spotify config
      const spotifyResponse = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.SPOTIFY_CONFIG));
      const spotifyData = await spotifyResponse.json();
      setSpotifyConfigStatus(spotifyData.hasConfig ? 'set' : 'not-set');
    } catch (error) {
      console.error('Error checking configurations:', error);
      setAppleTokenStatus('error');
      setSpotifyConfigStatus('error');
    }
  };

  const needsSetup = appleTokenStatus === 'not-set' || spotifyConfigStatus === 'not-set';

  if (!needsSetup) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className="fixed top-4 right-4 z-50 max-w-md"
      >
        <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-4 shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <FaExclamationTriangle className="text-yellow-400 mt-1 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-yellow-200 font-semibold mb-2">Setup Required</h3>
                <p className="text-yellow-100 text-sm mb-3">
                  Your music services need to be configured to work properly.
                </p>
                
                <div className="space-y-2">
                  {appleTokenStatus === 'not-set' && (
                    <div className="flex items-center space-x-2 text-sm">
                      <FaApple className="text-red-400" />
                      <span className="text-yellow-100">Apple Music needs developer token</span>
                    </div>
                  )}
                  
                  {spotifyConfigStatus === 'not-set' && (
                    <div className="flex items-center space-x-2 text-sm">
                      <FaSpotify className="text-green-400" />
                      <span className="text-yellow-100">Spotify needs OAuth credentials</span>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => setShowAdminDashboard(true)}
                  className="mt-3 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <FaCog className="inline mr-2" />
                  Open Setup
                </button>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="text-yellow-400 hover:text-yellow-300 ml-2"
            >
              <FaTimes />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SetupNotification;
