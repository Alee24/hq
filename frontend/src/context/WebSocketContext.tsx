import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

type WebSocketListener = (data: any) => void;

interface WebSocketContextType {
  connected: boolean;
  subscribe: (eventType: string, listener: WebSocketListener) => () => void;
  send: (data: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<WebSocketListener>>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let ws: WebSocket;
    let reconnectTimeout: any;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const eventType = data.event || 'message';
            const subscribers = listenersRef.current.get(eventType);
            if (subscribers) {
              subscribers.forEach(cb => cb(data));
            }
            // Global subscribers
            const allSubscribers = listenersRef.current.get('*');
            if (allSubscribers) {
              allSubscribers.forEach(cb => cb(data));
            }
          } catch {
            // Non-JSON ping/pong
          }
        };

        ws.onclose = () => {
          setConnected(false);
          reconnectTimeout = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        reconnectTimeout = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const subscribe = (eventType: string, listener: WebSocketListener) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType)!.add(listener);

    return () => {
      const set = listenersRef.current.get(eventType);
      if (set) {
        set.delete(listener);
      }
    };
  };

  const send = (data: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(data);
    }
  };

  return (
    <WebSocketContext.Provider value={{ connected, subscribe, send }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
