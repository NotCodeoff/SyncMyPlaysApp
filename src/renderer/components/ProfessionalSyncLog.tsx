import React, { useState, useMemo } from 'react';

interface SyncLogEntry {
  message: string;
  timestamp?: string;
  type?: 'success' | 'warning' | 'error' | 'info';
}

interface ProfessionalSyncLogProps {
  syncLog: string[];
  className?: string;
  finalStats?: {
    found: number;
    notFound: number;
    timestamp?: number;
  } | undefined;
}

const ProfessionalSyncLog: React.FC<ProfessionalSyncLogProps> = ({ syncLog, className = '', finalStats }) => {
  // Debug logging
  React.useEffect(() => {
    console.log('DEBUG: ProfessionalSyncLog received finalStats:', finalStats);
  }, [finalStats]);
  
  React.useEffect(() => {
    console.log('DEBUG: ProfessionalSyncLog mounted/updated with syncLog length:', syncLog.length);
  }, [syncLog.length]);

  const [statsVersion, setStatsVersion] = useState(0);

  React.useEffect(() => {
    if (finalStats?.found !== undefined && finalStats?.notFound !== undefined) {
      console.log('DEBUG: finalStats changed, forcing recalculation:', finalStats);
      setStatsVersion(prev => prev + 1);
    }
  }, [finalStats]);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    successful: true,
    warnings: true,
    errors: true,
    info: true
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Parse and categorize log entries
  const categorizedLogs = useMemo(() => {
    const categorized: Record<string, SyncLogEntry[]> = {
      successful: [],
      warnings: [],
      errors: [],
      info: []
    };

    syncLog.forEach((line, index) => {
      const entry: SyncLogEntry = { message: line };
      
      if (line.includes('🎯 Matched:') || line.includes('✅ Matched:')) {
        categorized.successful.push(entry);
      } else if (line.includes('⚠️') || line.includes('differs') || line.includes('Warning')) {
        categorized.warnings.push(entry);
      } else if (line.includes('❌') || line.includes('Failed') || line.includes('Error')) {
        // Include both individual error messages and summary error messages
        categorized.errors.push(entry);
      } else {
        categorized.info.push(entry);
      }
    });

    return categorized;
  }, [syncLog]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    console.log('DEBUG: Calculating summaryStats, finalStats:', finalStats, 'version:', statsVersion);
    
    const total = syncLog.length;
    const warnings = categorizedLogs.warnings.length;
    const info = categorizedLogs.info.length;
    
    // Check if sync is still in progress (has log entries but no finalStats yet)
    const hasSyncActivity = syncLog.some(log => 
      log.includes('Starting sync') || 
      log.includes('Processing track') || 
      log.includes('Matched:') || 
      log.includes('Not found:')
    );
    
    // FORCE use of backend stats if available
    if (finalStats?.found !== undefined && finalStats?.notFound !== undefined) {
      const successful = finalStats.found;
      const errors = finalStats.notFound;
      const successRate = (successful + errors) > 0 ? Math.round((successful / (successful + errors)) * 100) : 0;
      
      console.log('✅ Using backend final stats:', { successful, errors, warnings, info, successRate });
      
      return { total, successful, warnings, errors, info, successRate };
    }
    
    // If sync is in progress but no finalStats yet, show loading state
    if (hasSyncActivity && !finalStats) {
      console.log('⏳ Sync in progress, waiting for finalStats...');
      return { total, successful: 0, warnings: 0, errors: 0, info: 0, successRate: 0 };
    }
    
    // If no finalStats available, show error state
    if (!finalStats) {
      console.error('❌ No finalStats available - backend validation failed');
      return { total, successful: 0, warnings: 0, errors: 0, info: 0, successRate: 0 };
    }
    
    // This should never happen if finalStats is available
    console.error('❌ Unexpected fallback - finalStats should be available');
    return { total, successful: 0, warnings: 0, errors: 0, info: 0, successRate: 0 };
  }, [syncLog, categorizedLogs, finalStats, statsVersion, finalStats?.timestamp]);

  // Filter logs based on search term and type
  const filteredLogs = useMemo(() => {
    let logs = syncLog;
    
    if (searchTerm) {
      logs = logs.filter(line => 
        line.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (selectedType !== 'all') {
      logs = logs.filter(line => {
        if (selectedType === 'successful') return line.includes('🎯 Matched:') || line.includes('✅ Matched:');
        if (selectedType === 'warnings') return line.includes('⚠️') || line.includes('differs') || line.includes('Warning');
        if (selectedType === 'errors') {
          // Include individual error messages
          const hasIndividualErrors = line.includes('❌') || line.includes('Failed') || line.includes('Error');
          
          // Include summary error messages (like "1 songs not found") when they represent actual errors
          const hasSummaryErrors = line.includes('songs were not found') || line.includes('songs were not added');
          
          return hasIndividualErrors || hasSummaryErrors;
        }
        if (selectedType === 'info') return !line.includes('✅') && !line.includes('⚠️') && !line.includes('❌') && !line.includes('Matched') && !line.includes('Successfully') && !line.includes('differs') && !line.includes('Warning') && !line.includes('Failed') && !line.includes('Error');
        return true;
      });
    }
    
    return logs;
  }, [syncLog, searchTerm, selectedType]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const exportReport = () => {
    const report = {
      summary: summaryStats,
      timestamp: new Date().toISOString(),
      logs: syncLog
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const csvContent = [
      ['Timestamp', 'Type', 'Message'],
      ...syncLog.map(line => {
        let type = 'Info';
        if (line.includes('✅')) type = 'Success';
        else if (line.includes('⚠️')) type = 'Warning';
        else if (line.includes('❌')) type = 'Error';
        
        return [new Date().toISOString(), type, line.replace(/[✅⚠️❌]/g, '').trim()];
      })
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (syncLog.length === 0) {
    return (
      <div className={`professional-sync-log ${className}`}>
        <div className="sync-log-placeholder">
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>No Sync Activity</div>
            <div style={{ fontSize: '14px' }}>Sync logs will appear here when you start a sync operation</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`professional-sync-log ${className}`}>
      {/* Header with Export Options */}
      <div className="sync-log-header">
        <div className="header-left">
          <h3 style={{ margin: 0, color: '#fff' }}>Sync Progress Report</h3>
          <span style={{ color: '#aaa', fontSize: '12px' }}>
            {summaryStats.total} total entries • Last updated: {new Date().toLocaleTimeString()}
          </span>
        </div>
        <div className="header-right">
          <button 
            className="button secondary" 
            onClick={exportReport}
            style={{ fontSize: '12px', padding: '6px 12px', marginRight: '8px' }}
          >
            📊 Export Report
          </button>
          <button 
            className="button secondary" 
            onClick={exportCSV}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            📄 Export CSV
          </button>
        </div>
      </div>

      {/* Warning if backend stats not available */}
      {!finalStats && syncLog.length > 100 && (
        <div style={{
          background: '#ff9500',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '2px solid #ff9500',
          color: '#000'
        }}>
          <strong>⚠️ Warning:</strong> Using estimated statistics from log messages. 
          Backend validation not available.
        </div>
      )}

      {/* Success banner if backend stats available */}
      {finalStats && (
        <div style={{
          background: '#2a2a2a',
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '2px solid #1DB954'
        }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#1DB954' }}>
            ✅ Validated Statistics (from Apple Music API)
          </h4>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '8px' }}>
            <div>
              <strong style={{ color: '#1DB954', fontSize: '24px' }}>{finalStats.found}</strong>
              <div style={{ fontSize: '14px', color: '#aaa' }}>songs successfully added</div>
            </div>
            <div>
              <strong style={{ color: '#e94560', fontSize: '24px' }}>{finalStats.notFound}</strong>
              <div style={{ fontSize: '14px', color: '#aaa' }}>songs not found or unavailable</div>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: '#888', margin: '0' }}>
            ✓ Validated against actual Apple Music playlist contents
          </p>
        </div>
      )}

      {/* Summary Statistics */}
      <div className="summary-section">
        <div className="summary-header" onClick={() => toggleSection('summary')}>
          <span className="section-icon">📊</span>
          <span className="section-title">Summary Statistics</span>
          <span className="expand-icon">{expandedSections.summary ? '▼' : '▶'}</span>
        </div>
        {expandedSections.summary && (
          <div className="summary-content">
            <div className="stats-grid">
              <div className="stat-card success">
                <div className="stat-number">
                  {summaryStats.successful === 0 && !finalStats ? '...' : summaryStats.successful}
                </div>
                <div className="stat-label">Successful</div>
                <div className="stat-percentage">{summaryStats.successRate}%</div>
              </div>
              <div className="stat-card warning">
                <div className="stat-number">
                  {summaryStats.warnings === 0 && !finalStats ? '...' : summaryStats.warnings}
                </div>
                <div className="stat-label">Warnings</div>
                <div className="stat-percentage">{summaryStats.total > 0 ? Math.round((summaryStats.warnings / summaryStats.total) * 100) : 0}%</div>
              </div>
              <div className="stat-card error">
                <div className="stat-number">
                  {summaryStats.errors === 0 && !finalStats ? '...' : summaryStats.errors}
                </div>
                <div className="stat-label">Errors</div>
                <div className="stat-percentage">{summaryStats.total > 0 ? Math.round((summaryStats.errors / summaryStats.total) * 100) : 0}%</div>
              </div>
              <div className="stat-card info">
                <div className="stat-number">
                  {summaryStats.info === 0 && !finalStats ? '...' : summaryStats.info}
                </div>
                <div className="stat-label">Info</div>
                <div className="stat-percentage">{summaryStats.total > 0 ? Math.round((summaryStats.info / summaryStats.total) * 100) : 0}%</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search and Filter Controls */}
      <div className="filter-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <span className="search-icon">🔍</span>
        </div>
        <select 
          value={selectedType} 
          onChange={(e) => setSelectedType(e.target.value)}
          className="type-filter"
        >
          <option value="all">All Types</option>
          <option value="successful">Successful</option>
          <option value="warnings">Warnings</option>
          <option value="errors">Errors</option>
          <option value="info">Info</option>
        </select>
        <div className="filter-info">
          Showing {filteredLogs.length} of {syncLog.length} entries
        </div>
      </div>

      {/* Log Sections */}
      {Object.entries(categorizedLogs).map(([type, logs]) => {
        if (logs.length === 0) return null;
        
        // Apply type filter - only show sections that match the selected type
        if (selectedType !== 'all' && selectedType !== type) return null;
        
        const typeConfig = {
          successful: { icon: '✅', title: 'Successful Matches', color: '#1DB954' },
          warnings: { icon: '⚠️', title: 'Warnings & Differences', color: '#ff9500' },
          errors: { icon: '❌', title: 'Errors & Failures', color: '#e94560' },
          info: { icon: 'ℹ️', title: 'Information & Status', color: '#007AFF' }
        }[type] || { icon: 'ℹ️', title: 'Other', color: '#666' };

        // Filter logs within this section based on search term
        const filteredSectionLogs = searchTerm ? 
          logs.filter(entry => entry.message.toLowerCase().includes(searchTerm.toLowerCase())) :
          logs;

        if (filteredSectionLogs.length === 0) return null;

        return (
          <div key={type} className="log-section">
            <div 
              className="section-header" 
              onClick={() => toggleSection(type)}
              style={{ borderLeftColor: typeConfig.color }}
            >
              <span className="section-icon">{typeConfig.icon}</span>
              <span className="section-title">{typeConfig.title}</span>
              <span className="section-count">({filteredSectionLogs.length})</span>
              <span className="expand-icon">{expandedSections[type] ? '▼' : '▶'}</span>
            </div>
            {expandedSections[type] && (
              <div className="section-content">
                {filteredSectionLogs.map((entry, index) => (
                  <div key={`${type}-${index}`} className="log-entry">
                    <span className="log-message">{entry.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Quick Actions */}
      <div className="quick-actions">
        <button 
          className="button secondary"
          onClick={() => setExpandedSections({
            summary: true,
            successful: true,
            warnings: true,
            errors: true,
            info: true
          })}
        >
          📖 Expand All
        </button>
        <button 
          className="button secondary"
          onClick={() => setExpandedSections({
            summary: false,
            successful: false,
            warnings: false,
            errors: false,
            info: false
          })}
        >
          📕 Collapse All
        </button>
        <button 
          className="button secondary"
          onClick={() => {
            setSearchTerm('');
            setSelectedType('all');
          }}
        >
          🔄 Clear Filters
        </button>
      </div>
    </div>
  );
};

export default ProfessionalSyncLog;
