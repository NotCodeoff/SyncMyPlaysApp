import React, { useState, useEffect } from 'react';
import './AdvancedSync.css';

interface MatchScore {
  total: number;
  confidence: 'high' | 'medium' | 'low' | 'very_low';
  breakdown: any;
}

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
  matchScore: MatchScore;
  matchMethod: string;
}

interface ReviewItem {
  sourceTrack: {
    name: string;
    artists: string[];
    album: string;
    duration_ms: number;
    artwork?: { url: string };
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
    autoMatched: ReviewItem[];
    needsReview: ReviewItem[];
    unavailable: ReviewItem[];
  };
  error?: string;
  stats?: any;
}

export const AdvancedSync: React.FC = () => {
  const [session, setSession] = useState<TransferSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [decisions, setDecisions] = useState<Map<number, { action: 'select' | 'ignore'; selectedVariantId?: string }>>(new Map());
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);

  const startTransfer = async (sourcePlaylistId: string) => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/sync/advanced/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceService: 'spotify',
          sourcePlaylistId,
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
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = async (sessionId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await apiFetch(API_ENDPOINTS.SYNC_ADVANCED_STATUS(sessionId));
        const data = await response.json();
        
        setSession(data);
        
        if (data.status === 'needs_review' || data.status === 'completed' || data.status === 'error') {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Poll status error:', error);
        clearInterval(interval);
      }
    }, 500); // Faster polling for instant updates
  };

  const submitReview = async () => {
    if (!session) return;
    
    setLoading(true);
    try {
      const decisionArray = Array.from(decisions.entries()).map(([trackIndex, decision]) => ({
        trackIndex,
        ...decision
      }));
      
      const response = await fetch(`http://localhost:3001/api/sync/advanced/review/${session.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: decisionArray })
      });
      
      const data = await response.json();
      if (data.success) {
        executeTransfer();
      }
    } catch (error) {
      console.error('Submit review error:', error);
    } finally {
      setLoading(false);
    }
  };

  const executeTransfer = async () => {
    if (!session) return;
    
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/sync/advanced/execute/${session.sessionId}`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.success) {
        pollStatus(session.sessionId);
      }
    } catch (error) {
      console.error('Execute transfer error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVariantSelect = (trackIndex: number, variantId: string) => {
    const newDecisions = new Map(decisions);
    newDecisions.set(trackIndex, { action: 'select', selectedVariantId: variantId });
    setDecisions(newDecisions);
  };

  const handleIgnoreSong = (trackIndex: number) => {
    const newDecisions = new Map(decisions);
    newDecisions.set(trackIndex, { action: 'ignore' });
    setDecisions(newDecisions);
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      high: '#4CAF50',
      medium: '#FF9800',
      low: '#FF5722',
      very_low: '#9E9E9E'
    };
    return (
      <span className="confidence-badge" style={{ backgroundColor: colors[confidence as keyof typeof colors] || '#9E9E9E' }}>
        {confidence.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  if (!session) {
    return (
      <div className="advanced-sync-container">
        <h2>Advanced Music Transfer</h2>
        <p>SongShift-level accuracy with variant detection and manual review</p>
        {/* Add playlist selection UI here */}
      </div>
    );
  }

  if (session.status === 'processing') {
    return (
      <div className="advanced-sync-container">
        <h2>Analyzing Your Music</h2>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${(session.progress.current / session.progress.total) * 100}%` }}
          />
        </div>
        <p>{session.progress.current} of {session.progress.total} tracks processed</p>
      </div>
    );
  }

  if (session.status === 'needs_review' && session.results) {
    const reviewItems = session.results.needsReview;
    const currentItem = reviewItems[currentReviewIndex];
    const unavailableItems = session.results.unavailable;

    return (
      <div className="advanced-sync-container review-mode">
        <h2>Review Alternatives</h2>
        
        {/* Summary */}
        <div className="review-summary">
          <div className="summary-stat">
            <span className="stat-value">{session.results.autoMatched.length}</span>
            <span className="stat-label">Auto-Matched</span>
          </div>
          <div className="summary-stat warning">
            <span className="stat-value">{reviewItems.length}</span>
            <span className="stat-label">Needs Review</span>
          </div>
          <div className="summary-stat error">
            <span className="stat-value">{unavailableItems.length}</span>
            <span className="stat-label">Unavailable</span>
          </div>
        </div>

        {/* Review Interface */}
        {reviewItems.length > 0 && currentItem && (
          <div className="review-interface">
            <div className="review-header">
              <span className="review-counter">
                Track {currentReviewIndex + 1} of {reviewItems.length}
              </span>
            </div>

            {/* Original Track */}
            <div className="original-track">
              <h3>Original Track</h3>
              <div className="track-card source">
                {currentItem.sourceTrack.artwork && (
                  <img src={currentItem.sourceTrack.artwork.url} alt="Album art" className="track-artwork" />
                )}
                <div className="track-info">
                  <div className="track-name">{currentItem.sourceTrack.name}</div>
                  <div className="track-artist">{currentItem.sourceTrack.artists.join(', ')}</div>
                  <div className="track-album">{currentItem.sourceTrack.album}</div>
                  <div className="track-duration">{formatDuration(currentItem.sourceTrack.duration_ms)}</div>
                </div>
              </div>
            </div>

            {/* Alternative Versions */}
            <div className="alternatives-section">
              <h3>Select a Version</h3>
              <p className="help-text">Choose the correct version or ignore this song</p>
              
              <div className="alternatives-list">
                {/* Best Match */}
                {currentItem.match && (
                  <div 
                    className={`track-card alternative ${decisions.get(currentReviewIndex)?.selectedVariantId === currentItem.match.id ? 'selected' : ''}`}
                    onClick={() => handleVariantSelect(currentReviewIndex, currentItem.match!.id)}
                  >
                    {currentItem.match.attributes.artwork && (
                      <img 
                        src={currentItem.match.attributes.artwork.url.replace('{w}', '100').replace('{h}', '100')} 
                        alt="Album art" 
                        className="track-artwork" 
                      />
                    )}
                    <div className="track-info">
                      <div className="match-badge">Recommended</div>
                      <div className="track-name">{currentItem.match.attributes.name}</div>
                      <div className="track-artist">{currentItem.match.attributes.artistName}</div>
                      <div className="track-album">{currentItem.match.attributes.albumName}</div>
                      <div className="track-duration">{formatDuration(currentItem.match.attributes.durationInMillis)}</div>
                      <div className="match-info">
                        {getConfidenceBadge(currentItem.match.matchScore.confidence)}
                        <span className="match-score">Score: {Math.round(currentItem.match.matchScore.total)}/100</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Alternative Options */}
                {currentItem.alternatives.map((alt, idx) => (
                  <div 
                    key={alt.id}
                    className={`track-card alternative ${decisions.get(currentReviewIndex)?.selectedVariantId === alt.id ? 'selected' : ''}`}
                    onClick={() => handleVariantSelect(currentReviewIndex, alt.id)}
                  >
                    {alt.attributes.artwork && (
                      <img 
                        src={alt.attributes.artwork.url.replace('{w}', '100').replace('{h}', '100')} 
                        alt="Album art" 
                        className="track-artwork" 
                      />
                    )}
                    <div className="track-info">
                      <div className="track-name">{alt.attributes.name}</div>
                      <div className="track-artist">{alt.attributes.artistName}</div>
                      <div className="track-album">{alt.attributes.albumName}</div>
                      <div className="track-duration">{formatDuration(alt.attributes.durationInMillis)}</div>
                      <div className="match-info">
                        {getConfidenceBadge(alt.matchScore.confidence)}
                        <span className="match-score">Score: {Math.round(alt.matchScore.total)}/100</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Ignore Option */}
                <div 
                  className={`track-card ignore-option ${decisions.get(currentReviewIndex)?.action === 'ignore' ? 'selected' : ''}`}
                  onClick={() => handleIgnoreSong(currentReviewIndex)}
                >
                  <div className="ignore-icon">🚫</div>
                  <div className="ignore-text">
                    <strong>Ignore Song</strong>
                    <p>Skip this track and don't add it to the playlist</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="review-navigation">
              <button 
                className="btn-secondary"
                disabled={currentReviewIndex === 0}
                onClick={() => setCurrentReviewIndex(currentReviewIndex - 1)}
              >
                ← Previous
              </button>
              <button 
                className="btn-secondary"
                disabled={currentReviewIndex === reviewItems.length - 1}
                onClick={() => setCurrentReviewIndex(currentReviewIndex + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Unavailable Songs */}
        {unavailableItems.length > 0 && (
          <div className="unavailable-section">
            <h3>Not Available on Apple Music</h3>
            <p>{unavailableItems.length} songs could not be found</p>
            <div className="unavailable-list">
              {unavailableItems.map((item, idx) => (
                <div key={idx} className="track-card unavailable">
                  <div className="track-info">
                    <div className="track-name">{item.sourceTrack.name}</div>
                    <div className="track-artist">{item.sourceTrack.artists.join(', ')}</div>
                    <div className="track-album">{item.sourceTrack.album}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Complete Review Button */}
        <div className="review-actions">
          <button 
            className="btn-primary"
            onClick={submitReview}
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Complete Review & Transfer'}
          </button>
        </div>
      </div>
    );
  }

  if (session.status === 'completed' && session.stats) {
    return (
      <div className="advanced-sync-container">
        <h2>✅ Transfer Complete!</h2>
        <div className="completion-stats">
          <div className="stat-card">
            <span className="stat-value">{session.stats.transferred}</span>
            <span className="stat-label">Tracks Transferred</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{session.stats.unavailable}</span>
            <span className="stat-label">Unavailable</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{session.stats.ignored}</span>
            <span className="stat-label">Ignored</span>
          </div>
        </div>
      </div>
    );
  }

  if (session.status === 'error') {
    return (
      <div className="advanced-sync-container error">
        <h2>❌ Transfer Error</h2>
        <p>{session.error}</p>
      </div>
    );
  }

  return null;
};

