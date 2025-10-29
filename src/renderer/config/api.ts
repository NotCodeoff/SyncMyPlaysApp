/**
 * API Configuration
 * Centralized configuration for all API endpoints and connections
 */

// Determine backend URL based on environment
const getBackendUrl = (): string => {
  // Check if running in Electron
  if (window && (window as any).electronAPI) {
    // Production Electron app - use correct backend port
    return 'http://127.0.0.1:8000';
  }
  
  // Development or web environment - use correct backend port
  const port = 8000;
  const host = '127.0.0.1';
  return `http://${host}:${port}`;
};

export const API_CONFIG = {
  BASE_URL: getBackendUrl(),
  WEBSOCKET_URL: getBackendUrl().replace('http', 'ws'),
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
};

// API Endpoints
export const API_ENDPOINTS = {
  // Auth
  SPOTIFY_AUTH: `${API_CONFIG.BASE_URL}/auth/spotify`,
  SPOTIFY_STATUS: `${API_CONFIG.BASE_URL}/auth/spotify/status`,
  SPOTIFY_SIGNOUT: `${API_CONFIG.BASE_URL}/auth/spotify/signout`,
  
  APPLE_AUTH: `${API_CONFIG.BASE_URL}/auth/apple`,
  APPLE_STATUS: `${API_CONFIG.BASE_URL}/auth/apple/status`,
  APPLE_SIGNOUT: `${API_CONFIG.BASE_URL}/auth/apple/signout`,
  
  YOUTUBE_AUTH: `${API_CONFIG.BASE_URL}/auth/youtube`,
  YOUTUBE_STATUS: `${API_CONFIG.BASE_URL}/auth/youtube/status`,
  YOUTUBE_SIGNOUT: `${API_CONFIG.BASE_URL}/auth/youtube/signout`,
  
  // Playlists
  PLAYLISTS_SPOTIFY: `${API_CONFIG.BASE_URL}/playlists/spotify`,
  PLAYLISTS_APPLE: `${API_CONFIG.BASE_URL}/playlists/apple`,
  PLAYLISTS_YOUTUBE: `${API_CONFIG.BASE_URL}/playlists/youtube`,
  PLAYLISTS_APPLE_CREATE: `${API_CONFIG.BASE_URL}/playlists/apple/create`,
  
  // Sync
  SYNC_ENHANCED: `${API_CONFIG.BASE_URL}/sync/enhanced`,
  SYNC_ADVANCED_PREPARE: `${API_CONFIG.BASE_URL}/api/sync/advanced/prepare`,
  SYNC_ADVANCED_STATUS: (sessionId: string) => `${API_CONFIG.BASE_URL}/api/sync/advanced/status/${sessionId}`,
  SYNC_ADVANCED_REVIEW: (sessionId: string) => `${API_CONFIG.BASE_URL}/api/sync/advanced/review/${sessionId}`,
  SYNC_ADVANCED_EXECUTE: (sessionId: string) => `${API_CONFIG.BASE_URL}/api/sync/advanced/execute/${sessionId}`,
  
  SYNC_SONGSHIFT_PREPARE: `${API_CONFIG.BASE_URL}/api/sync/songshift/prepare`,
  SYNC_SONGSHIFT_STATUS: (sessionId: string) => `${API_CONFIG.BASE_URL}/api/sync/songshift/status/${sessionId}`,
  SYNC_SONGSHIFT_REVIEW: (sessionId: string) => `${API_CONFIG.BASE_URL}/api/sync/songshift/review/${sessionId}`,
  SYNC_SONGSHIFT_EXECUTE: (sessionId: string) => `${API_CONFIG.BASE_URL}/api/sync/songshift/execute/${sessionId}`,
  
  // Features
  AUTO_ADD_MISSING: `${API_CONFIG.BASE_URL}/api/auto-add-missing`,
  JOIN_PLAYLISTS: `${API_CONFIG.BASE_URL}/features/join_playlists`,
  SPLIT_PLAYLIST: `${API_CONFIG.BASE_URL}/features/split_playlist`,
  EXPORT_FAVORITES: `${API_CONFIG.BASE_URL}/features/export_favorites`,
  EXPORT_PLAYLIST: `${API_CONFIG.BASE_URL}/features/export_playlist`,
  DEDUPE_PLAYLIST: `${API_CONFIG.BASE_URL}/features/dedupe_playlist`,
  PARSE_FAILED_TRACKS: `${API_CONFIG.BASE_URL}/api/parse-failed-tracks`,
  COMPARE_PLAYLISTS: `${API_CONFIG.BASE_URL}/api/compare-playlists`,
  REMOVE_DUPLICATES: `${API_CONFIG.BASE_URL}/api/remove-duplicates`,
  FIX_ORDER: `${API_CONFIG.BASE_URL}/api/fix-order`,
  
  // CSV
  IMPORT_CSV: `${API_CONFIG.BASE_URL}/api/import-csv`,
  EXPORT_CSV: `${API_CONFIG.BASE_URL}/api/export-csv`,
  
  // Logs
  LOGS: `${API_CONFIG.BASE_URL}/api/logs`,
  LOGS_CLEANUP: `${API_CONFIG.BASE_URL}/api/logs/cleanup`,
  LOGS_ROTATE: `${API_CONFIG.BASE_URL}/api/logs/rotate`,
  LOG_SYNC: `${API_CONFIG.BASE_URL}/api/log-sync`,
  LOGS_FILE: (filename: string) => `${API_CONFIG.BASE_URL}/api/logs/${filename}`,
  
  // Auto Sync
  AUTO_SYNC_JOBS: `${API_CONFIG.BASE_URL}/auto-sync/jobs`,
  AUTO_SYNC_JOB: (id: string) => `${API_CONFIG.BASE_URL}/auto-sync/jobs/${encodeURIComponent(id)}`,
  AUTO_SYNC_RUN: (id: string) => `${API_CONFIG.BASE_URL}/auto-sync/jobs/${encodeURIComponent(id)}/run`,
  
  // System
  RESET: `${API_CONFIG.BASE_URL}/reset`,
  HEALTH: `${API_CONFIG.BASE_URL}/health`,
  PING: `${API_CONFIG.BASE_URL}/ping`,
};

/**
 * Fetch wrapper with retry logic and error handling
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < API_CONFIG.RETRY_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // If rate limited, wait and retry
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : API_CONFIG.RETRY_DELAY * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on abort
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      // Wait before retrying
      if (attempt < API_CONFIG.RETRY_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, API_CONFIG.RETRY_DELAY * (attempt + 1)));
      }
    }
  }
  
  throw lastError || new Error('Request failed after retries');
}

/**
 * Build API URL helper function (for backward compatibility)
 */
export function buildApiUrl(endpoint: string): string {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
}

/**
 * Build WebSocket URL helper function (for backward compatibility)
 */
export function buildWsUrl(endpoint: string): string {
  return `${API_CONFIG.WEBSOCKET_URL}${endpoint}`;
}

export default API_CONFIG;
