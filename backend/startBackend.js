const path = require('path');
const { spawn } = require('child_process');
const { logToFile } = require('../utils/log');

let backendProcess = null;

function startBackend() {
  try {
    logToFile('INFO', 'Starting modernized backend server...');
    
    // Path to the new modernized backend server
    const serverPath = path.join(__dirname, 'src', 'server.js');
    
    // Start the new backend server
    backendProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });

    backendProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        logToFile('INFO', `Backend: ${output}`);
        console.log(`Backend: ${output}`);
      }
    });

    backendProcess.stderr.on('data', (data) => {
      const error = data.toString().trim();
      if (error) {
        logToFile('ERROR', `Backend Error: ${error}`);
        console.error(`Backend Error: ${error}`);
      }
    });

    backendProcess.on('close', (code) => {
      logToFile('INFO', `Backend process exited with code ${code}`);
      console.log(`Backend process exited with code ${code}`);
      
      // Restart the backend if it crashes (except on normal shutdown)
      if (code !== 0 && code !== null) {
        logToFile('WARN', 'Backend crashed, restarting in 5 seconds...');
        setTimeout(() => {
          startBackend();
        }, 5000);
      }
    });

    backendProcess.on('error', (error) => {
      logToFile('ERROR', `Failed to start backend: ${error.message}`);
      console.error(`Failed to start backend: ${error.message}`);
    });

    logToFile('INFO', 'Modernized backend server started successfully');
    console.log('Modernized backend server started successfully');
    
  } catch (error) {
    logToFile('ERROR', `Error starting backend: ${error.message}`);
    console.error(`Error starting backend: ${error.message}`);
  }
}

function stopBackend() {
  if (backendProcess) {
    logToFile('INFO', 'Stopping backend server...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

// Handle process termination
process.on('SIGINT', () => {
  logToFile('INFO', 'Received SIGINT, stopping backend...');
  stopBackend();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logToFile('INFO', 'Received SIGTERM, stopping backend...');
  stopBackend();
  process.exit(0);
});

module.exports = {
  startBackend,
  stopBackend
}; 
