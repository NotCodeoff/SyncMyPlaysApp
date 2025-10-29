import React, { useState, useEffect } from 'react';
import './SongShiftReview.css';

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

interface SongShiftReviewProps {
  reviewItems: ReviewItem[];
  unavailableItems: ReviewItem[];
  onComplete: (decisions: Array<{trackIndex: number, action: 'select' | 'ignore', selectedVariantId?: string}>) => void;
  onClose: () => void;
}

export const SongShiftReview: React.FC<SongShiftReviewProps> = ({
  reviewItems,
  unavailableItems,
  onComplete,
  onClose
}) => {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [selectedAlternatives, setSelectedAlternatives] = useState<Map<number, string>>(new Map());
  const [ignoredTracks, setIgnoredTracks] = useState<Set<number>>(new Set());

  const currentItem = reviewItems[currentTrackIndex];
  const totalTracks = reviewItems.length + unavailableItems.length;

  const handleSelectAlternative = (trackIndex: number, alternativeId: string) => {
    const newSelected = new Map(selectedAlternatives);
    newSelected.set(trackIndex, alternativeId);
    setSelectedAlternatives(newSelected);
    
    // Remove from ignored if it was there
    const newIgnored = new Set(ignoredTracks);
    newIgnored.delete(trackIndex);
    setIgnoredTracks(newIgnored);
  };

  const handleIgnoreTrack = (trackIndex: number) => {
    const newIgnored = new Set(ignoredTracks);
    newIgnored.add(trackIndex);
    setIgnoredTracks(newIgnored);
    
    // Remove from selected if it was there
    const newSelected = new Map(selectedAlternatives);
    newSelected.delete(trackIndex);
    setSelectedAlternatives(newSelected);
  };

  const handleSave = () => {
    const decisions: Array<{trackIndex: number, action: 'select' | 'ignore', selectedVariantId?: string}> = [];
    
    // Add selected alternatives
    selectedAlternatives.forEach((selectedId, trackIndex) => {
      decisions.push({
        trackIndex,
        action: 'select',
        selectedVariantId: selectedId
      });
    });
    
    // Add ignored tracks
    ignoredTracks.forEach(trackIndex => {
      decisions.push({
        trackIndex,
        action: 'ignore'
      });
    });
    
    onComplete(decisions);
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return '#4CAF50';
      case 'medium': return '#FF9800';
      case 'low': return '#FF5722';
      default: return '#9E9E9E';
    }
  };

  if (!currentItem) {
    return (
      <div className="songshift-review-overlay">
        <div className="songshift-review-dialog">
          <div className="review-header">
            <h2>Review Complete</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          <div className="review-summary">
            <p>All tracks have been reviewed. Click Save to apply your selections.</p>
          </div>
          <div className="review-actions">
            <button className="save-button" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="songshift-review-overlay">
      <div className="songshift-review-dialog">
        {/* Header */}
        <div className="review-header">
          <h2>Review Alternatives</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="review-instructions">
          <p>{reviewItems.length} songs need review. To add them to your library, select an alternative version.</p>
          <button className="ignore-all-button" onClick={() => {
            const allIgnored = new Set(Array.from({length: reviewItems.length}, (_, i) => i));
            setIgnoredTracks(allIgnored);
            setSelectedAlternatives(new Map());
          }}>Ignore All</button>
        </div>

        {/* Current Track Info */}
        <div className="current-track-info">
          <div className="track-counter">
            Track {currentTrackIndex + 1} of {reviewItems.length}
          </div>
          <div className="original-track">
            <h3>Original Track</h3>
            <div className="track-card original">
              <div className="track-info">
                <div className="track-name">{currentItem.sourceTrack.name}</div>
                <div className="track-artist">{currentItem.sourceTrack.artists.join(', ')}</div>
                <div className="track-album">{currentItem.sourceTrack.album}</div>
                <div className="track-duration">{formatDuration(currentItem.sourceTrack.duration_ms)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Alternate Versions */}
        <div className="alternate-versions-section">
          <h3>Alternate Versions</h3>
          <div className="alternatives-list">
            {/* Recommended Match */}
            {currentItem.match && (
              <div 
                className={`track-card alternative ${selectedAlternatives.get(currentTrackIndex) === currentItem.match.id ? 'selected' : ''}`}
                onClick={() => handleSelectAlternative(currentTrackIndex, currentItem.match!.id)}
              >
                {currentItem.match.attributes.artwork && (
                  <img 
                    src={currentItem.match.attributes.artwork.url.replace('{w}', '100').replace('{h}', '100')} 
                    alt="Album art" 
                    className="track-artwork" 
                  />
                )}
                <div className="track-info">
                  <div className="track-name">
                    {currentItem.match.attributes.name}
                    {currentItem.match.attributes.name.toLowerCase().includes('explicit') && (
                      <span className="explicit-badge">E</span>
                    )}
                  </div>
                  <div className="track-artist">Song - {currentItem.match.attributes.artistName}</div>
                  <div className="track-album">In {currentItem.match.attributes.albumName}</div>
                  <div className="track-duration">{formatDuration(currentItem.match.attributes.durationInMillis)}</div>
                  <div className="match-info">
                    <span 
                      className="confidence-badge" 
                      style={{ backgroundColor: getConfidenceColor(currentItem.match.confidence) }}
                    >
                      {currentItem.match.confidence.toUpperCase()}
                    </span>
                    <span className="match-method">{currentItem.match.matchMethod}</span>
                    <span className="match-time">{currentItem.match.matchTime}ms</span>
                  </div>
                </div>
                <div className="selection-indicator">
                  {selectedAlternatives.get(currentTrackIndex) === currentItem.match.id ? (
                    <div className="selected-arrow">✓</div>
                  ) : (
                    <div className="arrow">›</div>
                  )}
                </div>
              </div>
            )}

            {/* Alternative Options */}
            {currentItem.alternatives.map((alt, idx) => (
              <div 
                key={alt.id}
                className={`track-card alternative ${selectedAlternatives.get(currentTrackIndex) === alt.id ? 'selected' : ''}`}
                onClick={() => handleSelectAlternative(currentTrackIndex, alt.id)}
              >
                {alt.attributes.artwork ? (
                  <img 
                    src={alt.attributes.artwork.url.replace('{w}', '100').replace('{h}', '100')} 
                    alt="Album art" 
                    className="track-artwork" 
                  />
                ) : (
                  <div className="placeholder-artwork">
                    <div className="play-icon">▶</div>
                  </div>
                )}
                <div className="track-info">
                  <div className="track-name">
                    {alt.attributes.name}
                    {alt.attributes.name.toLowerCase().includes('explicit') && (
                      <span className="explicit-badge">E</span>
                    )}
                  </div>
                  <div className="track-artist">{alt.attributes.artistName} - {alt.attributes.albumName}</div>
                  <div className="track-duration">{formatDuration(alt.attributes.durationInMillis)}</div>
                  <div className="match-info">
                    <span 
                      className="confidence-badge" 
                      style={{ backgroundColor: getConfidenceColor(alt.confidence) }}
                    >
                      {alt.confidence.toUpperCase()}
                    </span>
                    <span className="match-method">{alt.matchMethod}</span>
                    {alt.score && <span className="match-score">Score: {alt.score}</span>}
                  </div>
                </div>
                <div className="selection-indicator">
                  {selectedAlternatives.get(currentTrackIndex) === alt.id ? (
                    <div className="selected-arrow">✓</div>
                  ) : (
                    <div className="radio-button"></div>
                  )}
                </div>
              </div>
            ))}

            {/* Ignore Option */}
            <div 
              className={`track-card ignore-option ${ignoredTracks.has(currentTrackIndex) ? 'selected' : ''}`}
              onClick={() => handleIgnoreTrack(currentTrackIndex)}
            >
              <div className="ignore-icon">🚫</div>
              <div className="ignore-text">Ignore Song</div>
              <div className="selection-indicator">
                {ignoredTracks.has(currentTrackIndex) ? (
                  <div className="selected-arrow">✓</div>
                ) : (
                  <div className="radio-button"></div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="review-navigation">
          <button 
            className="nav-button"
            disabled={currentTrackIndex === 0}
            onClick={() => setCurrentTrackIndex(currentTrackIndex - 1)}
          >
            ← Previous
          </button>
          <span className="progress-indicator">
            {currentTrackIndex + 1} of {reviewItems.length}
          </span>
          <button 
            className="nav-button"
            disabled={currentTrackIndex === reviewItems.length - 1}
            onClick={() => setCurrentTrackIndex(currentTrackIndex + 1)}
          >
            Next →
          </button>
        </div>

        {/* Not Available Section */}
        {unavailableItems.length > 0 && (
          <div className="not-available-section">
            <h3>Not Available</h3>
            <div className="unavailable-list">
              {unavailableItems.slice(0, 5).map((item, idx) => (
                <div key={idx} className="track-card unavailable">
                  <div className="track-info">
                    <div className="track-name">{item.sourceTrack.name}</div>
                    <div className="track-artist">{item.sourceTrack.artists.join(', ')}</div>
                    <div className="track-album">{item.sourceTrack.album}</div>
                  </div>
                </div>
              ))}
              {unavailableItems.length > 5 && (
                <div className="more-unavailable">
                  +{unavailableItems.length - 5} more unavailable
                </div>
              )}
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="review-actions">
          <button 
            className="save-button"
            onClick={handleSave}
            disabled={selectedAlternatives.size === 0 && ignoredTracks.size === 0}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
