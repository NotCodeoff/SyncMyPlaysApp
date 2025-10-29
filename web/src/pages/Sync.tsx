import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

export const Sync: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [status, setStatus] = useState<string>('idle');

  useEffect(() => {
    // Connect to WebSocket
    const newSocket = io('http://localhost:3001', {
      path: '/ws/socket.io',
      transports: ['websocket']
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected');
    });

    newSocket.on('sync-progress', (data) => {
      setProgress(data);
    });

    newSocket.on('sync-status', (data) => {
      setStatus(data.status);
    });

    newSocket.on('sync-complete', (data) => {
      console.log('Sync complete:', data);
      setStatus('completed');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold">Sync Playlists</h1>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
        <h2 className="text-2xl font-semibold mb-6">Transfer Your Music</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Source Platform
            </label>
            <select className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500">
              <option>Spotify</option>
              <option>Apple Music</option>
              <option>YouTube Music</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Destination Platform
            </label>
            <select className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500">
              <option>Apple Music</option>
              <option>Spotify</option>
              <option>YouTube Music</option>
            </select>
          </div>

          {status === 'syncing' && (
            <div className="mt-6 p-4 bg-gray-800 rounded-lg">
              <div className="flex justify-between text-sm text-gray-400 mb-2">
                <span>Syncing...</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-pink-500 to-red-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <button
            className="w-full px-6 py-4 bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-pink-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={status === 'syncing'}
          >
            {status === 'syncing' ? 'Syncing...' : 'Start Sync'}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 text-center">
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <div className="text-2xl font-bold text-green-500">95%+</div>
            <div className="text-xs text-gray-400 mt-1">Match Rate</div>
          </div>
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <div className="text-2xl font-bold text-blue-500">1.5s</div>
            <div className="text-xs text-gray-400 mt-1">Per 500 Tracks</div>
          </div>
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <div className="text-2xl font-bold text-purple-500">10x</div>
            <div className="text-xs text-gray-400 mt-1">Faster</div>
          </div>
        </div>
      </div>
    </div>
  );
};

