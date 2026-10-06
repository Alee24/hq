import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { EnvironmentProvider } from './context/EnvironmentContext';
import { ThemeProvider } from './context/ThemeContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { MainAppShell } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <EnvironmentProvider>
          <WebSocketProvider>
            <MainAppShell />
          </WebSocketProvider>
        </EnvironmentProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
