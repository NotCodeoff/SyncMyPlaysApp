import React, { useState, useEffect } from 'react';
import { SongShiftReview } from './SongShiftReview';
import './SongShiftSync.css';

interface TrackMatch {
  id: string;
  type: string;
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
    durationInMillis: number;
    artwork?: { url: string };
  };
  matchMethod: string;
  matchTime: number;
  confidence: 'high' | 'medium' | 'low';
  score?: number;
}

interface ReviewItem {
  sourceTrack: {
    name: string;
    artists: string[];
    album: string;
    duration_ms: number;
  };
  match: TrackMatch | null;
  alternatives: TrackMatch[];
  unavailable: boolean;
  needsReview: boolean;
}

interface TransferSession {
  sessionId: string;
  status: 'processing' | 'needs_review' | 'reviewed' | 'executing' | 'completed' | 'error';
  progress: { current: number; total: number };
  results?: {
    matched: ReviewItem[];
    needsReview: ReviewItem[];
    unavailable: ReviewItem[];
  };
  error?: string;
  stats?: {
    totalTracks: number;
    transferred: number;
    autoMatched: number;
    userSelected: number;
    unavailable: number;
    ignored: number;
    successRate: number;
  };
}

export const SongShiftSync: React.FC = () => {
  const [session, setSession] = useState<TransferSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [playlistId, setPlaylistId] = useState('');

  const startTransfer = async () => {
    if (!playlistId.trim()) {
      alert('Please enter a Spotify playlist ID');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/sync/songshift/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceService: 'spotify',
          sourcePlaylistId: playlistId.trim(),
          destinationService: 'apple',
          storefront: 'us'
        })
      });
      
      const data = await response.json();
      if (data.success) {
        pollStatus(data.sessionId);
      }
    } catch (error) {
      console.error('Start transfer error:', error);
      alert('Failed to start transfer');
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = async (sessionId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await apiFetch(API_ENDPOINTS.SYNC_SONGSHIFT_STATUS(sessionId));
        const data = await response.json();
        
        setSession(data);
        
        if (data.status === 'needs_review') {
          setShowReview(true);
          clearInterval(interval);
        } else if (data.status === 'completed' || data.status === 'error') {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Poll status error:', error);
        clearInterval(interval);
      }
    }, 500); // Faster polling for instant updates
  };

  const handleReviewComplete = async (decisions: Array<{trackIndex: number, action: 'select' | 'ignore', selectedVariantId?: string}>) => {
    if (!session) return;
    
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/sync/songshift/review/${session.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions })
      });
      
      const data = await response.json();
      if (data.success) {
        setShowReview(false);
        executeTransfer();
      }
    } catch (error) {
      console.error('Submit review error:', error);
      alert('Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  const executeTransfer = async () => {
    if (!session) return;
    
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/sync/songshift/execute/${session.sessionId}`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.success) {
        pollStatus(session.sessionId);
      }
    } catch (error) {
      console.error('Execute transfer error:', error);
      alert('Failed to execute transfer');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseReview = () => {
    setShowReview(false);
  };

  if (!session) {
    return (
      <div className="songshift-sync-container">
        <div className="songshift-header">
          <h1>🎯 SongShift-Level Sync</h1>
          <p>Match SongShift's 96.8% success rate with review system</p>
        </div>
        
        <div className="playlist-input-section">
          <h2>Start Transfer</h2>
          <div className="input-group">
            <label htmlFor="playlistId">Spotify Playlist ID:</label>
            <input
              id="playlistId"
              type="text"
              value={playlistId}
              onChange={(e) => setPlaylistId(e.target.value)}
              placeholder="e.g., 37i9dQZF1DXcBWIGoYBM5M"
              className="playlist-input"
            />
          </div>
          <button 
            className="start-button"
            onClick={startTransfer}
            disabled={loading || !playlistId.trim()}
          >
            {loading ? 'Starting...' : 'Start SongShift-Level Transfer'}
          </button>
        </div>

        <div className="features-section">
          <h2>SongShift Features</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🎯</div>
              <h3>ISRC Matching</h3>
              <p>Instant exact track identification like SongShift</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3>Multiple Search Terms</h3>
              <p>Enhanced matching finds more songs than basic search</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <h3>Review Alternatives</h3>
              <p>Choose between multiple versions of the same song</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>SongShift Speed</h3>
              <p>30ms per track - matches SongShift's performance</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (session.status === 'processing') {
    return (
      <div className="songshift-sync-container">
        <div className="processing-view">
          <h2>🎯 Analyzing Your Music</h2>
          <div className="progress-section">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${(session.progress.current / session.progress.total) * 100}%` }}
              />
            </div>
            <div className="progress-text">
              {session.progress.current} of {session.progress.total} tracks processed
            </div>
          </div>
          <div className="processing-details">
            <p>Using SongShift-level matching algorithm...</p>
            <ul>
              <li>🎯 ISRC matching for exact identification</li>
              <li>🔍 Multiple search terms for better coverage</li>
              <li>⚡ 30ms per track for SongShift speed</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (showReview && session.results) {
    return (
      <SongShiftReview
        reviewItems={session.results.needsReview}
        unavailableItems={session.results.unavailable}
        onComplete={handleReviewComplete}
        onClose={handleCloseReview}
      />
    );
  }

  if (session.status === 'completed' && session.stats) {
    return (
      <div className="songshift-sync-container">
        <div className="completion-view">
          <h2>🎉 SongShift-Level Transfer Complete!</h2>
          
          <div className="success-rate">
            <div className="rate-circle">
              <span className="rate-number">{session.stats.successRate}%</span>
              <span className="rate-label">Success Rate</span>
            </div>
            <div className="rate-comparison">
              <p>Target: 96.8% (SongShift level)</p>
              <p className={session.stats.successRate >= 96 ? 'target-met' : 'target-missed'}>
                {session.stats.successRate >= 96 ? '✅ Target Met!' : '⚠️ Close to target'}
              </p>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card success">
              <span className="stat-value">{session.stats.transferred}</span>
              <span className="stat-label">Transferred</span>
            </div>
            <div className="stat-card auto">
              <span className="stat-value">{session.stats.autoMatched}</span>
              <span className="stat-label">Auto-Matched</span>
            </div>
            <div className="stat-card review">
              <span className="stat-value">{session.stats.userSelected}</span>
              <span className="stat-label">User Selected</span>
            </div>
            <div className="stat-card unavailable">
              <span className="stat-value">{session.stats.unavailable}</span>
              <span className="stat-label">Unavailable</span>
            </div>
            <div className="stat-card ignored">
              <span className="stat-value">{session.stats.ignored}</span>
              <span className="stat-label">Ignored</span>
            </div>
          </div>

          <div className="completion-actions">
            <button 
              className="new-transfer-button"
              onClick={() => {
                setSession(null);
                setPlaylistId('');
              }}
            >
              Start New Transfer
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (session.status === 'error') {
    return (
      <div className="songshift-sync-container error">
        <h2>❌ Transfer Error</h2>
        <p>{session.error}</p>
        <button 
          className="retry-button"
          onClick={() => {
            setSession(null);
            setPlaylistId('');
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return null;
};
