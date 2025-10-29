import React from 'react';
import { motion } from 'framer-motion';

// Skeleton loading components
export const SkeletonCard: React.FC<{ height?: string; width?: string }> = ({ 
  height = "200px", 
  width = "100%" 
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="skeleton-card"
    style={{
      height,
      width,
      background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
      backgroundSize: '200% 100%',
      borderRadius: '8px',
      animation: 'shimmer 1.5s infinite'
    }}
  />
);

export const SkeletonText: React.FC<{ lines?: number; height?: string }> = ({ 
  lines = 1, 
  height = "16px" 
}) => (
  <div className="skeleton-text-container">
    {Array.from({ length: lines }).map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: i * 0.1 }}
        className="skeleton-text"
        style={{
          height,
          background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
          backgroundSize: '200% 100%',
          borderRadius: '4px',
          marginBottom: i < lines - 1 ? '8px' : '0',
          animation: 'shimmer 1.5s infinite'
        }}
      />
    ))}
  </div>
);

export const SkeletonPlaylist: React.FC = () => (
  <div className="skeleton-playlist">
    <SkeletonCard height="120px" />
    <div style={{ padding: '16px' }}>
      <SkeletonText lines={2} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <SkeletonCard height="32px" width="80px" />
        <SkeletonCard height="32px" width="60px" />
      </div>
    </div>
  </div>
);

// Progress indicators
export const ProgressBar: React.FC<{
  current: number;
  total: number;
  status: string;
  showPercentage?: boolean;
}> = ({ current, total, status, showPercentage = true }) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  
  return (
    <motion.div className="progress-container">
      <div className="progress-header">
        <span className="progress-status">{status}</span>
        {showPercentage && (
          <span className="progress-percentage">{Math.round(percentage)}%</span>
        )}
      </div>
      <div className="progress-bar">
        <motion.div
          className="progress-fill"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <div className="progress-details">
        {current} of {total} items
      </div>
    </motion.div>
  );
};

export const CircularProgress: React.FC<{
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}> = ({ 
  percentage, 
  size = 60, 
  strokeWidth = 4, 
  color = "#007AFF" 
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="circular-progress"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#e0e0e0"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        initial={{ strokeDasharray, strokeDashoffset: circumference }}
        animate={{ strokeDashoffset }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dy=".3em"
        className="progress-text"
        fill="#333"
        fontSize="12"
        fontWeight="600"
      >
        {Math.round(percentage)}%
      </text>
    </motion.svg>
  );
};

// Loading spinners
export const Spinner: React.FC<{ size?: number; color?: string }> = ({ 
  size = 24, 
  color = "#007AFF" 
}) => (
  <motion.div
    className="spinner"
    style={{
      width: size,
      height: size,
      border: `2px solid #e0e0e0`,
      borderTop: `2px solid ${color}`,
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }}
  />
);

export const PulseLoader: React.FC<{ size?: number; color?: string }> = ({ 
  size = 8, 
  color = "#007AFF" 
}) => (
  <div className="pulse-loader">
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className="pulse-dot"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          borderRadius: '50%',
          margin: '0 2px'
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [1, 0.7, 1]
        }}
        transition={{
          duration: 1.4,
          repeat: Infinity,
          delay: i * 0.2
        }}
      />
    ))}
  </div>
);

// Smooth transitions
export const FadeIn: React.FC<{ children: React.ReactNode; delay?: number }> = ({ 
  children, 
  delay = 0 
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay, ease: "easeOut" }}
  >
    {children}
  </motion.div>
);

export const SlideIn: React.FC<{ 
  children: React.ReactNode; 
  direction?: 'left' | 'right' | 'up' | 'down';
  delay?: number;
}> = ({ children, direction = 'left', delay = 0 }) => {
  const variants = {
    left: { x: -50, opacity: 0 },
    right: { x: 50, opacity: 0 },
    up: { y: 50, opacity: 0 },
    down: { y: -50, opacity: 0 }
  };

  return (
    <motion.div
      initial={variants[direction]}
      animate={{ x: 0, y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
};

// Staggered animations for lists
export const StaggeredList: React.FC<{ 
  children: React.ReactNode[];
  staggerDelay?: number;
}> = ({ children, staggerDelay = 0.1 }) => (
  <div className="staggered-list">
    {children.map((child, index) => (
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ 
          duration: 0.5, 
          delay: index * staggerDelay, 
          ease: "easeOut" 
        }}
      >
        {child}
      </motion.div>
    ))}
  </div>
);

// CSS animations
const loadingStyles = `
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .progress-container {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0;
  }
  
  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  
  .progress-status {
    font-weight: 600;
    color: #333;
  }
  
  .progress-percentage {
    font-weight: 600;
    color: #007AFF;
  }
  
  .progress-bar {
    width: 100%;
    height: 8px;
    background: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #007AFF, #00B4FF);
    border-radius: 4px;
  }
  
  .progress-details {
    font-size: 12px;
    color: #666;
    text-align: center;
  }
  
  .skeleton-playlist {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  
  .skeleton-text-container {
    margin-top: 12px;
  }
  
  .pulse-loader {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .staggered-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
`;

// Inject styles
if (typeof document !== 'undefined' && !document.getElementById('loading-styles')) {
  const styleElement = document.createElement('style');
  styleElement.id = 'loading-styles';
  styleElement.textContent = loadingStyles;
  document.head.appendChild(styleElement);
}
