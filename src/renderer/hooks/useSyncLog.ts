import { useState, useCallback } from 'react';

interface UseSyncLogOptions {
  maxEntries?: number;
  autoTrim?: boolean;
}

export const useSyncLog = (options: UseSyncLogOptions = {}) => {
  const { maxEntries = 2000, autoTrim = true } = options;
  const [syncLog, setSyncLog] = useState<string[]>([]);

  const addLogEntry = useCallback((entry: string) => {
    setSyncLog(prev => {
      const newLog = [...prev, entry];
      
      // Auto-trim if enabled and log is too long
      if (autoTrim && newLog.length > maxEntries) {
        // Keep the most recent entries and remove older ones
        const trimmedLog = newLog.slice(-maxEntries);
        
        // Add a note about trimming
        if (trimmedLog.length > 0 && !trimmedLog[0].includes('📝 Log trimmed')) {
          trimmedLog.unshift(`📝 Log trimmed: ${newLog.length - maxEntries} older entries removed to maintain performance`);
        }
        
        return trimmedLog;
      }
      
      return newLog;
    });
  }, [maxEntries, autoTrim]);

  const addMultipleLogEntries = useCallback((entries: string[]) => {
    setSyncLog(prev => {
      const newLog = [...prev, ...entries];
      
      // Auto-trim if enabled and log is too long
      if (autoTrim && newLog.length > maxEntries) {
        const trimmedLog = newLog.slice(-maxEntries);
        
        // Add a note about trimming
        if (trimmedLog.length > 0 && !trimmedLog[0].includes('📝 Log trimmed')) {
          trimmedLog.unshift(`📝 Log trimmed: ${newLog.length - maxEntries} older entries removed to maintain performance`);
        }
        
        return trimmedLog;
      }
      
      return newLog;
    });
  }, [maxEntries, autoTrim]);

  const clearLog = useCallback(() => {
    setSyncLog([]);
  }, []);

  const getLogStats = useCallback(() => {
    const total = syncLog.length;
    const successful = syncLog.filter(line => 
      line.includes('🎯 Matched:') || line.includes('✅ Matched:')
    ).length;
    const warnings = syncLog.filter(line => 
      line.includes('⚠️') || line.includes('differs') || line.includes('Warning')
    ).length;
    const errors = syncLog.filter(line => 
      line.includes('❌') || line.includes('Failed') || line.includes('Error')
    ).length;
    const info = total - successful - warnings - errors;
    
    return {
      total,
      successful,
      warnings,
      errors,
      info,
      successRate: total > 0 ? Math.round((successful / total) * 100) : 0
    };
  }, [syncLog]);

  const exportLog = useCallback((format: 'json' | 'csv' = 'json') => {
    const stats = getLogStats();
    const timestamp = new Date().toISOString();
    
    if (format === 'csv') {
      const csvContent = [
        ['Timestamp', 'Type', 'Message'],
        ...syncLog.map(line => {
          let type = 'Info';
          if (line.includes('✅')) type = 'Success';
          else if (line.includes('⚠️')) type = 'Warning';
          else if (line.includes('❌')) type = 'Error';
          
          return [timestamp, type, line.replace(/[✅⚠️❌]/g, '').trim()];
        })
      ].map(row => row.join(',')).join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sync-log-${timestamp.split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const report = {
        summary: stats,
        timestamp,
        logs: syncLog
      };
      
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sync-report-${timestamp.split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return {
    syncLog,
    addLogEntry,
    addMultipleLogEntries,
    clearLog,
    getLogStats,
    exportLog,
    isLarge: syncLog.length > 1000,
    isVeryLarge: syncLog.length > 5000
  };
};
