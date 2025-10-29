import React, { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import CustomDropdown from './CustomDropdown';
import ProfessionalSyncLog from './ProfessionalSyncLog';
import SetupNotification from './SetupNotification';
import { FaMusic, FaLink, FaCut, FaEraser, FaFileImport, FaFileExport, FaTasks, FaStar, FaSearch, FaSpotify, FaApple } from 'react-icons/fa';
import iconPath from '../icon.ico';
import { API_CONFIG, API_ENDPOINTS, buildApiUrl, buildWsUrl } from '../config/api';

// Use centralized API configuration
const API_BASE_URL = API_CONFIG.BASE_URL;

// Enhanced TypeScript interfaces for better type safety
interface SyncProgress {
  current: number;
  total: number;
  currentStep: string;
  eta: string;
  startTime: number;
  status: 'starting' | 'searching' | 'adding' | 'completed' | 'error';
  trackInfo?: {
    name: string;
    artist: string;
    index: number;
  };
}

interface SyncResult {
  success: boolean;
  stats?: {
    totalSource: number;
    found: number;
    actuallyAdded: number;
    notFound: number;
    failedToAdd: number;
    silentFailures?: number;
  };
  notFoundTracks?: number;
  logFile?: string;
  error?: string;
  details?: any;
}

interface FailedTrack {
  name: string;
  artist: string;
  album?: string;
  isrc?: string;
}

interface PlaylistTrack {
  id: string;
  name: string;
  artist: string;
  artistName?: string;
  album?: string;
  albumName?: string;
  isrc?: string;
  duration_ms?: number;
}

// Add this CSS for the sync spinner animation
const syncStyles = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  .sync-spinner {
    display: inline-block;
    animation: spin 1s linear infinite;
  }
  
  .sync-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(29, 185, 84, 0.4);
  }
  
  .sync-button:active:not(:disabled) {
    transform: translateY(0);
  }
`;

// Add style tag to document head
if (typeof document !== 'undefined' && !document.getElementById('sync-styles')) {
  const styleElement = document.createElement('style');
  styleElement.id = 'sync-styles';
  styleElement.textContent = syncStyles;
  document.head.appendChild(styleElement);
}

// Add completion modal animations
const completionAnimations = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translate(-50%, -40%);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }
  
  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
    40% { transform: translateY(-20px); }
    60% { transform: translateY(-10px); }
  }
`;

if (typeof document !== 'undefined' && !document.getElementById('completion-animations')) {
  const animElement = document.createElement('style');
  animElement.id = 'completion-animations';
  animElement.textContent = completionAnimations;
  document.head.appendChild(animElement);
}

// Auto Sync specific lightweight styles
const autoSyncStyles = `
  .asm-list { max-height: 280px; overflow: auto; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 6px; }
  .asm-row { display: grid; grid-template-columns: 22px 40px 1fr; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; }
  .asm-row:hover { background: rgba(255,255,255,0.06); }
  .asm-art { width: 40px; height: 40px; border-radius: 6px; overflow: hidden; display:flex; align-items:center; justify-content:center; background:#333; color:#888; }
  .asm-art img { width: 100%; height: 100%; object-fit: cover; display:block; }
  .asm-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
if (typeof document !== 'undefined' && !document.getElementById('auto-sync-styles')) {
  const styleElement = document.createElement('style');
  styleElement.id = 'auto-sync-styles';
  styleElement.textContent = autoSyncStyles;
  document.head.appendChild(styleElement);
}

type PlaylistListItem = { id: string; name: string; service: string; serviceLabel: string; artwork?: string | null };

interface MainContentProps {
  current: string;
}

const services = [
  { key: 'apple', label: 'Apple Music', color: '#fa233b' },
  { key: 'spotify', label: 'Spotify', color: '#1DB954' },
  { key: 'youtube', label: 'YouTube Music', color: '#ff0000' },
];

const featureServices = [{ key: 'spotify', label: 'Spotify' }];

const openExternal = (url: string) => {
  if (window.electronAPI && window.electronAPI.openExternal) {
    try {
      window.electronAPI.openExternal(url);
    } catch (error) {
      console.warn('Electron API failed, falling back to window.open:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } else {
    console.log('Electron API not available, using window.open fallback');
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

declare global {
  interface Window {
    electronAPI?: { openExternal: (url: string) => void };
  }
}

const featuresList = [
          { key: 'join', label: 'Join two playlists to create a new playlist', icon: <FaLink size={20} color="#fa233b" /> },
  { key: 'split', label: 'Split one playlist into multiple playlists', icon: <FaCut size={20} color="#fa233b" /> },
  { key: 'dedupe', label: 'Delete duplicate tracks in your playlists', icon: <FaEraser size={20} color="#e94560" /> },
  { key: 'import', label: 'Import your list of your favorite Albums/Artists/Tracks as TXT, CSV or plain text', icon: <FaFileImport size={20} color="#1DB954" /> },
  { key: 'export-favs', label: 'Export your list of favorite Albums/Artists/Tracks as CSV, TXT, JSON, XML, and URL files', icon: <FaFileExport size={20} color="#ffb300" /> },
  { key: 'export-playlist', label: 'Export your playlist as CSV, TXT, XSPF, JSON, XML, and URL files', icon: <FaFileExport size={20} color="#ff0000" /> },
          { key: 'manage-favs', label: 'Manage your favorite Albums/Artists/Tracks', icon: <FaTasks size={20} color="#fa233b" /> },
  { key: 'starred', label: 'View and manage your starred playlists', icon: <FaStar size={20} color="#FFD700" /> },
];

// Universal Live Sync Progress Component
const UniversalLiveSyncProgress: React.FC<{ 
  syncProgress: any, 
  syncSummary: string, 
  elapsedSec: number 
}> = ({ syncProgress, syncSummary, elapsedSec }) => {
  if (!syncProgress) return null;
  
  return (
    <div style={{
      position: 'fixed', 
      top: 46, 
      right: 24, 
      zIndex: 2000, 
      background: 'rgba(30,30,30,0.85)', 
      border: '1px solid rgba(255,255,255,0.2)', 
      borderRadius: 12, 
      padding: '10px 14px', 
      minWidth: 260, 
      backdropFilter: 'blur(15px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="sync-spinner" style={{ width: 18, height: 18, border: '3px solid rgba(255,255,255,0.25)', borderTop: '3px solid #fa233b', borderRadius: '50%' }} />
        <div style={{ fontWeight: 700 }}>{syncProgress.currentStep || 'Working…'}</div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
        Elapsed: {Math.floor(elapsedSec/60)}m {elapsedSec%60}s
      </div>
      {syncSummary && (
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
          {syncSummary}
        </div>
      )}
    </div>
  );
};

const MainContent: React.FC<MainContentProps> = ({ current }) => {
  const [showAppleModal, setShowAppleModal] = useState(false);
  const [showSetupNotification, setShowSetupNotification] = useState(true);
  const [connections, setConnections] = useState({ spotify: false, apple: false, youtube: false });
  const [manuallyDisconnected, setManuallyDisconnected] = useState({ spotify: false, apple: false, youtube: false });
  const [appleUserToken, setAppleUserToken] = useState('');

  const [appleTokenError, setAppleTokenError] = useState('');
  const [playlists, setPlaylists] = useState<{ [key: string]: { id: string; name: string; artwork?: string | null }[] }>({});
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [playlistFilter, setPlaylistFilter] = useState<'none' | 'all' | 'spotify' | 'apple'>('all');
  const [slidingPosition, setSlidingPosition] = useState(1); // Start at 'all' position
  const [segmentWidth, setSegmentWidth] = useState(0);
  const [segmentOffset, setSegmentOffset] = useState(0);
  const [sourceService, setSourceService] = useState('spotify');
  
  // Initialize segment dimensions on mount
  React.useEffect(() => {
    const initializeSegments = () => {
      const segmentedControl = document.querySelector('.segmented-control');
      if (segmentedControl) {
        const buttons = segmentedControl.querySelectorAll('.segment');
        const filterOrder = ['none', 'all', 'spotify', 'apple'];
        const currentIndex = filterOrder.indexOf(playlistFilter);
        
        if (buttons[currentIndex]) {
          const buttonRect = buttons[currentIndex].getBoundingClientRect();
          const controlRect = segmentedControl.getBoundingClientRect();
          const relativeLeft = buttonRect.left - controlRect.left;
          setSegmentOffset(relativeLeft);
          setSegmentWidth(buttonRect.width);
        }
      }
    };
    
    // Initialize after a short delay to ensure DOM is ready
    const timer = setTimeout(initializeSegments, 50); // Faster initialization
    
    // Also recalculate on window resize
    const handleResize = () => {
      setTimeout(initializeSegments, 25); // Faster resize handling
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [playlistFilter]);
  
  // Handle filter change with sliding animation
  const handleFilterChange = (filter: 'none' | 'all' | 'spotify' | 'apple') => {
    const filterOrder = ['none', 'all', 'spotify', 'apple'];
    const newIndex = filterOrder.indexOf(filter);
    
    // Calculate the actual position based on button dimensions
    const segmentedControl = document.querySelector('.segmented-control');
    if (segmentedControl) {
      const buttons = segmentedControl.querySelectorAll('.segment');
      if (buttons[newIndex]) {
        const buttonRect = buttons[newIndex].getBoundingClientRect();
        const controlRect = segmentedControl.getBoundingClientRect();
        const relativeLeft = buttonRect.left - controlRect.left;
        setSegmentOffset(relativeLeft);
        setSegmentWidth(buttonRect.width);
      }
    }
    
    setSlidingPosition(newIndex);
    setPlaylistFilter(filter);
  };
  const [sourcePlaylist, setSourcePlaylist] = useState('');
  const [spotifyPlaylistUrl, setSpotifyPlaylistUrl] = useState('');
  const [destService, setDestService] = useState('apple');
  const [destPlaylist, setDestPlaylist] = useState('');
  const [creatingDest, setCreatingDest] = useState(false);
  const [customPlaylistName, setCustomPlaylistName] = useState('');
  const [showCustomNameInput, setShowCustomNameInput] = useState(false);

  const [syncLog, setSyncLog] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [useProfessionalLog, setUseProfessionalLog] = useState(true);
  const [fixingOrder, setFixingOrder] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncSummary, setSyncSummary] = useState('');
  const [finalSyncStats, setFinalSyncStats] = useState<{found: number, notFound: number} | undefined>(undefined);
  const [appleManualTracks, setAppleManualTracks] = useState('');
  const [spotifyRetryAvailable, setSpotifyRetryAvailable] = useState(false);

  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinResult, setJoinResult] = useState<{ success: boolean; message: string } | null>(null);
  const [joinServiceA, setJoinServiceA] = useState('spotify');
  const [joinPlaylistA, setJoinPlaylistA] = useState('');
  const [joinServiceB, setJoinServiceB] = useState('spotify');
  const [joinPlaylistB, setJoinPlaylistB] = useState('');
  const [joinNewName, setJoinNewName] = useState('');
  const [splitting, setSplitting] = useState(false);
  const [splitResult, setSplitResult] = useState<{ success: boolean; message: string } | null>(null);
  const [splitService, setSplitService] = useState('spotify');
  const [splitPlaylist, setSplitPlaylist] = useState('');
  const [splitSize, setSplitSize] = useState(50);
  const [splitBaseName, setSplitBaseName] = useState('');
  const [dedupeLoading, setDedupeLoading] = useState(false);
  const [dedupeResult, setDedupeResult] = useState<{ success: boolean; message: string } | null>(null);
  const [dedupePreview, setDedupePreview] = useState<string[]>([]);
  const [dedupeService, setDedupeService] = useState('spotify');
  const [dedupePlaylist, setDedupePlaylist] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [importText, setImportText] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFormat, setImportFormat] = useState('txt');
  const [exportingFavs, setExportingFavs] = useState(false);
  const [exportFavsResult, setExportFavsResult] = useState<{ success: boolean; message: string } | null>(null);
  const [sourceCSVFile, setSourceCSVFile] = useState<File | null>(null);
  const [destCSVFile, setDestCSVFile] = useState<File | null>(null);
  const [exportFavsFormat, setExportFavsFormat] = useState('csv');
  

  const [exportingPlaylist, setExportingPlaylist] = useState(false);
  const [exportPlaylistResult, setExportPlaylistResult] = useState<{ success: boolean; message: string } | null>(null);
  const [exportPlaylistService, setExportPlaylistService] = useState('spotify');
  const [exportPlaylistId, setExportPlaylistId] = useState('');
  const [exportPlaylistFormat, setExportPlaylistFormat] = useState('csv');
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [favorites, setFavorites] = useState<{ type: string; name: string }[]>([]);
  const [newFavoriteType, setNewFavoriteType] = useState('track');
  const [newFavoriteName, setNewFavoriteName] = useState('');
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logFiles, setLogFiles] = useState<{ 
    name: string; 
    created: string; 
    modified: string;
    size: number; 
    sizeFormatted: string;
  }[]>([]);
  const [selectedLogContent, setSelectedLogContent] = useState('');
  const [starredPlaylists, setStarredPlaylists] = useState<PlaylistListItem[]>([]);
  const [starredResult, setStarredResult] = useState<{ success: boolean; message: string } | null>(null);
  const [allPlaylistsForStar, setAllPlaylistsForStar] = useState<PlaylistListItem[]>([]);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [backendReady, setBackendReady] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [failedTracks, setFailedTracks] = useState<Array<{name: string, artist: string}>>([]);
  const [searchingTracks, setSearchingTracks] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{current: number, total: number, currentTrack: string, status: string} | null>(null);
  const [searchResults, setSearchResults] = useState<{
    completed: Array<{name: string, artist: string, status: 'found' | 'not_found' | 'skipped'}>;
    current: number;
    total: number;
  } | null>(null);
  const [notFoundLogFile, setNotFoundLogFile] = useState<string | null>(null);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [runStartTs, setRunStartTs] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Helper function to validate Spotify playlist URLs
  const isValidSpotifyPlaylistUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'open.spotify.com' && 
             urlObj.pathname.startsWith('/playlist/') &&
             urlObj.pathname.split('/').length >= 3;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let timer: any;
    if (runStartTs) {
      timer = setInterval(() => {
        setElapsedSec(Math.max(0, Math.floor((Date.now() - runStartTs) / 1000)));
      }, 1000);
    } else {
      setElapsedSec(0);
    }
    return () => timer && clearInterval(timer);
  }, [runStartTs]);
  
  // Manual search modal state

  
  // Additional state variables for features
  const [importService, setImportService] = useState('spotify');
  const [exportFavsService, setExportFavsService] = useState('spotify');
  const [exportPlaylist, setExportPlaylist] = useState('');
  const [manageFavsService, setManageFavsService] = useState('spotify');
  const [manageFavsAction, setManageFavsAction] = useState('');
  const [managingFavs, setManagingFavs] = useState(false);
  const [starredService, setStarredService] = useState('spotify');
  // Auto Sync state
  const [autoSyncJobs, setAutoSyncJobs] = useState<any[]>([]);
  const [creatingJob, setCreatingJob] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [sourceServiceTouched, setSourceServiceTouched] = useState(false);
  const [destServiceTouched, setDestServiceTouched] = useState(false);
  const [modeTouched, setModeTouched] = useState(false);
  const [autoSyncDraft, setAutoSyncDraft] = useState<any>({
    name: 'Auto Sync',
    mode: 'combine',
    sourcePlaylistIds: [],
    destinationPlaylistId: '',
    mappings: [],
    timeOfDay: '16:00',
    newDestName: ''
  });

  // Clear selections when changing services or modes to avoid stale IDs
  useEffect(() => {
    // Only clear when user actually changes the service from the dropdown
    if (sourceServiceTouched) {
      setAutoSyncDraft((d: any) => ({ ...d, sourcePlaylistIds: [], mappings: [] }));
      setSourceServiceTouched(false);
    }
    // Ensure playlists for new source exist
    if ((autoSyncDraft.sourceService || 'spotify') === 'spotify' || (autoSyncDraft.sourceService || 'spotify') === 'spotify-link') {
      if (!playlists.spotify && !manuallyDisconnected.spotify) fetchAllPlaylists();
    } else if (!playlists.apple) {
      if (!manuallyDisconnected.apple) fetchAllPlaylists();
    }
  }, [autoSyncDraft.sourceService]);

  useEffect(() => {
    if (destServiceTouched) {
      setAutoSyncDraft((d: any) => ({ ...d, destinationPlaylistId: '', mappings: [] }));
      setDestServiceTouched(false);
    }
    if ((autoSyncDraft.destinationService || 'apple') === 'apple') {
      if (!playlists.apple && !manuallyDisconnected.apple) fetchAllPlaylists();
    } else if (!playlists.spotify) {
      if (!manuallyDisconnected.spotify) fetchAllPlaylists();
    }
  }, [autoSyncDraft.destinationService]);

  useEffect(() => {
    if (modeTouched) {
      setAutoSyncDraft((d: any) => d.mode === 'combine'
        ? { ...d, mappings: [] }
        : { ...d, destinationPlaylistId: '', newDestName: '' }
      );
      setModeTouched(false);
    }
  }, [autoSyncDraft.mode]);

  const fetchAllPlaylists = useCallback(async () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🔍 [DIAGNOSTIC] FETCH ALL PLAYLISTS INITIATED');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 [DIAGNOSTIC] Current state:', {
      refreshing,
      connections,
      manuallyDisconnected,
      existingPlaylists: Object.keys(playlists),
      playlistCounts: Object.entries(playlists).map(([key, val]) => ({ [key]: val?.length || 0 }))
    });
    
    if (refreshing) {
      console.warn('⚠️ [DIAGNOSTIC] Already refreshing, skipping duplicate call');
      return;
    }
    
    setRefreshing(true);
    console.log('✅ [DIAGNOSTIC] Set refreshing to true');
    
    const result: { [key: string]: { id: string; name: string; artwork?: string | null }[] } = {};
    const errors: string[] = [];
    
    // Debug: Log current state
    console.log('🔍 [DIAGNOSTIC] fetchAllPlaylists state:', {
      connections,
      manuallyDisconnected,
      playlists: Object.keys(playlists)
    });
    
    // Priority order: Apple Music first, then others
    const priorityServices = [
      ...services.filter(s => s.key === 'apple'),
      ...services.filter(s => s.key !== 'apple')
    ];
    
    // Update playlists progressively instead of clearing all at once
    const updatePlaylists = (serviceKey: string, newPlaylists: any[]) => {
      setPlaylists(prev => ({
        ...prev,
        [serviceKey]: newPlaylists
      }));
    };
    
    for (const s of priorityServices) {
      // Only fetch playlists for services that are connected AND not manually disconnected
      console.log(`🔍 Checking ${s.key}: connected=${connections[s.key as keyof typeof connections]}, manuallyDisconnected=${manuallyDisconnected[s.key as keyof typeof manuallyDisconnected]}`);
      if (connections[s.key as keyof typeof connections] && !manuallyDisconnected[s.key as keyof typeof manuallyDisconnected]) {
        try {
          console.log(`📋 Fetching ${s.label} playlists...`);
          
          if (s.key === 'apple' && appleUserToken) {
            const res = await fetch(`${API_BASE_URL}/playlists/apple`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mediaUserToken: appleUserToken }),
              signal: AbortSignal.timeout(30000) // 30 second timeout
            });
            
            if (!res.ok) {
              throw new Error(`Failed to fetch Apple Music playlists: ${res.status}`);
            }
            
            const data = await res.json();
            const applePlaylists = (data.playlists || []).filter((p: any) => p && p.id && p.name);
            result[s.key] = applePlaylists;
            
            // Update Apple Music playlists immediately
            updatePlaylists(s.key, applePlaylists);
            console.log(`✅ Fetched ${applePlaylists.length} ${s.label} playlists`);
            
          } else if (s.key === 'spotify' || s.key === 'spotify-link') {
            // Skip Spotify if we've had recent rate limiting issues
            const lastSpotifyError = localStorage.getItem('lastSpotifyError');
            const now = Date.now();
            if (lastSpotifyError && (now - parseInt(lastSpotifyError)) < 300000) { // 5 minutes
              console.warn('⚠️ Skipping Spotify due to recent rate limiting');
              result[s.key] = [];
              setSpotifyRetryAvailable(true);
              continue;
            }
            
            const res = await fetch(`${API_BASE_URL}/playlists/spotify`, {
              signal: AbortSignal.timeout(10000) // 10 second timeout for Spotify
            });
            
            if (!res.ok) {
              if (res.status === 429 || res.status === 500) {
                // Store the error time to skip future requests
                localStorage.setItem('lastSpotifyError', now.toString());
                console.warn('⚠️ Spotify rate limited - skipping for 5 minutes');
                result[s.key] = [];
                setSpotifyRetryAvailable(true);
                continue;
              }
              throw new Error(`Failed to fetch Spotify playlists: ${res.status}`);
            }
            
            const data = await res.json();
            const spotifyPlaylists = (data.playlists || []).filter((p: any) => p && p.id && p.name);
            result[s.key] = spotifyPlaylists;
            
            // Update Spotify playlists immediately
            updatePlaylists(s.key, spotifyPlaylists);
            console.log(`✅ Fetched ${spotifyPlaylists.length} ${s.label} playlists`);
            
            // Clear any previous error on success
            localStorage.removeItem('lastSpotifyError');
            setSpotifyRetryAvailable(false);
            
          } else if (s.key === 'youtube') {
            const res = await fetch(`${API_BASE_URL}/playlists/youtube`, {
              signal: AbortSignal.timeout(30000) // 30 second timeout
            });
            
            if (!res.ok) {
              throw new Error(`Failed to fetch YouTube Music playlists: ${res.status}`);
            }
            
            const data = await res.json();
            const youtubePlaylists = (data.playlists || []).filter((p: any) => p && p.id && p.name);
            result[s.key] = youtubePlaylists;
            
            // Update YouTube playlists immediately
            updatePlaylists(s.key, youtubePlaylists);
            console.log(`✅ Fetched ${youtubePlaylists.length} ${s.label} playlists`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ Error fetching ${s.label} playlists:`, errorMsg);
          errors.push(`${s.label}: ${errorMsg}`);
          result[s.key] = [];
          
          // For Spotify rate limiting, store the error time and skip future requests
          if (s.key === 'spotify' && error instanceof Error && (error.message.includes('429') || error.message.includes('500'))) {
            localStorage.setItem('lastSpotifyError', Date.now().toString());
            console.warn('⚠️ Spotify rate limited - skipping for 5 minutes');
            setSpotifyRetryAvailable(true);
            continue;
          }
        }
      }
    }
    
    // Show errors if any
    if (errors.length > 0) {
      setSyncLog(prev => [...prev, `⚠️ Some playlists couldn't be loaded: ${errors.join(', ')}`]);
    }
    
    setRefreshing(false);
  }, [connections, manuallyDisconnected, appleUserToken]);

  // Manual Spotify retry function
  const retrySpotify = useCallback(async () => {
    localStorage.removeItem('lastSpotifyError');
    setSpotifyRetryAvailable(false);
    
    try {
      console.log('🔄 Manually retrying Spotify...');
      const res = await fetch(`${API_BASE_URL}/playlists/spotify`, {
        signal: AbortSignal.timeout(10000)
      });
      
      if (!res.ok) {
        throw new Error(`Failed to fetch Spotify playlists: ${res.status}`);
      }
      
      const data = await res.json();
      const spotifyPlaylists = (data.playlists || []).filter((p: any) => p && p.id && p.name);
      
      setPlaylists(prev => ({ ...prev, spotify: spotifyPlaylists }));
      console.log(`✅ Successfully fetched ${spotifyPlaylists.length} Spotify playlists`);
      
    } catch (error) {
      console.error('❌ Spotify retry failed:', error);
      if (error instanceof Error && (error.message.includes('429') || error.message.includes('500'))) {
        localStorage.setItem('lastSpotifyError', Date.now().toString());
        setSpotifyRetryAvailable(true);
      }
    }
  }, []);

  const resetSpotify = useCallback(async () => {
    try {
      console.log('🔄 Resetting Spotify connection...');
      const res = await fetch(`${API_BASE_URL}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (res.ok) {
        console.log('✅ Spotify connection reset successfully');
        localStorage.removeItem('lastSpotifyError');
        setSpotifyRetryAvailable(false);
        // Clear Spotify playlists from UI
        setPlaylists(prev => ({ ...prev, spotify: [] }));
        alert('Spotify connection reset! Please reconnect to Spotify in the Accounts section.');
      } else {
        throw new Error('Failed to reset Spotify connection');
      }
    } catch (error) {
      console.error('❌ Spotify reset failed:', error);
      alert('Failed to reset Spotify connection. Please try again.');
    }
  }, []);

  // Load auto-sync jobs
  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auto-sync/jobs`);
      if (res.ok) {
        const data = await res.json();
        setAutoSyncJobs(data.jobs || []);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (current === 'auto-sync') {
      loadJobs();
      if (!playlists.spotify && !manuallyDisconnected.spotify) fetchAllPlaylists();
      if (!playlists.apple && !manuallyDisconnected.apple) fetchAllPlaylists();
    }
  }, [current]);

  const createAutoSyncJob = async () => {
    try {
      setCreatingJob(true);
      const body: any = {
        name: autoSyncDraft.name || 'Auto Sync',
        mode: autoSyncDraft.mode,
        sourceService: autoSyncDraft.sourceService || 'spotify',
        destinationService: autoSyncDraft.destinationService || 'apple',
        timeOfDay: autoSyncDraft.timeOfDay || '16:00',
        storefront: 'us',
        enabled: true,
      };
      if (autoSyncDraft.mode === 'combine') {
        body.sourcePlaylistIds = autoSyncDraft.sourcePlaylistIds || [];
        if (autoSyncDraft.destinationPlaylistId) body.destinationPlaylistId = autoSyncDraft.destinationPlaylistId;
        else body.createNewDestination = { name: autoSyncDraft.newDestName || 'Combined Auto Sync' };
      } else {
        body.mappings = (autoSyncDraft.mappings || []).filter((m: any) => m && m.sourcePlaylistId);
      }
      const res = await fetch(`${API_BASE_URL}/auto-sync/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Failed');
      await loadJobs();
    } catch (e) {
      console.error('Create job failed', e);
    } finally {
      setCreatingJob(false);
    }
  };

  const startEditJob = async (job: any) => {
    // Load job into editor
    setEditingJobId(job.id);
    setAutoSyncDraft({
      name: job.name || 'Auto Sync',
      mode: job.mode || 'combine',
      sourceService: job.sourceService || 'spotify',
      destinationService: job.destinationService || 'apple',
      sourcePlaylistIds: Array.isArray(job.sourcePlaylistIds) ? job.sourcePlaylistIds : [],
      destinationPlaylistId: job.destinationPlaylistId || '',
      mappings: Array.isArray(job.mappings) ? job.mappings : [],
      timeOfDay: job.timeOfDay || '16:00',
      newDestName: ''
    });
    // Ensure playlists for selected services are loaded
    if (job.sourceService === 'spotify' && !playlists.spotify && !manuallyDisconnected.spotify) fetchAllPlaylists();
    if (job.sourceService === 'apple' && !playlists.apple && !manuallyDisconnected.apple) fetchAllPlaylists();
    if (job.destinationService === 'spotify' && !playlists.spotify && !manuallyDisconnected.spotify) fetchAllPlaylists();
    if (job.destinationService === 'apple' && !playlists.apple && !manuallyDisconnected.apple) fetchAllPlaylists();
  };

  const cancelEditJob = () => {
    setEditingJobId(null);
    setAutoSyncDraft({
      name: 'Auto Sync',
      mode: 'combine',
      sourceService: 'spotify',
      destinationService: 'apple',
      sourcePlaylistIds: [],
      destinationPlaylistId: '',
      mappings: [],
      timeOfDay: '16:00',
      newDestName: ''
    });
  };

  const saveEditedJob = async () => {
    if (!editingJobId) return;
    try {
      setCreatingJob(true);
      const body: any = {
        name: autoSyncDraft.name || 'Auto Sync',
        mode: autoSyncDraft.mode,
        sourceService: autoSyncDraft.sourceService || 'spotify',
        destinationService: autoSyncDraft.destinationService || 'apple',
        timeOfDay: autoSyncDraft.timeOfDay || '16:00',
      };
      if (autoSyncDraft.mode === 'combine') {
        body.sourcePlaylistIds = autoSyncDraft.sourcePlaylistIds || [];
        body.destinationPlaylistId = autoSyncDraft.destinationPlaylistId || null;
      } else {
        body.mappings = (autoSyncDraft.mappings || []).filter((m: any) => m && m.sourcePlaylistId);
      }
      await fetch(`${API_BASE_URL}/auto-sync/jobs/${encodeURIComponent(editingJobId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      await loadJobs();
      cancelEditJob();
    } catch (e) {
      console.error('Save job failed', e);
    } finally {
      setCreatingJob(false);
    }
  };

  const toggleJob = async (id: string, enabled: boolean) => {
    await fetch(`${API_BASE_URL}/auto-sync/jobs/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
    await loadJobs();
  };

  const deleteJob = async (id: string) => {
    await fetch(`${API_BASE_URL}/auto-sync/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadJobs();
  };

  const runJob = async (id: string) => {
    setRunStartTs(Date.now());
    setSyncProgress({ current: 0, total: 0, currentStep: 'Starting…', eta: '', startTime: Date.now(), status: 'starting' });
    setSyncLog(prev => [...prev, '📡 Sync job accepted. Tracking progress...']);
    await fetch(`${API_BASE_URL}/auto-sync/jobs/${encodeURIComponent(id)}/run`, { method: 'POST' });
  };

  const canAutoAdd = (job: any) => {
    return job && job.sourceService === 'spotify' && job.destinationService === 'apple';
  };

  const runAutoAddMissing = async (job: any) => {
    if (!canAutoAdd(job)) return;
    // Build (source,destination) pairs for the entire job, creating destinations when requested
    const pairs: Array<{ src: string; dest: string }> = [];
    if (job.mode === 'map' && Array.isArray(job.mappings)) {
      for (const m of job.mappings) {
        if (!m || !m.sourcePlaylistId) continue;
        let destId = m.destPlaylistId;
        if (!destId || destId === 'none') {
          const src = (playlists['spotify'] || []).find(p => p.id === m.sourcePlaylistId);
          const desiredName = (m.createNewName || (src && src.name) || 'Auto Sync').trim();
          try {
            setSyncLog(prev => [...prev, `🎯 Creating Apple playlist for "${desiredName}"...`]);
            const resp = await fetch(`${API_BASE_URL}/playlists/apple/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: desiredName }) });
            const data = await resp.json().catch(() => ({} as any));
            if (resp.ok && data && data.playlist && data.playlist.id) {
              destId = data.playlist.id;
              setSyncLog(prev => [...prev, `✅ Created destination "${data.playlist.name}"`]);
            } else {
              setSyncLog(prev => [...prev, `❌ Failed to create destination for "${desiredName}"`] );
              continue;
            }
          } catch (_) {
            setSyncLog(prev => [...prev, `❌ Failed to create destination for "${desiredName}"`] );
            continue;
          }
        }
        if (destId && destId !== 'none') {
          pairs.push({ src: m.sourcePlaylistId, dest: destId });
        }
      }
    } else if (job.mode === 'combine' && Array.isArray(job.sourcePlaylistIds)) {
      let destId = job.destinationPlaylistId;
      if (!destId || destId === 'none') {
        const desiredName = (job.newDestName || 'Auto Sync Combined').trim();
        try {
          setSyncLog(prev => [...prev, `🎯 Creating Apple playlist "${desiredName}"...`]);
          const resp = await fetch(`${API_BASE_URL}/playlists/apple/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: desiredName }) });
          const data = await resp.json().catch(() => ({} as any));
          if (resp.ok && data && data.playlist && data.playlist.id) {
            destId = data.playlist.id;
            setSyncLog(prev => [...prev, `✅ Created destination "${data.playlist.name}"`]);
          } else {
            setSyncLog(prev => [...prev, `❌ Failed to create destination "${desiredName}"`] );
          }
        } catch (_) {
          setSyncLog(prev => [...prev, `❌ Failed to create destination "${desiredName}"`] );
        }
      }
      if (destId) {
        for (const srcId of job.sourcePlaylistIds) {
          if (srcId) pairs.push({ src: srcId, dest: destId });
        }
      }
    }
    if (pairs.length === 0) {
      setSyncLog(prev => [...prev, '⚠️ Auto-Add Missing skipped: no valid source/destination pairs found.']);
      return;
    }
    setRunStartTs(Date.now());
    setSyncProgress({ current: 0, total: pairs.length, currentStep: 'Starting Auto-Add Missing…', eta: '', startTime: Date.now(), status: 'starting' });
    setSyncLog(prev => [...prev, `📡 Auto-Add Missing started for ${pairs.length} playlist${pairs.length>1?'s':''}...`]);
    let idx = 0;
    for (const { src, dest } of pairs) {
      idx += 1;
      setSyncProgress(prev => prev ? { ...prev, current: idx-1, currentStep: `Processing ${idx}/${pairs.length}...` } : prev);
      try {
        await fetch(`${API_BASE_URL}/api/auto-add-missing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourcePlaylistId: src, destinationPlaylistId: dest }) });
        setSyncLog(prev => [...prev, `✅ Auto-Add Missing queued for pair ${idx}/${pairs.length}`]);
      } catch (e) {
        setSyncLog(prev => [...prev, `❌ Auto-Add Missing failed to queue for pair ${idx}/${pairs.length}`]);
      }
      // No delay - instant speed
    }
    setSyncLog(prev => [...prev, '✅ Auto-Add Missing queued for all pairs. The backend will finish the fix-order step; you will see a Completed message when it\'s done.']);
  };

  // Create a destination playlist using the source playlist name (Apple Music or Spotify)
  const handleCreateDestinationPlaylist = useCallback(async (customName?: string) => {
    try {
      if (!sourceService || !sourcePlaylist) {
        alert('Please select a source playlist first.');
        return;
      }
      
      // Use custom name if provided, otherwise use source playlist name
      const playlistName = customName?.trim() || playlists[sourceService]?.find(p => p.id === sourcePlaylist)?.name;
      if (!playlistName) {
        alert('Could not determine playlist name.');
        return;
      }
      
      setCreatingDest(true);
      const endpoint = destService === 'apple' ? '/playlists/apple/create' : destService === 'spotify' ? '/playlists/spotify/create' : '';
      if (!endpoint) {
        alert('Create new playlist is not available for this service yet.');
        setCreatingDest(false);
        return;
      }
      const res = await fetch(`${API_BASE_URL}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: playlistName }) });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.playlist?.id) {
        throw new Error(data?.error || 'Failed to create playlist');
      }
      const created = data.playlist as { id: string; name: string; artwork?: string | null };
      // Update local playlist cache and select it as destination
      setPlaylists(prev => ({
        ...prev,
        [destService]: [created, ...((prev as any)[destService] || [])]
      }));
      setDestService(destService);
      setDestPlaylist(created.id);
      setSyncLog(prev => [...prev, `🆕 Created ${destService} playlist "${created.name}" and selected it as destination.`]);
      
      // Reset custom name input
      setCustomPlaylistName('');
      setShowCustomNameInput(false);
    } catch (err) {
      console.error('Create destination playlist error:', err);
      alert(`Failed to create destination playlist: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreatingDest(false);
    }
  }, [destService, sourceService, sourcePlaylist, playlists]);

  // Feature handlers
  const handleJoinPlaylists = async () => {
    if (!joinPlaylistA || !joinPlaylistB || !joinNewName) return;
    
    setJoining(true);
    try {
              const response = await fetch(`${API_BASE_URL}/features/join_playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceA: joinServiceA,
          playlistA: joinPlaylistA,
          serviceB: joinServiceB,
          playlistB: joinPlaylistB,
          newPlaylistName: joinNewName
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(`Success: ${result.message}`);
        // Reset form
        setJoinServiceA('');
        setJoinPlaylistA('');
        setJoinServiceB('');
        setJoinPlaylistB('');
        setJoinNewName('');
        // Refresh playlists
        fetchAllPlaylists();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Join error:', error);
      alert('Failed to join playlists. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const handleSplitPlaylist = async () => {
    if (!splitPlaylist || !splitBaseName || !splitSize) return;
    
    setSplitting(true);
    try {
              const response = await fetch(`${API_BASE_URL}/features/split_playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: splitService,
          playlist: splitPlaylist,
          splitSize: splitSize,
          baseName: splitBaseName
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(`Success: ${result.message}\nCreated ${result.newPlaylists?.length || 0} new playlists.`);
        // Reset form
        setSplitService('');
        setSplitPlaylist('');
        setSplitBaseName('');
        setSplitSize(25);
        // Refresh playlists
        fetchAllPlaylists();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Split error:', error);
      alert('Failed to split playlist. Please try again.');
    } finally {
      setSplitting(false);
    }
  };



  const handleExportFavorites = async () => {
    if (!exportFavsService || !exportFavsFormat) return;
    
    setExportingFavs(true);
    try {
              const response = await fetch(`${API_BASE_URL}/features/export_favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: exportFavsService,
          format: exportFavsFormat
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `favorites.${exportFavsFormat}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        alert('Favorites exported successfully!');
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Export favorites error:', error);
      alert('Failed to export favorites. Please try again.');
    } finally {
      setExportingFavs(false);
    }
  };

  const handleExportPlaylist = async () => {
    if (!exportPlaylist || !exportPlaylistFormat) return;
    
    setExportingPlaylist(true);
    try {
              const response = await fetch(`${API_BASE_URL}/features/export_playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: exportPlaylistService,
          playlist: exportPlaylist,
          format: exportPlaylistFormat
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `playlist.${exportPlaylistFormat}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        alert('Playlist exported successfully!');
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Export playlist error:', error);
      alert('Failed to export playlist. Please try again.');
    } finally {
      setExportingPlaylist(false);
    }
  };

  // ETA calculation function
  const calculateETA = (current: number, total: number, startTime: number): string => {
    if (current === 0 || total === 0) return 'Calculating...';
    
    const elapsed = Date.now() - startTime;
    const rate = current / elapsed;
    const remaining = total - current;
    const eta = remaining / rate;
    
    if (eta < 60000) return `${Math.round(eta / 1000)}s`;
    if (eta < 3600000) return `${Math.round(eta / 60000)}m`;
    return `${Math.round(eta / 3600000)}h`;
  };

  // Parse failed tracks from sync logs
  const parseFailedTracksFromLogs = (logs: string[]): Array<{name: string, artist: string}> => {
    const failed: Array<{name: string, artist: string}> = [];
    
    logs.forEach(log => {
      // Pattern 1: "Could not find Spotify track for: "TRACK" by "ARTIST""
      const couldNotFindMatch = log.match(/Could not find.*track.*["'](.+?)["'].*by.*["'](.+?)["']/i);
      if (couldNotFindMatch) {
        failed.push({ name: couldNotFindMatch[1], artist: couldNotFindMatch[2] });
        return;
      }
      
      // Pattern 2: "❌ Could not find Apple Music track: "TRACK" by "ARTIST""
      const appleNotFoundMatch = log.match(/Could not find Apple Music track.*["'](.+?)["'].*by.*["'](.+?)["']/i);
      if (appleNotFoundMatch) {
        failed.push({ name: appleNotFoundMatch[1], artist: appleNotFoundMatch[2] });
        return;
      }
      
      // Pattern 3: Lines that start with track numbers and contain error info
      const trackErrorMatch = log.match(/^\d+\.\s*["'](.+?)["'].*by.*["'](.+?)["']/i);
      if (trackErrorMatch && (log.includes('failed') || log.includes('error') || log.includes('not found'))) {
        failed.push({ name: trackErrorMatch[1], artist: trackErrorMatch[2] });
        return;
      }
      
      // Pattern 4: General failure pattern
      const generalFailMatch = log.match(/(?:Failed|Error).*["'](.+?)["'].*["'](.+?)["']/i);
      if (generalFailMatch) {
        failed.push({ name: generalFailMatch[1], artist: generalFailMatch[2] });
      }
    });
    
    // Remove duplicates
    const unique = failed.filter((track, index, arr) => 
      arr.findIndex(t => t.name === track.name && t.artist === track.artist) === index
    );
    
    return unique;
  };

  // Open Apple Music search for a track
  const openAppleMusicSearch = (trackName: string, artistName: string) => {
    const query = encodeURIComponent(`${trackName} ${artistName}`);
    const url = `https://music.apple.com/search?term=${query}`;
    
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  // Open searches for all failed tracks with delays
  const handleSearchFailedTracks = async () => {
    const failed = parseFailedTracksFromLogs(syncLog);
    setFailedTracks(failed);
    
    if (failed.length === 0) {
      alert('No failed tracks found in current sync log!');
      return;
    }

    const mode = confirm(`Found ${failed.length} failed tracks. Choose search mode:\n\nOK = Interactive mode (pause after each search to track results)\nCancel = Auto mode (open all searches with 1.5s delays)`);
    
    if (mode) {
      // Interactive mode with tracking
      await handleInteractiveSearch(failed);
      return;
    }

    setSearchingTracks(true);
    setSearchProgress({ current: 0, total: failed.length, currentTrack: '', status: 'starting' });
    
    try {
      for (let i = 0; i < failed.length; i++) {
        const track = failed[i];
        const trackDisplay = `"${track.name}" by "${track.artist}"`;
        
        // Update progress
        setSearchProgress({ current: i + 1, total: failed.length, currentTrack: trackDisplay, status: 'searching' });
        setSyncLog(prev => [...prev, `🔍 Opening search ${i + 1}/${failed.length}: ${trackDisplay}`]);
        
        console.log(`Opening search ${i + 1}/${failed.length}: ${trackDisplay}`);
        
        openAppleMusicSearch(track.name, track.artist);
        
        // Add confirmation prompt for each track
        if (confirm(`Track ${i + 1}/${failed.length}: "${track.name}" by "${track.artist}"\n\nApple Music search opened. After you check:\n\nOK = Continue to next track\nCancel = Stop search process`)) {
          // Continue to next track
          setSyncLog(prev => [...prev, `➡️ Moving to next track...`]);
          
          // Add delay between opens
          if (i < failed.length - 1) {
            // No delay - instant speed
          }
        } else {
          // User wants to stop
          setSyncLog(prev => [...prev, `⏹️ Search stopped by user at track ${i + 1}/${failed.length}`]);
          break;
        }
      }
      
      setSyncLog(prev => [...prev, `🎵 Opened ${failed.length} Apple Music searches for failed tracks`]);
    } catch (error) {
      console.error('Error opening searches:', error);
      setSyncLog(prev => [...prev, `❌ Error opening searches: ${error}`]);
    } finally {
      setSearchingTracks(false);
      setSearchProgress(null);
    }
  };

  // Get the count of failed tracks for display
  const getFailedTracksCount = (): number => {
    return parseFailedTracksFromLogs(syncLog).length;
  };

  // Interactive search with user feedback
  const handleInteractiveSearch = async (tracks: Array<{name: string, artist: string}>) => {
    setSearchingTracks(true);
    setSearchProgress({ current: 0, total: tracks.length, currentTrack: '', status: 'starting' });
    setSearchResults({ completed: [], current: 0, total: tracks.length });
    
    try {
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const trackDisplay = `"${track.name}" by "${track.artist}"`;
        
        // Update progress
        setSearchProgress({ current: i + 1, total: tracks.length, currentTrack: trackDisplay, status: 'searching' });
        setSyncLog(prev => [...prev, `🔍 Opening search ${i + 1}/${tracks.length}: ${trackDisplay}`]);
        
        // Open Apple Music search
        openAppleMusicSearch(track.name, track.artist);
        
                 // Wait for user to check the result
         const result = await new Promise<'found' | 'not_found' | 'skipped'>((resolve) => {
          const message = `Track ${i + 1}/${tracks.length}: ${trackDisplay}\n\nDid you find and add this track to your Apple Music library?\n\nOK = Found & Added\nCancel = Not Found/Unavailable\n\n(Click OK after adding the track, or Cancel if you couldn't find it)`;
          
          setTimeout(() => {
            const found = confirm(message);
            resolve(found ? 'found' : 'not_found');
          }, 1000); // Small delay to let the search open
        });
        
        // Update results
        setSearchResults(prev => prev ? {
          ...prev,
          completed: [...prev.completed, { name: track.name, artist: track.artist, status: result }],
          current: i + 1
        } : null);
        
        // Log the result
        const statusEmoji = result === 'found' ? '✅' : '❌';
        const statusText = result === 'found' ? 'Found & Added' : 'Not Found/Unavailable';
        setSyncLog(prev => [...prev, `${statusEmoji} ${statusText}: ${trackDisplay}`]);
      }
      
      // Show final summary
      const results = searchResults?.completed || [];
      const found = results.filter(r => r.status === 'found').length;
      const notFound = results.filter(r => r.status === 'not_found').length;
      
      setSyncLog(prev => [...prev, `📊 Search Complete! Found: ${found}, Not Found: ${notFound}, Total: ${tracks.length}`]);
      
    } catch (error) {
      console.error('Error in interactive search:', error);
      setSyncLog(prev => [...prev, `❌ Error in interactive search: ${error}`]);
    } finally {
      setSearchingTracks(false);
      setSearchProgress(null);
      // Keep search results visible for review
    }
  };

  // Load failed tracks from a log file
  const handleLoadFailedTracksFromLog = async (logContent: string) => {
    try {
              const response = await fetch(`${API_BASE_URL}/api/parse-failed-tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logContent })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setFailedTracks(data.failedTracks);
        setSyncLog(prev => [...prev, `📁 Loaded ${data.count} failed tracks from log file`]);
        
                 // Auto-open searches
         const proceed = confirm(`Found ${data.count} failed tracks in log file. Open Apple Music searches for all of them?\n\n(Each search will open with a 1.5s delay)`);
         if (proceed) {
           setSearchingTracks(true);
           setSearchProgress({ current: 0, total: data.count, currentTrack: '', status: 'Starting' });
           
           for (let i = 0; i < data.failedTracks.length; i++) {
             const track = data.failedTracks[i];
             const trackDisplay = `"${track.name}" by "${track.artist}"`;
             
             // Update progress
             setSearchProgress({ current: i + 1, total: data.count, currentTrack: trackDisplay, status: 'Searching' });
             setSyncLog(prev => [...prev, `🔍 Opening search ${i + 1}/${data.count}: ${trackDisplay}`]);
             
             console.log(`Opening search ${i + 1}/${data.count}: ${trackDisplay}`);
             openAppleMusicSearch(track.name, track.artist);
             
             if (i < data.failedTracks.length - 1) {
               // No delay - instant speed
             }
           }
           
           setSyncLog(prev => [...prev, `🎵 Opened ${data.count} Apple Music searches from log file`]);
           setSearchingTracks(false);
           setSearchProgress(null);
         }
      } else {
        alert('Failed to parse log file: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error loading failed tracks from log:', error);
      alert('Error loading failed tracks from log: ' + error);
    }
  };







  // Compare playlists and find missing tracks (without syncing)
  const handleCompareAndFindMissing = async () => {
    if (!sourceService || !sourcePlaylist || !destService || !destPlaylist) {
      alert('Please select both source and destination playlists first!');
      return;
    }

    try {
      setSyncLog(prev => [...prev, `🔍 Comparing ${sourceService} playlist with ${destService} playlist...`]);
      
              const response = await fetch(`${API_BASE_URL}/api/compare-playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceService,
          sourcePlaylistId: sourcePlaylist,
          destService,
          destPlaylistId: destPlaylist
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setFailedTracks(data.missingTracks);
        setSyncLog(prev => [...prev, `📊 Found ${data.missingTracks.length} tracks missing from ${destService} playlist`]);
        
                 if (data.missingTracks.length > 0) {
           const proceed = confirm(`Found ${data.missingTracks.length} missing tracks. Open Apple Music searches for all of them?\n\n(Each search will open with a 1.5s delay)`);
           if (proceed) {
             setSearchingTracks(true);
             setSearchProgress({ current: 0, total: data.missingTracks.length, currentTrack: '', status: 'Starting' });
             
             for (let i = 0; i < data.missingTracks.length; i++) {
               const track = data.missingTracks[i];
               const trackDisplay = `"${track.name}" by "${track.artist}"`;
               
               // Update progress
               setSearchProgress({ current: i + 1, total: data.missingTracks.length, currentTrack: trackDisplay, status: 'searching' });
               setSyncLog(prev => [...prev, `🔍 Opening search ${i + 1}/${data.missingTracks.length}: ${trackDisplay}`]);
               
               console.log(`Opening search ${i + 1}/${data.missingTracks.length}: ${trackDisplay}`);
               openAppleMusicSearch(track.name, track.artist);
               
               if (i < data.missingTracks.length - 1) {
                 // No delay - instant speed
               }
             }
             
             setSyncLog(prev => [...prev, `🎵 Opened ${data.missingTracks.length} Apple Music searches for missing tracks`]);
             setSearchingTracks(false);
             setSearchProgress(null);
           }
        } else {
          alert('Great! No missing tracks found. Both playlists have the same tracks.');
        }
      } else {
        alert('Failed to compare playlists: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error comparing playlists:', error);
      alert('Error comparing playlists: ' + error);
    }
  };

  // Remove duplicates from Apple Music playlist
  const handleRemoveDuplicates = async () => {
    if (!destService || !destPlaylist) {
      alert('Please select a destination playlist first!');
      return;
    }

    if (destService !== 'apple') {
      alert('Remove Duplicates currently only works with Apple Music playlists!');
      return;
    }

    const proceed = confirm('This will create a new playlist with all duplicates removed from your current playlist.\n\nContinue?');
    if (!proceed) return;

    try {
      setSyncLog(prev => [...prev, `🧹 Removing duplicates from ${destService} playlist...`]);
      
              const response = await fetch(`${API_BASE_URL}/api/remove-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistId: destPlaylist
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setSyncLog(prev => [...prev, `✅ Duplicates removed! ${data.duplicatesRemoved} duplicates found and removed`]);
        setSyncLog(prev => [...prev, `📊 Original: ${data.originalCount} tracks → New: ${data.newCount} tracks`]);
        setSyncLog(prev => [...prev, `🎵 New playlist created: "${data.newPlaylistName}"`]);
        
        // Play completion sound
        playCompletionSound();
        
        alert(`Duplicates Removed!\n\n🗑️ Removed: ${data.duplicatesRemoved} duplicates\n📊 Original: ${data.originalCount} tracks\n📊 New: ${data.newCount} tracks\n🎵 New playlist: "${data.newPlaylistName}"`);
        
        // Refresh playlists to show the new one
        fetchAllPlaylists();
        
      } else {
        setSyncLog(prev => [...prev, `❌ Remove duplicates failed: ${data.error || 'Unknown error'}`]);
        alert('Remove duplicates failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error removing duplicates:', error);
      setSyncLog(prev => [...prev, `❌ Error removing duplicates: ${error}`]);
      alert('Error removing duplicates: ' + error);
    }
  };

  // Sound notification function
  const playCompletionSound = () => {
    try {
      // Create a pleasant completion sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create a sequence of tones for a pleasant "ding" sound
      const frequencies = [800, 1000, 1200]; // Rising tone
      const duration = 0.15; // Each tone duration
      
      frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
        oscillator.type = 'sine';
        
        // Envelope for smooth sound
        const startTime = audioContext.currentTime + (index * 0.1);
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      });
    } catch (error) {
      console.log('Could not play completion sound:', error);
    }
  };

  // Setup WebSocket connection with auto-reconnect
  useEffect(() => {
    if (!backendReady) return; // Wait for backend to be ready

    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000; // 3 seconds

    const connectWebSocket = () => {
      // Only create WebSocket if one doesn't exist
      if (wsConnection?.readyState === WebSocket.OPEN) {
        return; // Already connected
      }

      try {
        ws = new WebSocket(buildWsUrl('/ws'));
        
        ws.onopen = () => {
          console.log('🔌 WebSocket connected for real-time progress updates');
          setWsConnection(ws);
          reconnectAttempts = 0; // Reset attempts on successful connection
        };
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            const type = message?.type;
            const payload = message?.data;
            const text = (payload && payload.message) || message?.message || '';
            
            // Debug: Log ALL WebSocket messages to see what's being received
            console.log('🔌 WebSocket message received:', { type, message, payload });

            switch (type) {
              case 'progress': {
                if (payload && typeof payload === 'object') {
                  // Handle structured progress data with actual track counts
                  if (payload.current !== undefined && payload.total !== undefined) {
                    setSyncProgress({
                      current: payload.current,
                      total: payload.total,
                      currentStep: payload.currentStep || 'Processing...',
                      eta: payload.eta || 'Calculating...',
                      startTime: payload.startTime || Date.now(),
                      status: payload.status || 'starting',
                      trackInfo: payload.trackInfo || null
                    });
                  } else {
                    // Fallback for legacy message format
                    setSyncProgress(prev => prev ? { ...prev, currentStep: payload.message || 'Processing...' } : prev);
                  }
                  
                  if (payload.currentStep) {
                    setSyncLog(prev => {
                      const newLog = [...prev];
                      const lastLogEntry = newLog[newLog.length - 1];
                      if (!lastLogEntry || !lastLogEntry.includes(payload.currentStep)) {
                        newLog.push(`🔄 ${payload.currentStep}`);
                      }
                      return newLog;
                    });
                  }
                } else if (text) {
                  setSyncLog(prev => [...prev, `🔄 ${text}`]);
                }
                break;
              }

              case 'log': {
                if (text) setSyncLog(prev => [...prev, text]);
                break;
              }

              case 'error': {
                if (text) setSyncLog(prev => [...prev, `❌ ${text}`]);
                break;
              }

              case 'finish': {
                console.log('🎯 FINISH EVENT RECEIVED:', { message, payload, text });
                
                if (text) setSyncLog(prev => [...prev, `✅ ${text}`]);
                
                // Check for found/notFound in message directly (backend sends it here)
                const found = message?.found ?? payload?.found;
                const notFound = message?.notFound ?? payload?.notFound;
                
                console.log('🎯 EXTRACTED VALUES:', { found, notFound, messageFound: message?.found, messageNotFound: message?.notFound });
                
                // If backend provides summary numbers
                if (found !== undefined || notFound !== undefined) {
                  const total = (found ?? 0) + (notFound ?? 0);
                  const successRate = total > 0 ? Math.round(((found ?? 0) / total) * 100) : 0;
                  const summary = `Sync completed: ${found ?? 0} songs added successfully (${successRate}% success rate)`;
                  setSyncSummary(summary);
                  
                  console.log('✅ DEBUG: Finish event received:', { found, notFound, message });
                  console.log('✅ DEBUG: Setting finalStats to:', { found, notFound });
                  
                  // Store final stats for accurate display
                  const newFinalStats = {
                    found: found ?? 0,
                    notFound: notFound ?? 0,
                    timestamp: Date.now()
                  };
                  
                  // Force state update with new object reference
                  setFinalSyncStats(newFinalStats);
                  
                  // Force component re-render by updating sync log
                  setSyncLog(prev => [...prev, `✅ Final stats: ${found} found, ${notFound} not found`]);
                  
                  console.log('✅ DEBUG: finalStats state updated to:', newFinalStats);
                } else {
                  console.error('❌ DEBUG: Finish event missing data:', { message, payload, found, notFound });
                }
                
                // CRITICAL FIX: Always set syncProgress to completed, even if it's null
                setSyncProgress(prev => {
                  if (prev) {
                    return { ...prev, status: 'completed', currentStep: 'Sync Completed!' };
                  } else {
                    // Create a default syncProgress if it doesn't exist
                    return {
                      current: found ?? 0,
                      total: (found ?? 0) + (notFound ?? 0),
                      status: 'completed',
                      currentStep: 'Sync Completed!',
                      trackInfo: null,
                      eta: 'Complete'
                    };
                  }
                });
                
                setRunStartTs(null);
                playCompletionSound();
                break;
              }

              case 'test': {
                console.log('🧪 WebSocket test message received:', text);
                break;
              }
              
              default:
                console.log('Unknown WebSocket message type:', type);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
        
        ws.onclose = (event) => {
          console.log('🔌 WebSocket disconnected:', event.code, event.reason);
          setWsConnection(null);
          
          // Attempt to reconnect if not manually closed
          if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(`🔄 Attempting to reconnect WebSocket (${reconnectAttempts}/${maxReconnectAttempts})...`);
            
            reconnectTimeout = setTimeout(() => {
              connectWebSocket();
            }, reconnectDelay);
          }
        };
        
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        
        // Retry connection
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          reconnectTimeout = setTimeout(() => {
            connectWebSocket();
          }, reconnectDelay);
        }
      }
    };

    // Initial connection
    connectWebSocket();

    // Check service connections
    const checkConnections = async () => {
      try {
        let hasActiveConnection = false;
        
        // Check Spotify (only if not manually disconnected)
        if (!manuallyDisconnected.spotify) {
          const spotifyRes = await fetch(`${API_BASE_URL}/auth/spotify/status`);
          const spotifyData = await spotifyRes.json();
          setConnections(prev => ({ ...prev, spotify: spotifyData.connected }));
          if (spotifyData.connected) hasActiveConnection = true;
        } else {
          // If manually disconnected, ensure connection is set to false
          setConnections(prev => ({ ...prev, spotify: false }));
        }
        
        // Check Apple Music (only if not manually disconnected)
        if (!manuallyDisconnected.apple) {
          const appleRes = await fetch(`${API_BASE_URL}/auth/apple/status`);
          const appleData = await appleRes.json();
          if (appleData.connected && appleData.credentials) {
            setAppleUserToken(appleData.credentials.mediaUserToken);
            setConnections(prev => ({ ...prev, apple: true }));
            hasActiveConnection = true;
          }
        } else {
          // If manually disconnected, ensure connection is set to false
          setConnections(prev => ({ ...prev, apple: false }));
        }
        
        // Check YouTube Music (only if not manually disconnected)
        if (!manuallyDisconnected.youtube) {
          const youtubeRes = await fetch(`${API_BASE_URL}/auth/youtube/status`);
          const youtubeData = await youtubeRes.json();
          setConnections(prev => ({ ...prev, youtube: youtubeData.connected }));
          if (youtubeData.connected) hasActiveConnection = true;
        } else {
          // If manually disconnected, ensure connection is set to false
          setConnections(prev => ({ ...prev, youtube: false }));
        }
        
        // Fetch playlists if any service is connected
        if (hasActiveConnection) {
          fetchAllPlaylists();
        }
      } catch (err) {
        console.error('Failed to check service status:', err);
      }
    };

    checkConnections();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Component unmounting');
      }
    };
  }, [backendReady, API_BASE_URL, manuallyDisconnected]); // Include manuallyDisconnected in dependencies

  // Auto-refresh effect
  useEffect(() => {
    // Only start auto-refresh if backend is ready and we have at least one active connection
    const activeConnections = Object.entries(connections).filter(([service, connected]) => 
      connected && !manuallyDisconnected[service as keyof typeof manuallyDisconnected]
    );
    
    if (backendReady && activeConnections.length > 0) {
      const interval = setInterval(fetchAllPlaylists, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, backendReady, connections, manuallyDisconnected, fetchAllPlaylists]);

  // Trigger playlist refresh when connections change
  useEffect(() => {
    const activeConnections = Object.entries(connections).filter(([service, connected]) => 
      connected && !manuallyDisconnected[service as keyof typeof manuallyDisconnected]
    );
    
    if (backendReady && activeConnections.length > 0) {
      fetchAllPlaylists(); // Fetch playlists when connections change
    }
  }, [connections, manuallyDisconnected, backendReady, fetchAllPlaylists]);

  useEffect(() => {
    let cancelled = false;
    const waitForBackend = async (url: string, maxAttempts = 15, delayMs = 1000) => {
      console.log('Waiting for backend at:', url);
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`Backend connection attempt ${attempt}/${maxAttempts}`);
          const res = await fetch(url, { method: 'GET' });
          if (res.ok) {
            console.log('Backend connection successful!');
            return true;
          }
          console.log('Backend response not ok:', res.status, res.statusText);
        } catch (e) {
          console.log(`Backend connection attempt ${attempt} failed:`, e);
          // Ignore, will retry
        }
        await new Promise(res => setTimeout(res, delayMs));
      }
      console.log('Backend connection failed after all attempts');
      return false;
    };
    (async () => {
      const ready = await waitForBackend(API_ENDPOINTS.HEALTH, 15, 1000);
      if (!cancelled) {
        setBackendReady(ready);
        if (!ready) setBackendError('Backend failed to start. Please restart the app or check logs.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load manually disconnected preferences from localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('manuallyDisconnected') || '{}');
      setManuallyDisconnected(stored);
    } catch (err) {
      console.error('Failed to load manually disconnected preferences:', err);
    }
  }, []);

  useEffect(() => {
    if (current === 'auto-sync') {
      loadJobs();
      if (!playlists.spotify && !manuallyDisconnected.spotify) fetchAllPlaylists();
      if (!playlists.apple && !manuallyDisconnected.apple) fetchAllPlaylists();
    }
  }, [current]);

  const resetManualDisconnections = () => {
    setManuallyDisconnected({ spotify: false, apple: false, youtube: false });
    localStorage.removeItem('manuallyDisconnected');
  };

  const handleConnect = async (service: string) => {
    // Clear the manually disconnected flag when user wants to reconnect
    setManuallyDisconnected(prev => ({ ...prev, [service]: false }));
    
    // Remove from localStorage
    const stored = JSON.parse(localStorage.getItem('manuallyDisconnected') || '{}');
    delete stored[service];
    localStorage.setItem('manuallyDisconnected', JSON.stringify(stored));
    
    if (service === 'apple') {
      setShowAppleModal(true);
    } else if (service === 'spotify') {
      try {
        // Spotify uses GET to get the OAuth URL
        const res = await fetch(`${API_BASE_URL}/auth/${service}`, {
          method: 'GET'
        });
        const data = await res.json();
        if (data.url) {
          openExternal(data.url);
          setTimeout(() => {
            fetch(`${API_BASE_URL}/auth/spotify/status`)
              .then(res => res.json())
              .then(data => {
                setConnections(prev => ({ ...prev, spotify: data.connected }));
                if (data.connected && !manuallyDisconnected.spotify) fetchAllPlaylists();
              });
          }, 2000);
        }
      } catch (err) { 
        console.error('Spotify OAuth error:', err);
        alert('Failed to start Spotify OAuth flow. Is the backend running?'); 
      }
    } else if (service === 'youtube') {
      alert('YouTube Music integration is not yet implemented. Please use Spotify or Apple Music for now.');
    } else {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/${service}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.url) {
          openExternal(data.url);
          setTimeout(() => {
            if (service === 'youtube') {
              fetch(`${API_BASE_URL}/auth/youtube/status`)
                .then(res => res.json())
                .then(data => {
                  setConnections(prev => ({ ...prev, youtube: data.connected }));
                  if (data.connected && !manuallyDisconnected.youtube) fetchAllPlaylists();
                });
            }
          }, 2000);
        }
      } catch (err) { 
        console.error('OAuth error:', err);
        alert('Failed to start OAuth flow. Is the backend running?'); 
      }
    }
  };

  const handleAppleTokenSave = () => {
    if (!appleUserToken) {
      setAppleTokenError('Media-user-token is required.');
      return;
    }
    setAppleTokenError('');
    setConnections(prev => ({ ...prev, apple: true }));
    
    // Clear the manually disconnected flag when tokens are saved
    setManuallyDisconnected(prev => ({ ...prev, apple: false }));
    
    // Remove from localStorage
    const stored = JSON.parse(localStorage.getItem('manuallyDisconnected') || '{}');
    delete stored.apple;
    localStorage.setItem('manuallyDisconnected', JSON.stringify(stored));
    
    setShowAppleModal(false);
    
    // Fetch playlists now that Apple Music is reconnected
    fetchAllPlaylists();
  };



  const handleFixOrder = async () => {
    if (!sourceService || !sourcePlaylist || !destService || !destPlaylist) {
      setSyncLog(prev => [...prev, 'Error: Please select both source and destination playlists for order fixing']);
      return;
    }

    if (destService !== 'apple') {
      setSyncLog(prev => [...prev, 'Error: Order fixing is currently only supported for Apple Music playlists']);
      return;
    }

    setFixingOrder(true);
    setSyncLog([]);
    setSyncSummary('');
    
    try {
      setSyncLog(prev => [...prev, `Fixing playlist order based on ${sourceService} source...`]);
      
      const fixOrderData = {
        sourceService,
        sourcePlaylistId: sourcePlaylist,
        destService,
        destPlaylistId: destPlaylist
      };
      
      console.log('Fix order data:', fixOrderData);
      
              const res = await fetch(`${API_BASE_URL}/api/fix-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fixOrderData)
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        setSyncLog(prev => [...prev, data.message || 'Playlist order fixed successfully!']);
        setSyncSummary(`Order fixed: ${data.matchedTracks}/${data.totalSourceTracks} tracks matched`);
        playCompletionSound(); // Play completion sound
      } else if (data.error) {
        setSyncLog(prev => [...prev, `Fix order failed: ${data.error}`]);
        setSyncSummary('Fix order failed');
      } else {
        setSyncLog(prev => [...prev, 'Fix order completed']);
        setSyncSummary('Fix order completed');
      }
    } catch (err) {
      console.error('Fix order error:', err);
      setSyncLog(prev => [...prev, `Fix order error: ${err instanceof Error ? err.message : String(err)}`]);
      setSyncSummary('Fix order error occurred');
    }
    
    setFixingOrder(false);
  };

  const handleImportCSV = async () => {
    try {
      if (!importFile || !importText || !importService || !importFormat) {
        setImportResult({ success: false, message: 'Please select a file, source type, and target service' });
        return;
      }

      setImporting(true);
      setImportResult(null);
      
      // Extract playlist name from first line or use file name
      const playlistName = importText.split('\n')[0]?.replace(/[^a-zA-Z0-9\s]/g, '').trim() || importFile.name.replace(/\.[^/.]+$/, '');
      
              const res = await fetch(`${API_BASE_URL}/api/import-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          csvContent: importText,
          sourceType: importFormat,
          targetService: importService,
          playlistName
        })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        let message = `✅ Successfully imported ${data.foundTracks} out of ${data.totalTracks} tracks`;
        
        if (data.playlistId && data.playlistUrl) {
          message += `\n📝 Created playlist: ${playlistName}`;
          message += `\n🔗 Playlist URL: ${data.playlistUrl}`;
        }
        
        if (data.notFoundTracks > 0) {
          message += `\n⚠️ ${data.notFoundTracks} tracks not found on ${importService}`;
        }
        
        setImportResult({ success: true, message });
        setSyncLog(prev => [...prev, `📥 Imported ${data.foundTracks}/${data.totalTracks} tracks from ${importFile.name}`]);
      } else {
        setImportResult({ success: false, message: `Import failed: ${data.error}` });
        setSyncLog(prev => [...prev, `❌ Import failed: ${data.error}`]);
      }
    } catch (err) {
      console.error('Import error:', err);
      setImportResult({ success: false, message: `Import error: ${err instanceof Error ? err.message : String(err)}` });
      setSyncLog(prev => [...prev, `❌ Import error: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setImporting(false);
    }
  };

  const handleExportCSV = async (service: string, playlistId: string, playlistName: string) => {
    try {
      setSyncLog(prev => [...prev, `Exporting ${service} playlist "${playlistName}" as CSV (clean Exportify format)...`]);
      
      // Default to clean export format (no optional fields)
      const includeArtists = false;
      const includeAudioFeatures = false;
      const includeAlbumData = false;
      
              const res = await fetch(`${API_BASE_URL}/api/export-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          service, 
          playlistId, 
          includeArtists, 
          includeAudioFeatures, 
          includeAlbumData 
        })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        // Create and download the CSV file
        const blob = new Blob([data.csvData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        setSyncLog(prev => [...prev, `✅ Exported ${data.trackCount} tracks to ${data.filename} (clean Exportify format)`]);
      } else {
        setSyncLog(prev => [...prev, `Export failed: ${data.error}`]);
      }
    } catch (err) {
      console.error('Export error:', err);
      setSyncLog(prev => [...prev, `Export error: ${err instanceof Error ? err.message : String(err)}`]);
    }
  };

  const handleDisconnect = async (service: string) => {
    try {
      // Use the correct signout endpoint
      await fetch(`${API_BASE_URL}/auth/${service}/signout`, { method: 'POST' });
      setConnections(prev => ({ ...prev, [service]: false }));
      setManuallyDisconnected(prev => ({ ...prev, [service]: true }));
      setPlaylists(prev => ({...prev, [service]: []}));
      if (service === 'apple') {
        setAppleUserToken('');
      }
      
      // Store the manual disconnect preference in localStorage
      const stored = JSON.parse(localStorage.getItem('manuallyDisconnected') || '{}');
      stored[service] = true;
      localStorage.setItem('manuallyDisconnected', JSON.stringify(stored));
      
      console.log(`✅ Successfully disconnected from ${service}`);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  const fetchLogFiles = async () => {
    try {
      console.log('Fetching log files from API...');
      const res = await fetch(`${API_BASE_URL}/api/logs`);
      console.log('API response status:', res.status);
      const data = await res.json();
      console.log('API response data:', data);
      if (res.ok) {
        const formattedLogs = data.logFiles.map((log: any) => ({
          name: log.name,
          created: new Date(log.created).toLocaleString(),
          modified: new Date(log.modified).toLocaleString(),
          size: log.size,
          sizeFormatted: log.sizeFormatted || formatFileSize(log.size)
        }));
        console.log('Formatted logs:', formattedLogs);
        setLogFiles(formattedLogs);
        console.log('Log files state updated');
      }
    } catch (err) {
      console.error('Failed to fetch log files:', err);
    }
  };

  // Helper function to format file sizes
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const fetchLogContent = async (filename: string) => {
    try {
              const res = await fetch(`${API_BASE_URL}/api/logs/${filename}`);
      if (res.ok) {
        const content = await res.text();
        setSelectedLogContent(content);
      }
    } catch (err) {
      console.error('Failed to fetch log content:', err);
    }
  };

  const handleShowLogs = async () => {
    console.log('Check Logs button clicked!');
    try {
      setShowLogsModal(true);
      console.log('Modal state set to true');
      await fetchLogFiles();
      console.log('fetchLogFiles completed');
    } catch (error) {
      console.error('Error in handleShowLogs:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Log management functions
  const handleCleanupLogs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/logs/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 })
      });
      
      if (res.ok) {
        const data = await res.json();
        alert(`Log cleanup completed: ${data.cleaned} files removed`);
        await fetchLogFiles(); // Refresh the log list
      } else {
        const error = await res.json();
        alert(`Failed to cleanup logs: ${error.error}`);
      }
    } catch (err) {
      console.error('Failed to cleanup logs:', err);
      alert('Failed to cleanup logs. Please try again.');
    }
  };

  const handleRotateLogs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/logs/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (res.ok) {
        const data = await res.json();
        alert(`Log rotated successfully: ${data.newFile}`);
        await fetchLogFiles(); // Refresh the log list
      } else {
        const error = await res.json();
        alert(`Failed to rotate log: ${error.error}`);
      }
    } catch (err) {
      console.error('Failed to rotate log:', err);
      alert('Failed to rotate log. Please try again.');
    }
  };

  // Auto-add missing tracks functionality
  const handleAutoAddMissing = async () => {
    if (!sourceService || !sourcePlaylist || !destService || !destPlaylist) {
      setSyncLog(prev => [...prev, '❌ Error: Please select both source and destination playlists']);
      return;
    }

    try {
    setSyncing(true);
    setSyncLog([]);
    setSyncSummary('');
    setFinalSyncStats(undefined);
    setSyncProgress(null);
      setFailedTracks([]);
      
      // Get playlist names for better UX
      const sourcePlaylistName = playlists[sourceService]?.find(p => p.id === sourcePlaylist)?.name || 'Unknown';
      const destPlaylistName = playlists[destService]?.find(p => p.id === destPlaylist)?.name || 'Unknown';
      
      setSyncLog(prev => [...prev, `🔍 Starting auto-add missing tracks...`]);
      setSyncLog(prev => [...prev, `📋 Source: "${sourcePlaylistName}" (${sourceService})`]);
      setSyncLog(prev => [...prev, `📋 Destination: "${destPlaylistName}" (${destService})`]);
      setSyncLog(prev => [...prev, '']);
      
      // Initialize progress tracking
      const syncStartTime = Date.now();
      setSyncProgress({
        current: 0,
        total: 0, // Will be updated with actual count from backend
        currentStep: 'Analyzing playlists...',
        eta: 'Calculating...',
        startTime: syncStartTime,
        status: 'starting'
      });
      
      const response = await fetch(`${API_BASE_URL}/api/auto-add-missing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePlaylistId: sourcePlaylist,
          destPlaylistId: destPlaylist,
          sourceService,
          destService
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        // Process auto-add results
        const { missing, added, notFound, message, csvReportPath } = data;
        
        // Add detailed log entries
        setSyncLog(prev => [...prev, '📊 AUTO-ADD RESULTS:']);
        setSyncLog(prev => [...prev, `✅ Successfully added: ${added} tracks`]);
        setSyncLog(prev => [...prev, `🔍 Missing tracks found: ${missing} tracks`]);
        setSyncLog(prev => [...prev, `❌ Not found: ${notFound} tracks`]);
        
        // Calculate success rate
        const successRate = missing > 0 ? Math.round((added / missing) * 100) : 100;
        setSyncLog(prev => [...prev, `📈 Success rate: ${successRate}%`]);
        setSyncLog(prev => [...prev, '']);
        
        // Update summary
        const duration = Math.round((Date.now() - syncStartTime) / 1000);
        setSyncSummary(`Auto-add completed: ${added}/${missing} tracks added (${successRate}% success rate, ${duration}s)`);
        
        // Update progress to completed
        setSyncProgress({
          current: added,
          total: missing,
          currentStep: 'Auto-add completed successfully!',
          eta: '0s',
          startTime: syncStartTime,
          status: 'completed'
        });
        
        // Show success notification
        if (added > 0) {
          setSyncLog(prev => [...prev, '🎉 Auto-add completed successfully!']);
          
          // Refresh playlists to show updated content
          setTimeout(() => {
            fetchAllPlaylists();
          }, 2000);
        } else {
          setSyncLog(prev => [...prev, 'ℹ️ No tracks needed to be added - all tracks are already present!']);
        }
        
        // Play completion sound
        playCompletionSound();
        
      } else {
        // Handle auto-add failure
        const errorMessage = data.error || 'Unknown error occurred';
        setSyncLog(prev => [...prev, `❌ Auto-add failed: ${errorMessage}`]);
        setSyncSummary('Auto-add failed');
        
        // Update progress to show error
        setSyncProgress({
          current: 0,
          total: 0, // Will be updated with actual count from backend
          currentStep: `Auto-add failed: ${errorMessage}`,
          eta: '0s',
          startTime: syncStartTime,
          status: 'error'
        });
      }
      
    } catch (err) {
      console.error('Auto-add error:', err);
      setSyncLog(prev => [...prev, `❌ Auto-add error: ${err instanceof Error ? err.message : String(err)}`]);
      setSyncSummary('Auto-add failed');
    } finally {
      setSyncing(false);
    }
  };



  const handleSync = async () => {
    if (!sourceService || !destService || !destPlaylist) {
      setSyncLog(prev => [...prev, '❌ Error: Please select both source and destination services']);
      return;
    }

    // Validate source based on service type
    if (sourcePlaylist === '__spotify_url__') {
      if (!spotifyPlaylistUrl) {
        setSyncLog(prev => [...prev, '❌ Error: Please enter a Spotify playlist URL']);
        return;
      }
      if (!isValidSpotifyPlaylistUrl(spotifyPlaylistUrl)) {
        setSyncLog(prev => [...prev, '❌ Error: Please enter a valid Spotify playlist URL']);
        return;
      }
    } else if (!sourcePlaylist) {
      setSyncLog(prev => [...prev, '❌ Error: Please select a source playlist']);
      return;
    }

    try {
    setSyncing(true);
    setSyncLog([]);
    setSyncSummary('');
    setFinalSyncStats(undefined);
    setSyncProgress(null);
      setFailedTracks([]);
      
      // Get playlist names for better UX
      let sourcePlaylistName = 'Unknown';
      if (sourcePlaylist === '__spotify_url__') {
        // Extract playlist name from URL or use URL as name
        try {
          const url = new URL(spotifyPlaylistUrl);
          const playlistId = url.pathname.split('/').pop();
          sourcePlaylistName = `Spotify Playlist (${playlistId})`;
        } catch (urlError) {
          const errorMessage = urlError instanceof Error ? urlError.message : String(urlError);
          setSyncLog(prev => [...prev, `❌ Invalid Spotify playlist URL: ${errorMessage}`]);
          return;
        }
      } else {
        sourcePlaylistName = playlists[sourceService]?.find(p => p.id === sourcePlaylist)?.name || 'Unknown';
      }
      
      const destPlaylistName = playlists[destService]?.find(p => p.id === destPlaylist)?.name || 'Unknown';
      
      // Enhanced logging for sync start
      const syncStartMessage = `🚀 Starting sync operation...`;
      const syncDetailsMessage = `📋 Source: "${sourcePlaylistName}" (${sourceService}) → Destination: "${destPlaylistName}" (${destService})`;
      
      setSyncLog(prev => [...prev, syncStartMessage, syncDetailsMessage, '']);
      
      // Log to backend for comprehensive tracking
      try {
        await fetch(`${API_BASE_URL}/api/log-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'sync_start',
            sourceService,
            sourcePlaylist: sourcePlaylistName,
            destService,
            destPlaylist: destPlaylistName,
            timestamp: new Date().toISOString()
          })
        });
      } catch (logError) {
        console.warn('Failed to log sync operation:', logError);
      }
      
      // Initialize progress tracking
      const syncStartTime = Date.now();
      setSyncProgress({
        current: 0,
        total: 0, // Will be updated with actual count from backend
        currentStep: 'Initializing sync...',
        eta: 'Calculating...',
        startTime: syncStartTime,
        status: 'starting'
      });
      
      // Validate that we have a supported sync direction
      const supportedDirections = [
        { source: 'spotify', dest: 'apple' },
        { source: 'apple', dest: 'spotify' }
      ];
      
      console.log('🔍 Sync direction validation:', {
        sourceService,
        destService,
        supportedDirections,
        isSupported: supportedDirections.some(dir => dir.source === sourceService && dir.dest === destService)
      });
      
      const isSupportedDirection = supportedDirections.some(dir => 
        dir.source === sourceService && dir.dest === destService
      );
      
      if (!isSupportedDirection) {
        console.error('❌ Unsupported sync direction:', { sourceService, destService });
        setSyncLog(prev => [...prev, `❌ Unsupported sync direction: ${sourceService} → ${destService}. Supported directions: Spotify → Apple Music, Apple Music → Spotify`]);
        return;
      }

      // Prepare the request body for enhanced sync endpoint
      let sourcePlaylistId = sourcePlaylist;
      
      if (sourcePlaylist === '__spotify_url__') {
        // Extract playlist ID from URL
        try {
          const url = new URL(spotifyPlaylistUrl);
          const playlistId = url.pathname.split('/').pop();
          if (!playlistId || playlistId === 'playlist') {
            throw new Error('Invalid Spotify playlist URL format');
          }
          sourcePlaylistId = playlistId;
        } catch (urlError) {
          const errorMessage = urlError instanceof Error ? urlError.message : String(urlError);
          setSyncLog(prev => [...prev, `❌ Invalid Spotify playlist URL: ${errorMessage}`]);
          return;
        }
      }

      console.log('🚀 Sending sync request:', {
        sourceService,
        destinationService: destService,
        sourcePlaylistId,
        destinationPlaylistId: destPlaylist,
        options: { storefront: 'us', forceRefresh: true }
      });
      
      const response = await fetch(`${API_BASE_URL}/sync/enhanced`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceService: sourceService,
          destinationService: destService,
          sourcePlaylistId: sourcePlaylistId,
          destinationPlaylistId: destPlaylist,
          options: {
            storefront: 'us',
            forceRefresh: true
          }
        })
      });
      
      console.log('📡 Sync request response:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Sync request failed:', response.status, errorText);
        setSyncLog(prev => [...prev, `❌ Sync request failed: ${response.status} ${errorText}`]);
        return;
      }
      
      const data = await response.json();
      console.log('✅ Sync request successful:', data);
      
      if (response.ok) {
        // Job accepted; progress will stream via WebSocket
        setSyncLog(prev => [...prev, '📡 Sync job accepted. Tracking progress...']);
      } else {
        // Handle sync failure
        const errorMessage = data.error || response.statusText || 'Unknown error occurred';
        setSyncLog(prev => [...prev, `❌ Sync failed: ${errorMessage}`]);
        setSyncSummary('Sync failed');
        
        // Update progress to show error with actual numbers
        setSyncProgress({
          current: 0,
          total: 0,
          currentStep: `Sync failed: ${errorMessage}`,
          eta: '0s',
          startTime: syncStartTime,
          status: 'error'
        });
        
        // Log detailed error info
        if (data.details) {
          setSyncLog(prev => [...prev, `📋 Error details: ${JSON.stringify(data.details, null, 2)}`]);
        }
      }
      
    } catch (error) {
      console.error('❌ Sync error:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      setSyncLog(prev => [...prev, `❌ Sync error: ${errorMessage}`]);
      setSyncSummary('Sync error occurred');
      
      // Update progress to show error
      setSyncProgress(prev => ({
        ...(prev || { current: 0, total: 100, startTime: Date.now() }),
        currentStep: `Error: ${errorMessage}`,
        eta: '0s',
        status: 'error'
      }));
      
      // Check for network errors
      if (errorMessage.includes('fetch')) {
        setSyncLog(prev => [...prev, '💡 Network error detected. Please check your connection and try again.']);
      }
      
    } finally {
      setSyncing(false);
      
      // Clear progress after a delay
      setTimeout(() => {
        if (syncProgress?.status === 'completed' || syncProgress?.status === 'error') {
          setSyncProgress(null);
        }
      }, 5000);
    }
  };





  const getVisiblePlaylists = () => {
    const visible: { [key: string]: { id: string; name: string; artwork?: string | null }[] } = {};
    if (connections.spotify && playlists.spotify) visible.spotify = playlists.spotify;
    if (connections.apple && playlists.apple) visible.apple = playlists.apple;
    if (connections.youtube && playlists.youtube) visible.youtube = playlists.youtube;
    return visible;
  };

  const renderContent = () => {
    // Add universal live sync progress to all sections
    const liveSyncProgress = <UniversalLiveSyncProgress 
      syncProgress={syncProgress} 
      syncSummary={syncSummary} 
      elapsedSec={elapsedSec} 
    />;
    
    // Completion Success Modal
    const completionModal = syncProgress?.status === 'completed' && finalSyncStats && (
      <>
        {/* Backdrop */}
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            zIndex: 9998,
            backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.3s ease-out'
          }} 
          onClick={() => {
            setSyncProgress(null);
            setFinalSyncStats(undefined);
            setSyncSummary('');
          }}
        />
        
        {/* Success Modal */}
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          background: 'linear-gradient(135deg, #1DB954 0%, #1ed760 100%)',
          color: 'white',
          padding: '48px 64px',
          borderRadius: '24px',
          boxShadow: '0 20px 60px rgba(29, 185, 84, 0.6)',
          textAlign: 'center',
          minWidth: '450px',
          animation: 'slideInUp 0.5s ease-out'
        }}>
          <div style={{ fontSize: '72px', marginBottom: '24px', animation: 'bounce 1s ease-in-out' }}>🎉</div>
          <h2 style={{ 
            margin: 0, 
            marginBottom: '20px', 
            fontSize: '36px',
            fontWeight: '800',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            Sync Complete!
          </h2>
          <p style={{ 
            fontSize: '32px', 
            fontWeight: 'bold', 
            margin: '16px 0',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            {finalSyncStats.found} songs transferred
          </p>
          <p style={{ 
            fontSize: '18px', 
            opacity: 0.95, 
            marginBottom: '32px',
            lineHeight: '1.6'
          }}>
            {finalSyncStats.notFound > 0 && `${finalSyncStats.notFound} unavailable • `}
            {Math.round((finalSyncStats.found / (finalSyncStats.found + finalSyncStats.notFound)) * 100)}% success rate
          </p>
          <button 
            onClick={() => {
              setSyncProgress(null);
              setFinalSyncStats(undefined);
              setSyncSummary('');
            }}
            style={{
              padding: '16px 48px',
              background: 'white',
              color: '#1DB954',
              border: 'none',
              borderRadius: '14px',
              fontSize: '18px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }}
          >
            Awesome! 👍
          </button>
        </div>
      </>
    );
    
    switch (current) {
      case 'dashboard':
        return (
          <div className="content-padding">
            {liveSyncProgress}
            {completionModal}
            <div className="page-header">
              <div>
                <h2>UNIFIED PLAYLIST VIEW</h2>
                <p className="secondary-text">All your playlists from connected services in one place.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div 
                  className="segmented-control" 
                  role="tablist" 
                  aria-label="Filter playlists"
                  style={{
                    '--sliding-position': slidingPosition,
                    '--segment-width': `${segmentWidth}px`,
                    '--segment-offset': `${segmentOffset}px`
                  } as React.CSSProperties}
                >
                  <button
                    className={`segment ${playlistFilter === 'none' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('none')}
                    role="tab"
                    aria-selected={playlistFilter === 'none'}
                  >None</button>
                  <button
                    className={`segment ${playlistFilter === 'all' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('all')}
                    role="tab"
                    aria-selected={playlistFilter === 'all'}
                  >All</button>
                  <button
                    className={`segment ${playlistFilter === 'spotify' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('spotify')}
                    role="tab"
                    aria-selected={playlistFilter === 'spotify'}
                  >Spotify</button>
                  <button
                    className={`segment ${playlistFilter === 'apple' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('apple')}
                    role="tab"
                    aria-selected={playlistFilter === 'apple'}
                  >Apple</button>
                </div>
                <button className="button secondary" onClick={fetchAllPlaylists} disabled={refreshing}>
                  {refreshing ? 'Refreshing...' : 'Refresh Playlists'}
                </button>
              </div>
            </div>
            {loadingPlaylists ? (
              <div className="secondary-text">Loading playlists...</div>
            ) : (
              <>
                {playlistFilter !== 'none' && (
                  <div className="playlist-grid">
                    {services
                      .filter(s => (playlistFilter === 'all' ? true : s.key === playlistFilter))
                      .flatMap(service =>
                        (getVisiblePlaylists()[service.key] || []).map(pl => (
                          <div key={pl.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 24, marginBottom: 32 }}>
                            <div className="playlist-cover">
                              {pl.artwork ? (
                                <img
                                  src={pl.artwork}
                                  alt={pl.name}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', display: 'block' }}
                                />
                              ) : (
                                <div className="playlist-cover-fallback">
                                  <FaMusic />
                                </div>
                              )}
                            </div>
                            <span className="playlist-title" title={pl.name}>{pl.name}</span>
                            <span className="secondary-text" style={{ fontSize: 13, marginTop: 2 }}>{service.label}</span>
                          </div>
                        ))
                      )}
                  </div>
                )}
              </>
            )}
            <div className="sync-engine-grid" style={{ alignItems: 'stretch' }}>
              <div className="sync-column" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <h3>SOURCE</h3>
                <CustomDropdown
                  options={services.map(s => ({ id: s.key, name: s.label }))}
                  value={sourceService}
                  onSelect={(value) => {
                    setSourceService(value);
                    setSourcePlaylist('');
                    setSpotifyPlaylistUrl('');
                  }}
                  placeholder="Select source service"
                  disabled={false}
                />
                <div style={{marginTop: 12, flex: 1, display: 'flex', flexDirection: 'column'}}>
                  {sourceService === 'spotify' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <CustomDropdown
                        options={[
                          { id: '', name: 'None' },
                          { id: '__spotify_url__', name: 'Enter Spotify URL' },
                          ...(playlists[sourceService] || [])
                        ]}
                        value={sourcePlaylist === '__spotify_url__' ? '__spotify_url__' : sourcePlaylist}
                        onSelect={(value) => {
                          if (value === '__spotify_url__') {
                            setSourcePlaylist('__spotify_url__');
                          } else {
                            setSourcePlaylist(value);
                            setSpotifyPlaylistUrl('');
                          }
                        }}
                        placeholder="Select source playlist"
                      />
                      {sourcePlaylist === '__spotify_url__' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                          <input
                            type="text"
                            value={spotifyPlaylistUrl}
                            onChange={e => setSpotifyPlaylistUrl(e.target.value)}
                            placeholder="Paste Spotify playlist URL (e.g., https://open.spotify.com/playlist/...)"
                            style={{
                              padding: '12px',
                              borderRadius: '8px',
                              border: spotifyPlaylistUrl ? (isValidSpotifyPlaylistUrl(spotifyPlaylistUrl) ? '2px solid #1DB954' : '2px solid #ff6b6b') : '1px solid #ddd',
                              fontSize: '14px',
                              backgroundColor: '#fff',
                              color: '#333',
                              transition: 'border-color 0.3s ease'
                            }}
                          />
                          <div style={{ 
                            fontSize: '12px', 
                            color: spotifyPlaylistUrl ? (isValidSpotifyPlaylistUrl(spotifyPlaylistUrl) ? '#1DB954' : '#ff6b6b') : '#666', 
                            fontStyle: 'italic',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            {spotifyPlaylistUrl ? (
                              isValidSpotifyPlaylistUrl(spotifyPlaylistUrl) ? (
                                <>
                                  ✅ Valid Spotify playlist URL
                                  {(() => {
                                    try {
                                      const url = new URL(spotifyPlaylistUrl);
                                      const playlistId = url.pathname.split('/').pop();
                                      return playlistId ? ` (ID: ${playlistId})` : '';
                                    } catch {
                                      return '';
                                    }
                                  })()}
                                </>
                              ) : (
                                <>❌ Invalid Spotify playlist URL format</>
                              )
                            ) : (
                              <>Enter a Spotify playlist URL to sync directly</>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>
                            Example: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <CustomDropdown
                      options={sourceService ? [{ id: '', name: 'None' }, ...(playlists[sourceService] || [])] : []}
                      value={sourcePlaylist}
                      onSelect={setSourcePlaylist}
                      placeholder="Select source playlist"
                    />
                  )}
                </div>
              </div>
              <div className="sync-column" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <h3>DESTINATION</h3>
                <CustomDropdown
                  options={services.filter(s => s.key !== sourceService).map(s => ({ id: s.key, name: s.label }))}
                  value={destService}
                  onSelect={(value) => {
                    setDestService(value);
                    setDestPlaylist('');
                  }}
                  placeholder="Select destination service"
                  disabled={false}
                />
                <div style={{marginTop: 12, flex: 1, display: 'flex', flexDirection: 'column'}}>
                  <CustomDropdown
                    options={destService 
                      ? [
                          ...(showCustomNameInput && customPlaylistName.trim() ? [{ id: customPlaylistName.trim(), name: customPlaylistName.trim() }] : []),
                          { id: '__create__', name: creatingDest ? 'Creating…' : 'Create new playlist' }, 
                          { id: '__use_source__', name: 'Use source playlist name' }, 
                          ...(playlists[destService] || [])
                        ]
                      : []}
                    value={showCustomNameInput ? (customPlaylistName.trim() || '__create__') : (destPlaylist || (creatingDest ? '__create__' : destPlaylist))}
                    onSelect={(value) => {
                      if (value === '__create__') {
                        setShowCustomNameInput(true);
                        return;
                      }
                      if (value === '__use_source__') {
                        handleCreateDestinationPlaylist();
                        return;
                      }
                      if (value === customPlaylistName.trim() && showCustomNameInput) {
                        handleCreateDestinationPlaylist(customPlaylistName);
                        return;
                      }
                      setDestPlaylist(value);
                      setShowCustomNameInput(false);
                    }}
                    placeholder="Select existing playlist"
                  />
                  
                  {showCustomNameInput && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Enter playlist name..."
                        value={customPlaylistName}
                        onChange={(e) => setCustomPlaylistName(e.target.value)}
                        style={{
                          padding: '8px 12px',
                          border: '1px solid #444',
                          borderRadius: '6px',
                          backgroundColor: '#2a2a2a',
                          color: '#fff',
                          fontSize: '14px',
                          outline: 'none'
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customPlaylistName.trim()) {
                            handleCreateDestinationPlaylist(customPlaylistName);
                          } else if (e.key === 'Escape') {
                            setShowCustomNameInput(false);
                            setCustomPlaylistName('');
                          }
                        }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => handleCreateDestinationPlaylist(customPlaylistName)}
                          disabled={!customPlaylistName.trim() || creatingDest}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: customPlaylistName.trim() && !creatingDest ? '#007bff' : '#6c757d',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: customPlaylistName.trim() && !creatingDest ? 'pointer' : 'not-allowed',
                            opacity: customPlaylistName.trim() && !creatingDest ? 1 : 0.6
                          }}
                        >
                          {creatingDest ? 'Creating...' : 'Create'}
                        </button>
                        <button
                          onClick={() => {
                            setShowCustomNameInput(false);
                            setCustomPlaylistName('');
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#6c757d',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
              <div className="sync-column" style={{ flex: 0.5, alignSelf: 'flex-end' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button 
                    className="button"
                    disabled={syncing || !sourceService || 
                      (sourcePlaylist === '__spotify_url__' ? (!spotifyPlaylistUrl || !isValidSpotifyPlaylistUrl(spotifyPlaylistUrl)) : !sourcePlaylist) || 
                      !destService || !destPlaylist} 
                    onClick={handleSync}
                    style={{ 
                      background: syncing ? '#6C757D' : undefined,
                      fontSize: '16px', 
                      padding: '12px 24px',
                      fontWeight: 'bold',
                      opacity: (syncing || !sourceService || 
                        (sourcePlaylist === '__spotify_url__' ? (!spotifyPlaylistUrl || !isValidSpotifyPlaylistUrl(spotifyPlaylistUrl)) : !sourcePlaylist) || 
                        !destService || !destPlaylist) ? 0.6 : 1,
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: syncing ? 'none' : undefined,
                      transition: 'all 0.3s ease'
                    }}
                    title={
                      !sourceService ? 'Please select a source service' :
                      (sourcePlaylist === '__spotify_url__' && !spotifyPlaylistUrl) ? 'Please enter a Spotify playlist URL' :
                      (sourcePlaylist === '__spotify_url__' && !isValidSpotifyPlaylistUrl(spotifyPlaylistUrl)) ? 'Please enter a valid Spotify playlist URL' :
                      (!sourceService || !sourcePlaylist) ? 'Please select a source playlist' :
                      !destService || !destPlaylist ? 'Please select a destination playlist' :
                      syncing ? 'Sync in progress...' :
                      'Start synchronizing your playlists'
                    }
                  >
                    {syncing ? (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <span className="sync-spinner">🔄</span>
                          Syncing...
                          {syncProgress && (
                            <span style={{ fontSize: '14px', opacity: 0.8 }}>
                              ({Math.round((syncProgress.current / syncProgress.total) * 100)}%)
                            </span>
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          🚀 Start Sync
                        </span>
                      </>
                    )}
                  </button>
                  <button 
                    className="button"
                    disabled={fixingOrder || syncing || !sourceService || !sourcePlaylist || !destService || !destPlaylist || destService !== 'apple'} 
                    onClick={handleFixOrder}
                    style={{ 
                      background: fixingOrder ? '#6C757D' : undefined,
                      fontSize: '14px', 
                      padding: '8px 16px',
                      opacity: (fixingOrder || syncing || !sourceService || !sourcePlaylist || !destService || !destPlaylist || destService !== 'apple') ? 0.6 : 1
                    }}
                  >
                    {fixingOrder ? '🔄 Fixing...' : '🔧 Fix Order'}
                  </button>
                  <button className="button secondary" onClick={handleShowLogs} style={{ fontSize: '14px', padding: '8px 16px' }}>
                    📄 Check Logs
                  </button>
                  <button 
                    className="button"
                    onClick={handleAutoAddMissing}
                    disabled={!sourceService || !sourcePlaylist || !destService || !destPlaylist || syncing}
                    style={{ 
                      fontSize: '14px', 
                      padding: '8px 16px',
                      opacity: ((!sourceCSVFile || !destCSVFile) && (!sourceService || !sourcePlaylist || !destService || !destPlaylist) || syncing) ? 0.6 : 1
                    }}
                  >
                    📊 Auto-Add Missing
                  </button>





                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {/* Export Buttons */}
                  <button 
                    className="button secondary" 
                    disabled={!sourceService || !sourcePlaylist}
                    onClick={() => {
                      const playlist = playlists[sourceService]?.find(p => p.id === sourcePlaylist);
                      if (playlist) handleExportCSV(sourceService, sourcePlaylist, playlist.name);
                    }}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    📊 Export Source CSV
                  </button>
                  <button 
                    className="button secondary" 
                    disabled={!destService || !destPlaylist}
                    onClick={() => {
                      const playlist = playlists[destService]?.find(p => p.id === destPlaylist);
                      if (playlist) handleExportCSV(destService, destPlaylist, playlist.name);
                    }}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    📊 Export Dest CSV
                  </button>
                </div>
                
                {/* Manual CSV Import removed on request */}
                
                {/* Enhanced Sync Progress Bar */}
                {syncProgress && (
                  <div style={{ 
                    marginTop: '15px', 
                    padding: '16px', 
                    backgroundColor: '#2a2a2a', 
                    borderRadius: '8px', 
                    border: `1px solid ${
                      syncProgress.status === 'error' ? '#e94560' : 
                      syncProgress.status === 'completed' ? '#1DB954' : 
                      '#444'
                    }`,
                    boxShadow: syncProgress.status === 'error' ? '0 0 10px rgba(233, 69, 96, 0.3)' :
                               syncProgress.status === 'completed' ? '0 0 10px rgba(29, 185, 84, 0.3)' :
                               'none'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {syncProgress.status === 'starting' && <span>🚀</span>}
                        {syncProgress.status === 'searching' && <span>🔍</span>}
                        {syncProgress.status === 'adding' && <span>➕</span>}
                        {syncProgress.status === 'completed' && <span>✅</span>}
                        {syncProgress.status === 'error' && <span>❌</span>}
                        <span style={{ 
                          color: syncProgress.status === 'error' ? '#e94560' : '#fff', 
                          fontSize: '14px', 
                          fontWeight: '500' 
                        }}>
                          {syncProgress.currentStep}
                        </span>
                      </div>
                      <span style={{ color: '#aaa', fontSize: '12px' }}>
                        {syncProgress.status === 'completed' ? 'Complete!' : 
                         syncProgress.status === 'error' ? 'Failed' :
                         `ETA: ${syncProgress.eta}`}
                      </span>
                    </div>
                    
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#444', borderRadius: '4px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          width: `${syncProgress.status === 'completed' ? 100 : (syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0)}%`, 
                          height: '100%', 
                          background: syncProgress.status === 'error' ? 'linear-gradient(90deg, #e94560, #ff6b6b)' :
                                     syncProgress.status === 'completed' ? 'linear-gradient(90deg, #1DB954, #1ed760)' :
                                     'linear-gradient(90deg, #fa233b, #d91f32)',
                          borderRadius: '4px',
                          transition: 'width 0.3s ease'
                        }} 
                      />
                    </div>
                    
                    {syncProgress.total > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                        <span style={{ color: '#aaa', fontSize: '12px' }}>
                          {syncProgress.status === 'completed' ? 
                            `${finalSyncStats?.found || syncProgress.total} ${syncProgress.currentStep.includes('track') ? 'songs' : 'items'} added successfully` :
                            `${syncProgress.current} / ${syncProgress.total} ${syncProgress.currentStep.includes('track') ? 'songs' : 'items'} processed`
                          }
                        </span>
                        <span style={{ 
                          color: syncProgress.status === 'error' ? '#e94560' : 
                                syncProgress.status === 'completed' ? '#1DB954' : 
                                '#fa233b', 
                          fontSize: '12px',
                          fontWeight: '600' 
                        }}>
                          {syncProgress.status === 'completed' ? 
                            (finalSyncStats?.found && syncProgress.total ? 
                              Math.round((finalSyncStats.found / syncProgress.total) * 100) + '%' : 
                              '100%'
                            ) : 
                            Math.round(syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0) + '%'
                          }
                        </span>
                      </div>
                    )}
                    
                    {/* Additional info for specific statuses */}
                    {syncProgress.status === 'searching' && syncProgress.trackInfo && (
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #444' }}>
                        <span style={{ color: '#aaa', fontSize: '11px' }}>
                          Currently searching: "{syncProgress.trackInfo.name}" by "{syncProgress.trackInfo.artist}"
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Search Progress Bar */}
                {searchProgress && (
                  <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#2a2a2a', borderRadius: '8px', border: '1px solid #007AFF' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>🔍 Opening Apple Music Searches</span>
                      <span style={{ color: '#aaa', fontSize: '12px' }}>{searchProgress.current}/{searchProgress.total}</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: '#444', borderRadius: '3px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          width: `${searchProgress.total > 0 ? (searchProgress.current / searchProgress.total) * 100 : 0}%`, 
                          height: '100%', 
                          background: 'linear-gradient(90deg, #007AFF, #0056D6)',
                          borderRadius: '3px',
                          transition: 'width 0.3s ease'
                        }} 
                      />
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <span style={{ color: '#007AFF', fontSize: '12px', fontWeight: '500' }}>Currently opening:</span>
                      <div style={{ color: '#fff', fontSize: '13px', marginTop: '4px', wordBreak: 'break-word' }}>
                        {searchProgress.currentTrack || 'Preparing...'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <span style={{ color: '#aaa', fontSize: '11px' }}>
                        Progress: {Math.round((searchProgress.current / searchProgress.total) * 100)}%
                      </span>
                      <span style={{ color: '#aaa', fontSize: '11px' }}>
                        {searchProgress.total - searchProgress.current} remaining
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Sync Log View Toggle */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px 16px', 
              background: '#2a2a2a', 
              borderRadius: '8px', 
              border: '1px solid #444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
            
            {/* Large Log Warning */}
            {syncLog.length > 1000 && (
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px 16px', 
                background: 'rgba(255, 149, 0, 0.1)', 
                border: '1px solid rgba(255, 149, 0, 0.3)', 
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#ff9500', fontSize: '16px' }}>⚠️</span>
                  <div>
                    <div style={{ color: '#ff9500', fontWeight: '600', marginBottom: '2px' }}>Large Log Detected</div>
                    <div style={{ color: '#aaa', fontSize: '12px' }}>
                      Your sync log contains {syncLog.length.toLocaleString()} entries. Consider clearing it for better performance.
                    </div>
                  </div>
                </div>
                <button 
                  className="button secondary"
                  onClick={() => setSyncLog([])}
                  style={{ fontSize: '12px', padding: '6px 12px', background: '#ff9500', borderColor: '#ff9500' }}
                >
                  🗑️ Clear Now
                </button>
              </div>
            )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>📋 Sync Log Display:</span>
                <span style={{ color: '#aaa', fontSize: '12px' }}>
                  {useProfessionalLog ? 'Professional View' : 'Simple View'} • {syncLog.length.toLocaleString()} entries
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="button secondary"
                  onClick={() => setSyncLog([])}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                  disabled={syncLog.length === 0}
                >
                  🗑️ Clear Log
                </button>
                <button 
                  className="button secondary"
                  onClick={() => setUseProfessionalLog(!useProfessionalLog)}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  {useProfessionalLog ? '📝 Switch to Simple' : '📊 Switch to Professional'}
                </button>
              </div>
            </div>
            
            {useProfessionalLog ? (
              <ProfessionalSyncLog 
                key={finalSyncStats ? `stats-${finalSyncStats.found}-${finalSyncStats.notFound}` : 'no-stats'} 
                syncLog={syncLog} 
                finalStats={finalSyncStats} 
              />
            ) : (
              <div className="sync-log" style={{ 
                background: '#1a1a1a', 
                border: '1px solid #333', 
                borderRadius: '8px', 
                padding: '16px',
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                {syncLog.length === 0 ? (
                  <span className="sync-log-placeholder" style={{ color: '#666', fontStyle: 'italic' }}>
                    Sync log will appear here...
                  </span>
                ) : (
                  syncLog.map((line, i) => (
                    <div key={i} style={{ 
                      padding: '4px 0', 
                      borderBottom: '1px solid #2a2a2a',
                      fontSize: '13px',
                      fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace'
                    }}>
                      {line}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      case 'accounts':
        return (
          <div className="content-padding">
            {liveSyncProgress}
            {completionModal}
            <h2>ACCOUNTS</h2>
            <p className="secondary-text">Connect your music services to begin.</p>
            
            {/* Global reset button for manual disconnections */}
            {Object.values(manuallyDisconnected).some(disconnected => disconnected) && (
              <div style={{ marginBottom: 24, padding: 16, background: 'rgba(255, 149, 0, 0.1)', border: '1px solid rgba(255, 149, 0, 0.3)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ color: '#ff9500', fontWeight: 600, marginBottom: 4 }}>Manual Disconnections Active</div>
                    <div style={{ color: '#aaa', fontSize: 14 }}>Some services are set to not auto-reconnect. Click below to reset.</div>
                  </div>
                  <button className="button secondary" onClick={resetManualDisconnections}>
                    Reset All Auto-connections
                  </button>
                </div>
              </div>
            )}
            
            <div className="accounts-grid">
              {services.map(service => (
                <div key={service.key} className="account-card" style={{'--service-color': service.color} as React.CSSProperties}>
                  <div className="account-card-header">
                    <h3>{service.label}</h3>
                  </div>
                  <div className="account-card-status">
                    {connections[service.key as keyof typeof connections] ? (
                      <span style={{ color: service.color }}>Connected</span>
                    ) : manuallyDisconnected[service.key as keyof typeof manuallyDisconnected] ? (
                      <span style={{ color: '#ff9500' }}>Manually Disconnected</span>
                    ) : (
                      <span className="secondary-text">Not Connected</span>
                    )}
                  </div>
                  <button 
                    className="button" 
                    disabled={connections[service.key as keyof typeof connections]} 
                    onClick={() => handleConnect(service.key)}
                  >
                    {connections[service.key as keyof typeof connections] ? 'Connected' : `Connect ${service.label}`}
                  </button>
                  {connections[service.key as keyof typeof connections] && (
                    <button 
                      className="button disconnect" 
                      onClick={() => handleDisconnect(service.key)}
                    >
                      Disconnect
                    </button>
                  )}
                  {manuallyDisconnected[service.key as keyof typeof manuallyDisconnected] && !connections[service.key as keyof typeof connections] && (
                    <button className="button secondary" onClick={() => handleConnect(service.key)} style={{ marginTop: 8 }}>
                      Re-enable Auto-connect
                    </button>
                  )}

                </div>
              ))}
            </div>
            <Modal open={showAppleModal} onClose={() => setShowAppleModal(false)}>
              <h3>Apple Music Authentication</h3>
              <p>Click the button below to authenticate with Apple Music in a secure webview window.</p>
              <button 
                style={{ 
                  background: '#fa233b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  padding: '12px 24px',
                  fontSize: '16px',
                  marginBottom: '16px',
                  width: '100%'
                }}
                onClick={async () => {
                  try {
                    const result = await (window as any).electronAPI.openAppleMusicWebview('https://music.apple.com/');
                    if (result.success && result.token) {
                      setAppleUserToken(result.token);
                      setShowAppleModal(false);
                    } else if (result.cancelled) {
                      console.log('Apple Music authentication cancelled');
                    }
                  } catch (error) {
                    console.error('Apple Music webview error:', error);
                    alert('Failed to open Apple Music authentication. Please try again.');
                  }
                }}
              >
                🔐 Authenticate with Apple Music
              </button>
              <p style={{ fontSize: '14px', color: '#888', marginBottom: '16px' }}>
                Or manually enter your media-user-token below:
              </p>
              <label className="form-label">media-user-token:</label>
              <input type="text" value={appleUserToken} onChange={e => setAppleUserToken(e.target.value)} placeholder="Paste your Apple media-user-token" />
              {appleTokenError && <div style={{ color: '#e94560', marginTop: 8 }}>{appleTokenError}</div>}
              <button 
                style={{ 
                  background: '#fa233b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  padding: '8px 16px',
                  fontSize: '14px',
                  transition: 'all 0.3s ease'
                }} 
                onClick={handleAppleTokenSave}
              >
                Save Tokens
              </button>
                        </Modal>
          </div>
        );
      case 'auto-sync':
        return (
          <div className="content-padding">
            {liveSyncProgress}
            {completionModal}
            <h2>AUTO SYNC</h2>
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 360 }}>
                <h3>Create Job</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                    <CustomDropdown
                      options={[{id:'spotify', name:'Spotify'},{id:'apple', name:'Apple Music'}]}
                      value={autoSyncDraft.sourceService||'spotify'}
                      onSelect={(v)=> { setSourceServiceTouched(true); setAutoSyncDraft((d:any)=> ({...d, sourceService: v })); }}
                      placeholder="Source service"
                      serviceHint={autoSyncDraft.sourceService||'spotify'}
                    />
                    <CustomDropdown
                      options={[{id:'spotify', name:'Spotify'},{id:'apple', name:'Apple Music'}]}
                      value={autoSyncDraft.destinationService||'apple'}
                      onSelect={(v)=> { setDestServiceTouched(true); setAutoSyncDraft((d:any)=> ({...d, destinationService: v })); }}
                      placeholder="Destination service"
                      serviceHint={autoSyncDraft.destinationService||'apple'}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Source playlists (multi-select)</span>
                      <button 
                        style={{ 
                          fontSize: '11px', 
                          padding: '4px 8px', 
                          backgroundColor: 'var(--accent-purple)', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '4px', 
                          cursor: 'pointer' 
                        }}
                        onClick={() => {
                          const allPlaylistIds = ((autoSyncDraft.sourceService||'spotify')==='spotify' ? (playlists['spotify']||[]) : (playlists['apple']||[])).map(p => p.id);
                          const isAllSelected = (autoSyncDraft.sourcePlaylistIds || []).length === allPlaylistIds.length && allPlaylistIds.length > 0;
                          if (isAllSelected) {
                            setAutoSyncDraft((d: any) => ({
                              ...d,
                              sourcePlaylistIds: []
                            }));
                          } else {
                            setAutoSyncDraft((d: any) => ({
                              ...d,
                              sourcePlaylistIds: allPlaylistIds
                            }));
                          }
                        }}
                      >
                        {(autoSyncDraft.sourcePlaylistIds || []).length === ((autoSyncDraft.sourceService||'spotify')==='spotify' ? (playlists['spotify']||[]) : (playlists['apple']||[])).length && ((autoSyncDraft.sourceService||'spotify')==='spotify' ? (playlists['spotify']||[]) : (playlists['apple']||[])).length > 0 ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="asm-list">
                      {((autoSyncDraft.sourceService||'spotify')==='spotify' ? (playlists['spotify']||[]) : (playlists['apple']||[])).map(p => (
                        <label key={p.id} className="asm-row">
                          <input type="checkbox" checked={(autoSyncDraft.sourcePlaylistIds||[]).includes(p.id)} onChange={(e) => {
                            setAutoSyncDraft((d: any) => ({
                              ...d,
                              sourcePlaylistIds: e.target.checked ? Array.from(new Set([...(d.sourcePlaylistIds || []), p.id])) : (d.sourcePlaylistIds || []).filter((id: string) => id !== p.id)
                            }));
                          }} />
                          <div className="asm-art">
                            {p.artwork ? (<img src={p.artwork} alt="" />) : ((autoSyncDraft.sourceService||'spotify')==='spotify' ? <FaSpotify /> : <FaApple />)}
                          </div>
                          <span className="asm-name">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button className={`feature-button ${autoSyncDraft.mode === 'combine' ? 'selected' : ''}`} onClick={() => { setModeTouched(true); setAutoSyncDraft((d: any) => ({ ...d, mode: 'combine' })); }}>Combine into one destination</button>
                    <button className={`feature-button ${autoSyncDraft.mode === 'map' ? 'selected' : ''}`} onClick={() => { setModeTouched(true); setAutoSyncDraft((d: any) => ({ ...d, mode: 'map' })); }}>Map each to its own destination</button>
                  </div>
                  {autoSyncDraft.mode === 'combine' ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 13, opacity: 0.8 }}>Destination playlist</div>
                      <CustomDropdown
                        options={[{ id: '', name: 'Create new…' }, { id: 'none', name: 'None' }, ...(((autoSyncDraft.destinationService||'apple')==='apple' ? (playlists['apple']||[]) : (playlists['spotify']||[])))]}
                        value={autoSyncDraft.destinationPlaylistId ?? 'none'}
                        onSelect={(v) => setAutoSyncDraft((d: any) => ({ ...d, destinationPlaylistId: v }))}
                        placeholder="Select destination"
                        serviceHint={(autoSyncDraft.destinationService||'apple') as any}
                        usePortal
                        menuMinWidth={360}
                        menuMaxHeight={520}
                      />
                      {autoSyncDraft.destinationPlaylistId === '' && (
                        <input className="create-playlist-input" placeholder={`New ${((autoSyncDraft.destinationService||'apple')==='apple' ? 'Apple Music' : 'Spotify')} playlist name`} value={autoSyncDraft.newDestName || ''} onChange={(e) => setAutoSyncDraft((d: any) => ({ ...d, newDestName: e.target.value }))} />
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Destination playlists (optional mapping)</div>
                      <div className="asm-list">
                        {(autoSyncDraft.sourcePlaylistIds || []).map((srcId: string) => {
                          const src = ((autoSyncDraft.sourceService||'spotify')==='spotify' ? (playlists['spotify']||[]) : (playlists['apple']||[])).find(p => p.id === srcId);
                          const currentMap = (autoSyncDraft.mappings || []).find((m: any) => m.sourcePlaylistId === srcId) || {};
                          return (
                            <div key={srcId} className="asm-row" style={{ gridTemplateColumns: '40px 1fr 220px' }}>
                              <div className="asm-art">{src && src.artwork ? <img src={src.artwork} alt="" /> : ((autoSyncDraft.sourceService||'spotify')==='spotify' ? <FaSpotify /> : <FaApple />)}</div>
                              <span className="asm-name">{src ? src.name : srcId}</span>
                              <CustomDropdown
                        options={[{ id: '', name: 'Create new…' }, { id: 'none', name: 'None' }, ...(((autoSyncDraft.destinationService||'apple')==='apple' ? (playlists['apple']||[]) : (playlists['spotify']||[])))]}
                        value={(autoSyncDraft.mappings?.find((m: any) => m.sourcePlaylistId === srcId)?.destPlaylistId) ?? 'none'}
                                onSelect={(v) => setAutoSyncDraft((d: any) => {
                                  const rest = (d.mappings || []).filter((m: any) => m.sourcePlaylistId !== srcId);
                          return { ...d, mappings: [...rest, { sourcePlaylistId: srcId, destPlaylistId: v, createNewName: (v === '' ? ((src && src.name) || '') : undefined) }] };
                                })}
                                placeholder="Select destination"
                                serviceHint={(autoSyncDraft.destinationService||'apple') as any}
                                usePortal
                                menuMinWidth={320}
                                menuMaxHeight={500}
                              />
                              {(currentMap && (currentMap.destPlaylistId === 'none')) && (
                                <input
                                  className="create-playlist-input"
                                  style={{ gridColumn: '1 / -1', marginTop: 6 }}
                                  placeholder={`New ${((autoSyncDraft.destinationService||'apple')==='apple' ? 'Apple Music' : 'Spotify')} playlist name`}
                                  value={currentMap.createNewName || ''}
                                  onChange={(e) => setAutoSyncDraft((d:any) => {
                                    const rest = (d.mappings || []).filter((m:any)=> m.sourcePlaylistId !== srcId);
                                    return { ...d, mappings: [...rest, { sourcePlaylistId: srcId, destPlaylistId: 'none', createNewName: e.target.value }] };
                                  })}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>Time of day</div>
                    <input className="create-playlist-input" placeholder="16:00" value={autoSyncDraft.timeOfDay || '16:00'} onChange={(e) => setAutoSyncDraft((d: any) => ({ ...d, timeOfDay: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {editingJobId ? (
                      <>
                        <button className="feature-button" onClick={saveEditedJob} disabled={creatingJob}>Save Changes</button>
                        <button className="feature-button" onClick={cancelEditJob} disabled={creatingJob}>Cancel</button>
                      </>
                    ) : (
                      <button className="feature-button" onClick={createAutoSyncJob} disabled={creatingJob}>Create Job</button>
                    )}
                    <div className="secondary-text" style={{fontSize:12}}>Direction: Spotify/Spotify Link ➜ Apple or Apple ➜ Spotify</div>
                  </div>
                </div>
              </div>
              <div className="feature-panel auto-sync-section" style={{ flex: 1 }}>
                <h3 className="auto-sync-header" style={{ marginTop: 0 }}>My Auto Syncs</h3>
                <div>
                  {(autoSyncJobs || []).map((job: any) => (
                    <div key={job.id} className="auto-sync-job">
                      <div className="auto-sync-job-info">
                        <div className="auto-sync-job-name">{job.name}</div>
                        <div className="auto-sync-job-details">
                          <div className="auto-sync-job-detail">
                            <strong>Next:</strong> {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '—'} | <strong>Time:</strong> {job.timeOfDay}
                          </div>
                          <div className="auto-sync-job-detail">
                            <strong>Last synced:</strong> {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : '—'}
                          </div>
                        </div>
                      </div>
                      <div className="auto-sync-job-actions">
                        <button className="auto-sync-button edit" onClick={() => startEditJob(job)}>
                          {editingJobId===job.id? 'Editing…' : 'Edit'}
                        </button>
                        <button className={`auto-sync-button toggle ${!job.enabled ? 'disabled' : ''}`} onClick={() => toggleJob(job.id, !job.enabled)}>
                          {job.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button className="auto-sync-button run" onClick={() => runJob(job.id)}>
                          Run now
                        </button>
                        <button className="auto-sync-button auto-add" onClick={() => runAutoAddMissing(job)} disabled={!canAutoAdd(job)}>
                          Auto add missing
                        </button>
                        <button className="auto-sync-button delete" onClick={() => deleteJob(job.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 'features':
        return (
          <div className="content-padding">
            {liveSyncProgress}
            {completionModal}
            <h2>FEATURES</h2>
            <div style={{ display: 'flex', flexDirection: 'row', gap: 32, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 340 }}>
                {featuresList.map(feature => (
                  <button
                    key={feature.key}
                    className={`feature-button ${selectedFeature === feature.key ? 'selected' : ''}`}
                    onClick={() => setSelectedFeature(feature.key)}
                  >
                    {feature.icon}
                    {feature.label}
                  </button>
                ))}
              </div>
              <div className="feature-panel">
                {!selectedFeature && (
                  <div style={{ color: '#aaa', fontSize: 18, textAlign: 'center', paddingTop: '40px' }}>
                    Select a feature to get started.
                  </div>
                )}
                {selectedFeature === 'join' && (
                  <div>
                    <h3 style={{ textTransform: 'uppercase', letterSpacing: 2, marginBottom: 18 }}>JOIN PLAYLISTS</h3>
                    <p className="secondary-text">Combine two playlists into one new playlist.</p>
                    <div style={{ marginTop: 24 }}>
                      <label className="form-label">First Playlist:</label>
                      <CustomDropdown
                        options={services.map(s => ({ id: s.key, name: s.label }))}
                        value={joinServiceA}
                        onSelect={setJoinServiceA}
                        placeholder="Select service"
                      />
                      <CustomDropdown
                        options={playlists[joinServiceA] || []}
                        value={joinPlaylistA}
                        onSelect={setJoinPlaylistA}
                        placeholder="Select playlist"
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <label className="form-label">Second Playlist:</label>
                      <CustomDropdown
                        options={services.map(s => ({ id: s.key, name: s.label }))}
                        value={joinServiceB}
                        onSelect={setJoinServiceB}
                        placeholder="Select service"
                      />
                      <CustomDropdown
                        options={playlists[joinServiceB] || []}
                        value={joinPlaylistB}
                        onSelect={setJoinPlaylistB}
                        placeholder="Select playlist"
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <label className="form-label">New Playlist Name:</label>
                      <input 
                        type="text" 
                        value={joinNewName} 
                        onChange={e => setJoinNewName(e.target.value)} 
                        placeholder="Enter new playlist name"
                      />
                    </div>
                    <button 
                      className="button" 
                      disabled={joining || !joinPlaylistA || !joinPlaylistB || !joinNewName}
                      onClick={handleJoinPlaylists}
                      style={{ marginTop: 16 }}
                    >
                      {joining ? 'Joining...' : 'Join Playlists'}
                    </button>
                  </div>
                )}
                {selectedFeature === 'split' && (
                  <div>
                    <h3 style={{ textTransform: 'uppercase', letterSpacing: 2, marginBottom: 18 }}>SPLIT PLAYLIST</h3>
                    <p className="secondary-text">Split one playlist into multiple smaller playlists.</p>
                    <div style={{ marginTop: 24 }}>
                      <label className="form-label">Select Playlist:</label>
                      <CustomDropdown
                        options={services.map(s => ({ id: s.key, name: s.label }))}
                        value={splitService}
                        onSelect={setSplitService}
                        placeholder="Select service"
                      />
                      <CustomDropdown
                        options={playlists[splitService] || []}
                        value={splitPlaylist}
                        onSelect={setSplitPlaylist}
                        placeholder="Select playlist"
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <label className="form-label">Split Size:</label>
                      <input 
                        type="number" 
                        value={splitSize} 
                        onChange={e => setSplitSize(Number(e.target.value))} 
                        min="1"
                        max="100"
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <label className="form-label">Base Name:</label>
                      <input 
                        type="text" 
                        value={splitBaseName} 
                        onChange={e => setSplitBaseName(e.target.value)} 
                        placeholder="e.g., My Playlist Part"
                      />
                    </div>
                    <button 
                      className="button" 
                      disabled={splitting || !splitPlaylist || !splitBaseName}
                      onClick={handleSplitPlaylist}
                      style={{ marginTop: 16 }}
                    >
                      {splitting ? 'Splitting...' : 'Split Playlist'}
                    </button>
                  </div>
                )}
                {selectedFeature === 'dedupe' && (
                  <div>
                    <h3 style={{ textTransform: 'uppercase', letterSpacing: 2, marginBottom: 18 }}>REMOVE DUPLICATES</h3>
                    <p className="secondary-text">Remove duplicate tracks from your playlist.</p>
                    <div style={{ marginTop: 24 }}>
                      <label className="form-label">Select Playlist:</label>
                      <CustomDropdown
                        options={services.map(s => ({ id: s.key, name: s.label }))}
                        value={dedupeService}
                        onSelect={setDedupeService}
                        placeholder="Select service"
                      />
                      <CustomDropdown
                        options={playlists[dedupeService] || []}
                        value={dedupePlaylist}
                        onSelect={setDedupePlaylist}
                        placeholder="Select playlist"
                      />
                    </div>

                    <button 
                      className="button" 
                      disabled={dedupeLoading || !dedupePlaylist}
                      onClick={async () => {
                        try {
                          setDedupeLoading(true);
                          
                          // Get the actual playlist name from the selected option
                          const selectedPlaylist = playlists[dedupeService]?.find(p => p.id === dedupePlaylist);
                          const playlistName = selectedPlaylist?.name || null;
                          
                          const response = await fetch(`${API_BASE_URL}/features/dedupe_playlist`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                              service: dedupeService, 
                              playlist: dedupePlaylist,
                              playlistName: playlistName // Send the actual playlist name as backup
                            })
                          });
                          const data = await response.json();
                          if (response.ok && data.success) {
                            const duplicatesRemoved = data.originalCount - data.newCount;
                            const message = duplicatesRemoved > 0 
                              ? `Success! Removed ${duplicatesRemoved} duplicate tracks. New playlist "${data.newPlaylistName}" created with ${data.newCount} tracks.`
                              : `No duplicates found in playlist. New playlist "${data.newPlaylistName}" created with ${data.newCount} tracks.`;
                            setDedupeResult({ success: true, message });
                            alert(message);
                            fetchAllPlaylists();
                          } else {
                            setDedupeResult({ success: false, message: data.error || 'Failed to dedupe' });
                            alert(`Error: ${data.error || 'Failed to dedupe'}`);
                          }
                        } catch (e) {
                          console.error('Dedupe error', e);
                          setDedupeResult({ success: false, message: String(e) });
                        } finally {
                          setDedupeLoading(false);
                        }
                      }}
                      style={{ marginTop: 16 }}
                    >
                      {dedupeLoading ? 'Processing...' : 'Remove Duplicates'}
                    </button>
                    {dedupeResult && (
                      <div style={{ marginTop: 16, padding: '12px', borderRadius: '4px', backgroundColor: dedupeResult.success ? '#d4edda' : '#f8d7da', color: dedupeResult.success ? '#155724' : '#721c24' }}>
                        {dedupeResult.message}
                      </div>
                    )}
                  </div>
                )}
                {selectedFeature === 'import' && (
                  <div>
                    <h3 style={{ textTransform: 'uppercase', letterSpacing: 2, marginBottom: 18 }}>IMPORT FAVORITES</h3>
                    <p className="secondary-text">Import your favorite Albums/Artists/Tracks from TXT, CSV or plain text files.</p>
                    <div style={{ marginTop: 24 }}>
                      <label className="form-label">Upload File:</label>
                      <input 
                        type="file" 
                        accept=".txt,.csv" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const content = event.target?.result as string;
                              setImportText(content);
                              setImportFile(file);
                            };
                            reader.readAsText(file);
                          }
                        }}
                        style={{ marginTop: 8 }}
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <label className="form-label">Source Type:</label>
                      <CustomDropdown
                        options={[
                          { id: 'spotify-exportify', name: 'Spotify (Exportify)' },
                          { id: 'apple-music', name: 'Apple Music' },
                          { id: 'generic', name: 'Generic CSV' }
                        ]}
                        value={importFormat}
                        onSelect={setImportFormat}
                        placeholder="Select source type"
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <label className="form-label">Target Service:</label>
                      <CustomDropdown
                        options={services.map(s => ({ id: s.key, name: s.label }))}
                        value={importService}
                        onSelect={setImportService}
                        placeholder="Select service"
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <label className="form-label">Playlist Name (Optional):</label>
                      <input 
                        type="text" 
                        placeholder="Enter playlist name to create"
                        value={importText.split('\n')[0]?.replace(/[^a-zA-Z0-9\s]/g, '') || ''}
                        onChange={(e) => setImportText(e.target.value)}
                        style={{ marginTop: 8, width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                      />
                    </div>
                    <button 
                      className="button" 
                      disabled={importing || !importService || !importFile || !importText}
                      onClick={handleImportCSV}
                      style={{ marginTop: 16 }}
                    >
                      {importing ? 'Importing...' : 'Import CSV'}
                    </button>
                    {importResult && (
                      <div style={{ marginTop: 16, padding: '12px', borderRadius: '4px', backgroundColor: importResult.success ? '#d4edda' : '#f8d7da', color: importResult.success ? '#155724' : '#721c24' }}>
                        {importResult.message}
                      </div>
                    )}
                  </div>
                )}
                {selectedFeature === 'export-favs' && (
                  <div>
                    <h3 style={{ textTransform: 'uppercase', letterSpacing: 2, marginBottom: 18 }}>EXPORT FAVORITES</h3>
                    <p className="secondary-text">Export your favorite Albums/Artists/Tracks as CSV, TXT, JSON, XML, and URL files.</p>
                    <div style={{ marginTop: 24 }}>
                      <label className="form-label">Source Service:</label>
                      <CustomDropdown
                        options={services.map(s => ({ id: s.key, name: s.label }))}
                        value={exportFavsService}
                        onSelect={setExportFavsService}
                        placeholder="Select service"
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <label className="form-label">Export Format:</label>
                      <CustomDropdown
                        options={[
                          { id: 'csv', name: 'CSV' },
                          { id: 'txt', name: 'TXT' },
                          { id: 'json', name: 'JSON' },
                          { id: 'xml', name: 'XML' },
                          { id: 'url', name: 'URL List' }
                        ]}
                        value={exportFavsFormat}
                        onSelect={setExportFavsFormat}
                        placeholder="Select format"
                      />
                    </div>
                    <button 
                      className="button" 
                      disabled={exportingFavs || !exportFavsService || !exportFavsFormat}
                      onClick={handleExportFavorites}
                      style={{ marginTop: 16 }}
                    >
                      {exportingFavs ? 'Exporting...' : 'Export Favorites'}
                    </button>
                  </div>
                )}
                {selectedFeature === 'export-playlist' && (
                  <div>
                    <h3 style={{ textTransform: 'uppercase', letterSpacing: 2, marginBottom: 18 }}>EXPORT PLAYLIST</h3>
                    <p className="secondary-text">Export your playlist as CSV, TXT, XSPF, JSON, XML, and URL files.</p>
                    <div style={{ marginTop: 24 }}>
                      <label className="form-label">Select Playlist:</label>
                      <CustomDropdown
                        options={services.map(s => ({ id: s.key, name: s.label }))}
                        value={exportPlaylistService}
                        onSelect={setExportPlaylistService}
                        placeholder="Select service"
                      />
                      <CustomDropdown
                        options={playlists[exportPlaylistService] || []}
                        value={exportPlaylist}
                        onSelect={setExportPlaylist}
                        placeholder="Select playlist"
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <label className="form-label">Export Format:</label>
                      <CustomDropdown
                        options={[
                          { id: 'csv', name: 'CSV' },
                          { id: 'txt', name: 'TXT' },
                          { id: 'xspf', name: 'XSPF' },
                          { id: 'json', name: 'JSON' },
                          { id: 'xml', name: 'XML' },
                          { id: 'url', name: 'URL List' }
                        ]}
                        value={exportPlaylistFormat}
                        onSelect={setExportPlaylistFormat}
                        placeholder="Select format"
                      />
                    </div>
                    <button 
                      className="button" 
                      disabled={exportingPlaylist || !exportPlaylist || !exportPlaylistFormat}
                      onClick={handleExportPlaylist}
                      style={{ marginTop: 16 }}
                    >
                      {exportingPlaylist ? 'Exporting...' : 'Export Playlist'}
                    </button>
                  </div>
                )}
                {selectedFeature === 'manage-favs' && (
                  <div>
                    <h3 style={{ textTransform: 'uppercase', letterSpacing: 2, marginBottom: 18 }}>MANAGE FAVORITES</h3>
                    <p className="secondary-text">Manage your favorite Albums/Artists/Tracks across services.</p>
                    <div style={{ marginTop: 24 }}>
                      <label className="form-label">Service:</label>
                      <CustomDropdown
                        options={services.map(s => ({ id: s.key, name: s.label }))}
                        value={manageFavsService}
                        onSelect={setManageFavsService}
                        placeholder="Select service"
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <label className="form-label">Action:</label>
                      <CustomDropdown
                        options={[
                          { id: 'view', name: 'View Favorites' },
                          { id: 'sync', name: 'Sync to Another Service' },
                          { id: 'backup', name: 'Backup Favorites' }
                        ]}
                        value={manageFavsAction}
                        onSelect={setManageFavsAction}
                        placeholder="Select action"
                      />
                    </div>
                    <button 
                      className="button" 
                      disabled={managingFavs || !manageFavsService || !manageFavsAction}
                      onClick={() => alert(`${manageFavsAction} favorites for ${manageFavsService} - Feature coming soon!`)}
                      style={{ marginTop: 16 }}
                    >
                      {managingFavs ? 'Processing...' : 'Manage Favorites'}
                    </button>
                  </div>
                )}
                {selectedFeature === 'starred' && (
                  <div>
                    <h3 style={{ textTransform: 'uppercase', letterSpacing: 2, marginBottom: 18 }}>STARRED PLAYLISTS</h3>
                    <p className="secondary-text">View and manage your starred/liked playlists.</p>
                    <div style={{ marginTop: 24 }}>
                      <label className="form-label">Service:</label>
                      <CustomDropdown
                        options={services.map(s => ({ id: s.key, name: s.label }))}
                        value={starredService}
                        onSelect={setStarredService}
                        placeholder="Select service"
                      />
                    </div>
                    <div style={{ marginTop: 16, padding: 16, background: '#1a1a1a', borderRadius: 8 }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#fff' }}>Your Starred Playlists</h4>
                      {starredService === 'spotify' && (
                        <div style={{ color: '#aaa' }}>
                          <p>• Your Library (Liked Songs)</p>
                          <p>• Discover Weekly</p>
                          <p>• Release Radar</p>
                          <p style={{ fontSize: 14, marginTop: 12 }}>Full starred playlist management coming soon!</p>
                        </div>
                      )}
                      {starredService && starredService !== 'spotify' && (
                        <p style={{ color: '#aaa' }}>Connect to {starredService} to view starred playlists.</p>
                      )}
                      {!starredService && (
                        <p style={{ color: '#aaa' }}>Select a service to view starred playlists.</p>
                      )}
                    </div>
                    <button 
                      className="button" 
                      disabled={!starredService}
                      onClick={() => alert(`Loading starred playlists for ${starredService} - Feature coming soon!`)}
                      style={{ marginTop: 16 }}
                    >
                      Refresh Starred Playlists
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="content-padding">
            {liveSyncProgress}
            {completionModal}
            <h2>SETTINGS</h2>
            <p className="secondary-text">Configure your preferences and app settings.</p>
            <div style={{ marginTop: 24 }}>
              <div style={{ marginBottom: 24 }}>
                <label className="form-label">Auto-refresh interval (seconds):</label>
                <input 
                  type="number" 
                  min={5} 
                  max={300} 
                  value={refreshInterval} 
                  onChange={e => setRefreshInterval(Number(e.target.value))} 
                  style={{ width: 60, fontSize: 15, borderRadius: 6, border: '1px solid #444', background: '#181818', color: '#fff', padding: '4px 8px' }} 
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <h3>About</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <img 
                    src={iconPath} 
                    alt="SyncMyPlays Icon" 
                    style={{ 
                      width: 48, 
                      height: 48, 
                      borderRadius: '50%',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                    }} 
                  />
                  <div>
                    <p className="secondary-text" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>SyncMyPlays v1.0.0</p>
                    <p className="secondary-text" style={{ margin: 4 }}>Bidirectional music playlist sync tool for Spotify ↔ Apple Music with SongShift-level accuracy.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return <div className="content-padding"><h2>Welcome</h2></div>;
    }
  };

  if (!backendReady && !backendError) {
    return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:24}}>Starting backend, please wait...</div>;
  }
  if (backendError) {
    return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:24,color:'red'}}>{backendError}</div>;
  }

  return (
    <>
      {renderContent()}
      

      
      <Modal open={showLogsModal} onClose={() => setShowLogsModal(false)}>
        <div style={{ maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '20px', color: '#fa233b' }}>📄 Sync Reports & Logs</h3>
          
          {/* Log Management Controls */}
          <div style={{ marginBottom: 20, padding: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <button className="button secondary" onClick={fetchLogFiles} disabled={refreshing}>
                🔄 Refresh Logs
              </button>
              <button className="button secondary" onClick={handleCleanupLogs}>
                🗑️ Cleanup Old Logs
              </button>
              <button className="button secondary" onClick={handleRotateLogs}>
                📁 Rotate Current Log
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#aaa' }}>
              Logs are automatically rotated when they exceed 10MB and old logs are cleaned up after 7 days.
            </div>
          </div>
          
          {/* Log Files List */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: '#fff' }}>Available Log Files ({logFiles.length})</h4>
              <div style={{ fontSize: 12, color: '#aaa' }}>
                Click on a log file to view its contents
              </div>
            </div>
            
            <div style={{ 
              flex: 1, 
              overflow: 'auto', 
              background: 'rgba(0,0,0,0.2)', 
              borderRadius: 8, 
              padding: 12 
            }}>
              {logFiles.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#666', padding: 20 }}>
                  No log files found. Logs will appear here after the app has been running.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {logFiles.map((log, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '12px 16px',
                        background: selectedLogContent && selectedLogContent === log.name ? 'rgba(250, 35, 59, 0.1)' : 'rgba(255,255,255,0.05)',
                        border: selectedLogContent && selectedLogContent === log.name ? '1px solid rgba(250, 35, 59, 0.3)' : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onClick={() => fetchLogContent(log.name)}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#fa233b'; e.currentTarget.style.background = '#333'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.background = '#2a2a2a'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{log.name}</div>
                        <div style={{ fontSize: 12, color: '#aaa' }}>{log.sizeFormatted}</div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                        <span style={{ color: '#888' }}>Created: {log.created}</span>
                        <span style={{ color: '#888' }}>Modified: {log.modified}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Log Content Viewer */}
          {selectedLogContent && (
            <div style={{ marginTop: 20, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, color: '#fff' }}>Log Content: {selectedLogContent}</h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="button secondary" onClick={() => copyToClipboard(selectedLogContent)}>
                    📋 Copy
                  </button>
                  <button className="button secondary" onClick={() => setSelectedLogContent('')}>
                    ✕ Close
                  </button>
                </div>
              </div>
              
              <div style={{ 
                flex: 1, 
                overflow: 'auto', 
                background: 'rgba(0,0,0,0.3)', 
                borderRadius: 8, 
                padding: 16,
                fontFamily: 'monospace',
                fontSize: 12,
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {selectedLogContent}
              </div>
            </div>
          )}
        </div>
      </Modal>
      

    </>
  );
};

export default MainContent;