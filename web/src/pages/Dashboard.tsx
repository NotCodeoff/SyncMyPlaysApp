import React from 'react';
import { Link } from 'react-router-dom';
import { FaSpotify, FaApple, FaYoutube, FaArrowRight } from 'react-icons/fa';

export const Dashboard: React.FC = () => {
  return (
    <div className="space-y-8">
      <div className="text-center py-12">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-pink-500 to-red-500 bg-clip-text text-transparent">
          Welcome to SyncMyPlays
        </h1>
        <p className="text-xl text-gray-400 mb-8">
          High-performance playlist synchronization with professional-level accuracy
        </p>
        <Link
          to="/sync"
          className="inline-flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-pink-500/50 transition-all"
        >
          <span>Start Syncing</span>
          <FaArrowRight />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-pink-500 transition-colors">
          <div className="flex items-center space-x-4 mb-4">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <FaSpotify className="w-8 h-8 text-green-500" />
            </div>
            <div>
              <h3 className="text-xl font-semibold">Spotify</h3>
              <p className="text-sm text-gray-400">Connect your account</p>
            </div>
          </div>
          <button className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
            Connect Spotify
          </button>
        </div>

        <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-pink-500 transition-colors">
          <div className="flex items-center space-x-4 mb-4">
            <div className="p-3 bg-pink-500/10 rounded-lg">
              <FaApple className="w-8 h-8 text-pink-500" />
            </div>
            <div>
              <h3 className="text-xl font-semibold">Apple Music</h3>
              <p className="text-sm text-gray-400">Connect your account</p>
            </div>
          </div>
          <button className="w-full px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors">
            Connect Apple Music
          </button>
        </div>

        <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-pink-500 transition-colors">
          <div className="flex items-center space-x-4 mb-4">
            <div className="p-3 bg-red-500/10 rounded-lg">
              <FaYoutube className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h3 className="text-xl font-semibold">YouTube</h3>
              <p className="text-sm text-gray-400">Connect your account</p>
            </div>
          </div>
          <button className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
            Connect YouTube
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
        <div className="p-6 bg-gradient-to-br from-pink-500/10 to-red-500/10 rounded-xl border border-pink-500/20">
          <div className="text-3xl font-bold text-pink-500">10x</div>
          <div className="text-sm text-gray-400 mt-2">Faster Sync Speed</div>
        </div>

        <div className="p-6 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-xl border border-blue-500/20">
          <div className="text-3xl font-bold text-blue-500">96%+</div>
          <div className="text-sm text-gray-400 mt-2">Match Accuracy</div>
        </div>

        <div className="p-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl border border-green-500/20">
          <div className="text-3xl font-bold text-green-500">Real-time</div>
          <div className="text-sm text-gray-400 mt-2">Live Updates</div>
        </div>

        <div className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/20">
          <div className="text-3xl font-bold text-purple-500">Smart</div>
          <div className="text-sm text-gray-400 mt-2">AI Matching</div>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 mt-8">
        <h2 className="text-2xl font-bold mb-4">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start space-x-3">
            <div className="text-pink-500 text-xl">✓</div>
            <div>
              <h4 className="font-semibold">Professional-Level Accuracy</h4>
              <p className="text-sm text-gray-400">Industry-leading 96%+ match rate</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="text-pink-500 text-xl">✓</div>
            <div>
              <h4 className="font-semibold">10x Faster Performance</h4>
              <p className="text-sm text-gray-400">Parallel processing for maximum speed</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="text-pink-500 text-xl">✓</div>
            <div>
              <h4 className="font-semibold">Audio Fingerprinting</h4>
              <p className="text-sm text-gray-400">ACRCloud integration for perfect matches</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="text-pink-500 text-xl">✓</div>
            <div>
              <h4 className="font-semibold">Transfer History & Undo</h4>
              <p className="text-sm text-gray-400">Review and undo past transfers</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="text-pink-500 text-xl">✓</div>
            <div>
              <h4 className="font-semibold">Real-time Updates</h4>
              <p className="text-sm text-gray-400">WebSocket-powered live progress</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="text-pink-500 text-xl">✓</div>
            <div>
              <h4 className="font-semibold">Smart Caching</h4>
              <p className="text-sm text-gray-400">Redis-powered performance boost</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

