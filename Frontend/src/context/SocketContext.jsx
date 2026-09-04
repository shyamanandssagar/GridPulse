import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [latestTick, setLatestTick] = useState(null);
  const [recentAnomalies, setRecentAnomalies] = useState([]);

  useEffect(() => {
    const url = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const socket = io(url, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('grid:tick', (tick) => setLatestTick(tick));

    socket.on('anomaly:new', (newOnes) => {
      setRecentAnomalies((prev) => [...newOnes, ...prev].slice(0, 50));
    });

    socket.on('feeder:fault', (e) => {
      setRecentAnomalies((prev) => [
        { _id: `fault-${e.feederId}-${Date.now()}`, type: 'outage', severity: 'critical', message: `Feeder ${e.name} faulted`, timestamp: new Date() },
        ...prev,
      ].slice(0, 50));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const value = useMemo(
    () => ({
      socket: socketRef.current,
      connected,
      latestTick,
      recentAnomalies,
    }),
    [connected, latestTick, recentAnomalies]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
