import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import './index.css';
 
const container = document.getElementById('root');
if (container) {
  try {
    console.log('Starting React app...');
    const root = createRoot(container);
    root.render(<App />);
    console.log('React app rendered successfully');
  } catch (error) {
    console.error('Error rendering React app:', error);
    // Render a simple error message instead of crashing
    container.innerHTML = `
      <div style="color: white; padding: 20px; font-family: Arial, sans-serif;">
        <h2>Error Loading App</h2>
        <p>There was an error loading the application:</p>
        <pre style="background: #333; padding: 10px; border-radius: 5px;">${error}</pre>
      </div>
    `;
  }
} else {
  console.error('Root element not found');
} 