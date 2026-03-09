import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Singleton socket instance
let socketInstance = null;
let connectionCount = 0;

export function useSocket(quizCode) {
  const socketRef = useRef(null);
  const isConnectedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Initialize socket once
  useEffect(() => {
    if (!socketInstance) {
      console.log('[useSocket] Creating socket instance...');
      
      socketInstance = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: maxReconnectAttempts,
        timeout: 10000,
      });

      socketInstance.on('connect', () => {
        console.log('[useSocket] Socket connected:', socketInstance.id);
        isConnectedRef.current = true;
        reconnectAttemptsRef.current = 0;
      });

      socketInstance.on('disconnect', (reason) => {
        console.log('[useSocket] Socket disconnected:', reason);
        isConnectedRef.current = false;
        
        if (reason === 'io server disconnect') {
          console.log('[useSocket] Server disconnected, attempting reconnect...');
          socketInstance.connect();
        }
      });

      socketInstance.on('connect_error', (error) => {
        console.error('[useSocket] Connection error:', error.message);
        reconnectAttemptsRef.current++;
        
        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          console.error('[useSocket] Max reconnection attempts reached');
        }
      });
    }

    socketRef.current = socketInstance;

    // Cleanup on unmount
    return () => {
      connectionCount--;
      if (connectionCount <= 0 && socketInstance) {
        console.log('[useSocket] Cleaning up socket instance');
        socketInstance.disconnect();
        socketInstance = null;
      }
    };
  }, []);

  // Join/leave quiz room when quizCode changes
  useEffect(() => {
    if (!socketRef.current || !quizCode) return;

    const socket = socketRef.current;
    const normalizedCode = quizCode.toUpperCase();

    console.log('[useSocket] Joining quiz room:', normalizedCode);
    socket.emit('join_quiz', normalizedCode);
    connectionCount++;

    return () => {
      console.log('[useSocket] Leaving quiz room:', normalizedCode);
      socket.emit('leave_quiz', normalizedCode);
      connectionCount--;
    };
  }, [quizCode]);

  // Socket event listeners
  const on = useCallback((event, callback) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
      
      return () => {
        socketRef.current?.off(event, callback);
      };
    }
  }, []);

  // Emit socket events
  const emit = useCallback((event, ...args) => {
    if (socketRef.current) {
      socketRef.current.emit(event, ...args);
    }
  }, []);

  // Connection status
  const getStatus = useCallback(() => {
    if (!socketRef.current) return 'disconnected';
    if (isConnectedRef.current) return 'connected';
    return 'reconnecting';
  }, []);

  return {
    socket: socketRef.current,
    emit,
    on,
    getStatus,
    isConnected: isConnectedRef.current,
  };
}
