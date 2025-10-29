import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { Sync } from './pages/Sync';
import { History } from './pages/History';
import { Settings } from './pages/Settings';

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sync" element={<Sync />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

