import React, { useState, useEffect } from 'react';
import './TrackProgressionModal.css';

interface TrackInfo {
  name: string;
  artist: string;
  index: number;
}

interface TrackProgressionModalProps {
  isVisible: boolean;
  currentTrack: TrackInfo | null;
  progress: {
    current: number;
    total: number;
    currentStep: string;
    status: string;
    eta: string;
  };
  onNext: () => void;
  onSkip: () => void;
  onPause: () => void;
  onResume: () => void;
  onClose: () => void;
}

const TrackProgressionModal: React.FC<TrackProgressionModalProps> = ({
  isVisible,
  currentTrack,
  progress,
  onNext,
  onSkip,
  onPause,
  onResume,
  onClose
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isVisible && !isPaused && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            // Auto-progress when timeout reaches 0
            onNext();
            return 300; // Reset for next track
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isVisible, isPaused, timeRemaining, onNext]);

  useEffect(() => {
    // Reset timer when track changes
    setTimeRemaining(300);
  }, [currentTrack?.index]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePauseResume = () => {
    if (isPaused) {
      onResume();
      setIsPaused(false);
    } else {
      onPause();
      setIsPaused(true);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="track-progression-modal-overlay">
      <div className="track-progression-modal">
        <div className="modal-header">
          <h2>🎵 Track Progression Control</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="progress-section">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <div className="progress-text">
            {progress.current} / {progress.total} tracks
          </div>
        </div>

        {currentTrack && (
          <div className="current-track-section">
            <h3>Current Track:</h3>
            <div className="track-info">
              <div className="track-name">{currentTrack.name}</div>
              <div className="track-artist">by {currentTrack.artist}</div>
            </div>
          </div>
        )}

        <div className="status-section">
          <div className="status-text">{progress.currentStep}</div>
          <div className="eta-text">ETA: {progress.eta}</div>
        </div>

        <div className="timer-section">
          <div className="timer-label">Auto-progress in:</div>
          <div className={`timer ${timeRemaining < 60 ? 'warning' : ''}`}>
            {formatTime(timeRemaining)}
          </div>
        </div>

        <div className="controls-section">
          <button 
            className="control-button primary" 
            onClick={onNext}
            disabled={isPaused}
          >
            ✅ Track Added - Next
          </button>
          
          <button 
            className="control-button secondary" 
            onClick={onSkip}
            disabled={isPaused}
          >
            ⏭️ Skip Track
          </button>
          
          <button 
            className="control-button tertiary" 
            onClick={handlePauseResume}
          >
            {isPaused ? '▶️ Resume' : '⏸️ Pause'}
          </button>
        </div>

        <div className="instructions-section">
          <h4>Instructions:</h4>
          <ol>
            <li>Complete any Google verification checks if needed</li>
            <li>Click on an Apple Music link in the search results</li>
            <li>Add the track to your playlist on Apple Music</li>
            <li>Click "Track Added - Next" to continue</li>
            <li>Or click "Skip Track" if the track cannot be found</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default TrackProgressionModal; 