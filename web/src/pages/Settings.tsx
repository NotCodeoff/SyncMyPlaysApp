import React from 'react';

export const Settings: React.FC = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold">Settings</h1>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
        <h2 className="text-2xl font-semibold mb-6">Performance Settings</h2>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Parallel Requests
            </label>
            <input
              type="number"
              min="1"
              max="50"
              defaultValue="10"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Higher values = faster syncs (but more CPU usage)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Match Threshold
            </label>
            <input
              type="range"
              min="40"
              max="90"
              defaultValue="60"
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Lower = more matches (less strict), Higher = fewer matches (more strict)
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Audio Fingerprinting</div>
              <div className="text-sm text-gray-400">Use ACRCloud for better matching</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Redis Caching</div>
              <div className="text-sm text-gray-400">Cache matches for 24 hours</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
            </label>
          </div>

          <button className="w-full px-6 py-3 bg-pink-500 text-white rounded-xl font-semibold hover:bg-pink-600 transition-colors">
            Save Settings
          </button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
        <h2 className="text-2xl font-semibold mb-6">Cache Management</h2>

        <div className="space-y-4">
          <button className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors">
            Clear Match Cache
          </button>
          <button className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors">
            Clear Playlist Cache
          </button>
          <button className="w-full px-4 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors">
            Clear All Cache
          </button>
        </div>
      </div>
    </div>
  );
};

