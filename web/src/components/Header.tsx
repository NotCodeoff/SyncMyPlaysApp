import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaMusic, FaHistory, FaCog } from 'react-icons/fa';

export const Header: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: FaMusic },
    { path: '/sync', label: 'Sync', icon: FaMusic },
    { path: '/history', label: 'History', icon: FaHistory },
    { path: '/settings', label: 'Settings', icon: FaCog },
  ];

  return (
    <header className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link to="/" className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-red-500 bg-clip-text text-transparent">
              SyncMyPlays
            </Link>
            <span className="ml-3 px-2 py-1 text-xs bg-pink-500 text-white rounded-full">
              WEB
            </span>
          </div>

          <nav className="flex space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                  location.pathname === item.path
                    ? 'bg-pink-500 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
};

