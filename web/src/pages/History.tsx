import React, { useState, useEffect } from 'react';
import { FaUndo, FaRedo, FaTrash, FaCheck, FaTimes } from 'react-icons/fa';

interface Transfer {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  sourceService: string;
  sourcePlaylistName: string;
  destinationService: string;
  destinationPlaylistName: string;
  results?: {
    matched: number;
    unavailable: number;
    successRate: number;
  };
}

export const History: React.FC = () => {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/history');
      const data = await response.json();
      setTransfers(data.transfers || []);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async (transferId: string) => {
    if (!confirm('Are you sure you want to undo this transfer? This will delete the destination playlist.')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/history/${transferId}/undo`, {
        method: 'POST'
      });

      if (response.ok) {
        alert('Transfer undone successfully!');
        fetchHistory();
      }
    } catch (error) {
      console.error('Undo failed:', error);
      alert('Failed to undo transfer');
    }
  };

  const handleReplay = async (transferId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/history/${transferId}/replay`, {
        method: 'POST'
      });

      if (response.ok) {
        alert('Transfer replayed successfully! Check the sync page.');
      }
    } catch (error) {
      console.error('Replay failed:', error);
      alert('Failed to replay transfer');
    }
  };

  const handleDelete = async (transferId: string) => {
    if (!confirm('Delete this transfer record?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/history/${transferId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchHistory();
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <FaCheck className="text-green-500" />;
      case 'failed':
        return <FaTimes className="text-red-500" />;
      default:
        return <div className="spinner w-4 h-4" />;
    }
  };

  const getServiceIcon = (service: string) => {
    switch (service.toLowerCase()) {
      case 'spotify':
        return '🎵';
      case 'apple':
      case 'applemusic':
        return '🍎';
      case 'youtube':
        return '📺';
      default:
        return '🎶';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner w-12 h-12" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-bold">Transfer History</h1>
        <button
          onClick={fetchHistory}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {transfers.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-400 text-lg">No transfer history yet</p>
          <p className="text-gray-500 text-sm mt-2">Start syncing playlists to see your history here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {transfers.map((transfer) => (
            <div
              key={transfer.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6 hover:border-pink-500 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    {getStatusIcon(transfer.status)}
                    <h3 className="text-lg font-semibold">
                      {transfer.sourcePlaylistName || 'Unnamed Playlist'}
                    </h3>
                  </div>

                  <div className="flex items-center space-x-2 text-sm text-gray-400 mb-4">
                    <span className="flex items-center space-x-1">
                      <span>{getServiceIcon(transfer.sourceService)}</span>
                      <span>{transfer.sourceService}</span>
                    </span>
                    <span>→</span>
                    <span className="flex items-center space-x-1">
                      <span>{getServiceIcon(transfer.destinationService)}</span>
                      <span>{transfer.destinationService}</span>
                    </span>
                  </div>

                  {transfer.results && (
                    <div className="flex space-x-6 text-sm">
                      <div>
                        <span className="text-green-500 font-semibold">{transfer.results.matched}</span>
                        <span className="text-gray-400 ml-1">matched</span>
                      </div>
                      <div>
                        <span className="text-red-500 font-semibold">{transfer.results.unavailable}</span>
                        <span className="text-gray-400 ml-1">unavailable</span>
                      </div>
                      <div>
                        <span className="text-blue-500 font-semibold">
                          {transfer.results.successRate.toFixed(1)}%
                        </span>
                        <span className="text-gray-400 ml-1">success rate</span>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 mt-2">
                    {new Date(transfer.startedAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex space-x-2">
                  {transfer.status === 'completed' && (
                    <>
                      <button
                        onClick={() => handleUndo(transfer.id)}
                        className="p-2 bg-gray-800 text-yellow-500 rounded-lg hover:bg-gray-700 transition-colors"
                        title="Undo Transfer"
                      >
                        <FaUndo />
                      </button>
                      <button
                        onClick={() => handleReplay(transfer.id)}
                        className="p-2 bg-gray-800 text-blue-500 rounded-lg hover:bg-gray-700 transition-colors"
                        title="Replay Transfer"
                      >
                        <FaRedo />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDelete(transfer.id)}
                    className="p-2 bg-gray-800 text-red-500 rounded-lg hover:bg-gray-700 transition-colors"
                    title="Delete Record"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

