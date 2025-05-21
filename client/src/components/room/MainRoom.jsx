import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import PhaserGame from '../game/PhaserGame';
import { roomAPI } from '../../utils/api';

export const MainRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { socket: globalSocket, isConnected: isGlobalSocketConnected } = useSocket();
  const [socket, setSocket] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isDataReady, setIsDataReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState(null);
  const [lobbyRoomId, setLobbyRoomId] = useState(null);
  const messagesEndRef = useRef(null);
  const gameContainerRef = useRef(null);
  const [joinAttempts, setJoinAttempts] = useState(0);
  const MAX_JOIN_ATTEMPTS = 3;
  const JOIN_RETRY_DELAY = 2000; // 2 seconds

  // Add socket connection status logging
  useEffect(() => {
    if (globalSocket) {
      console.log('Socket connection status:', {
        id: globalSocket.id,
        connected: globalSocket.connected,
        hasListeners: {
          roomState: !!globalSocket.listeners('roomState').length,
          error: !!globalSocket.listeners('error').length,
          disconnect: !!globalSocket.listeners('disconnect').length,
          connect: !!globalSocket.listeners('connect').length
        },
        timestamp: new Date().toISOString()
      });

      // Log all socket events for debugging
      const logEvent = (eventName, ...args) => {
        console.log(`Socket event [${eventName}]:`, {
          args,
          timestamp: new Date().toISOString()
        });
      };

      const events = ['connect', 'disconnect', 'error', 'connect_error', 'reconnect', 'reconnect_attempt', 'reconnect_error'];
      events.forEach(event => {
        globalSocket.on(event, (...args) => logEvent(event, ...args));
      });

      return () => {
        events.forEach(event => {
          globalSocket.off(event, logEvent);
        });
      };
    }
  }, [globalSocket]);

  
  useEffect(() => {
    let mounted = true;
    let retryTimeout = null;
    setIsInitializing(true);
    setIsDataReady(false);
    setJoinAttempts(0);

    const initializeRoom = async () => {
      if (!user || !globalSocket) {
        console.log('Waiting for user or socket:', {
          hasUser: !!user,
          hasGlobalSocket: !!globalSocket,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Wait for socket to be connected with timeout
      const waitForSocketConnection = () => new Promise((resolve, reject) => {
        if (globalSocket.connected) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          globalSocket.off('connect', connectHandler);
          reject(new Error('Socket connection timeout'));
        }, 5000);

        const connectHandler = () => {
          clearTimeout(timeout);
          globalSocket.off('connect', connectHandler);
          resolve();
        };

        globalSocket.on('connect', connectHandler);
      });

      try {
        // Wait for socket connection
        await waitForSocketConnection();

        if (!roomId) {
          throw new Error('No room ID provided');
        }

        console.log('Socket connected, initializing room:', {
          roomId,
          userId: user._id,
          username: user.username,
          socketId: globalSocket.id,
          socketConnected: globalSocket.connected,
          joinAttempt: joinAttempts + 1,
          timestamp: new Date().toISOString()
        });

        // Set up room state handlers
        const handleRoomState = (state) => {
          if (!mounted) return;
          
          console.log('Received room state update:', {
            roomId: state?._id,
            name: state?.name,
            participants: state?.participants?.length || 0,
            socketId: globalSocket.id,
            timestamp: new Date().toISOString()
          });

          setRoomState(prevState => ({
            ...state,
            participants: state.participants || [],
            objects: state.objects || []
          }));
          setSocket(globalSocket);
          setIsDataReady(true);
          setJoinAttempts(0);
          setIsInitializing(false);
        };

        // Join room with retry logic
        const attemptJoinRoom = async () => {
          if (joinAttempts >= MAX_JOIN_ATTEMPTS) {
            throw new Error(`Failed to join room after ${MAX_JOIN_ATTEMPTS} attempts`);
          }

          try {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for room join'));
              }, 5000);

              console.log('Attempting to join room:', {
                roomId,
                socketId: globalSocket.id,
                socketConnected: globalSocket.connected,
                attempt: joinAttempts + 1,
                timestamp: new Date().toISOString()
              });

              globalSocket.emit('joinRoom', roomId, (response) => {
                clearTimeout(timeout);
                
                if (response?.error) {
                  reject(new Error(response.error));
                } else {
                  setSocket(globalSocket);
                  setIsInitializing(false);
                  resolve(response);
                }
              });
            });

            if (mounted) {
              setJoinAttempts(0);
            }
          } catch (error) {
            console.error('Join attempt failed:', {
              error: error.message,
              socketId: globalSocket.id,
              socketConnected: globalSocket.connected,
              attempt: joinAttempts + 1,
              timestamp: new Date().toISOString()
            });

            if (mounted && joinAttempts < MAX_JOIN_ATTEMPTS - 1) {
              setJoinAttempts(prev => prev + 1);
              retryTimeout = setTimeout(() => {
                attemptJoinRoom();
              }, JOIN_RETRY_DELAY);
            } else {
              throw error;
            }
          }
        };

        // Set up event handlers
        globalSocket.on('roomState', handleRoomState);
        globalSocket.on('error', (error) => {
          console.error('Room error:', error);
          if (mounted) {
            setError(error.message);
            setIsDataReady(false);
          }
        });

        // Attempt to join room
        await attemptJoinRoom();

      } catch (error) {
        console.error('Room initialization error:', {
          error: error.message,
          roomId,
          socketId: globalSocket?.id,
          socketConnected: globalSocket?.connected,
          finalAttempt: joinAttempts + 1,
          timestamp: new Date().toISOString()
        });
        
        if (mounted) {
          setError(`Failed to join room: ${error.message}`);
          setIsInitializing(false);
          setIsDataReady(false);
        }
      }
    };

    initializeRoom();

    return () => {
      mounted = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      if (globalSocket) {
        globalSocket.off('roomState');
        globalSocket.off('error');
        globalSocket.emit('leaveRoom', roomId);
      }
      setIsDataReady(false);
      setJoinAttempts(0);
    };
  }, [user, globalSocket, roomId]);

  // Handle player movement
  const handlePlayerMove = useCallback((newPosition) => {
    if (!socket?.connected || !user || !lobbyRoomId) {
      console.warn('Cannot send movement update:', {
        hasSocket: !!socket,
        socketConnected: socket?.connected,
        hasUser: !!user,
        hasLobbyRoomId: !!lobbyRoomId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Update local state immediately for smooth movement
    setRoomState(prevState => {
      if (!prevState) return prevState;

      const updatedParticipants = prevState.participants.map(participant => {
        if (participant.user._id === user._id) {
          return {
            ...participant,
            lastPosition: { ...participant.position },
            position: newPosition
          };
        }
        return participant;
      });

      return {
        ...prevState,
        participants: updatedParticipants,
        _lastUpdate: Date.now()
      };
    });

    // Send movement update to server
    socket.emit('userMove', { position: newPosition });
  }, [socket, user, lobbyRoomId]);

  // Handle user joined/left events
  useEffect(() => {
    if (!socket) return;

    const handleUserJoined = (data) => {
      console.log('User joined:', {
        userId: data.userId,
        username: data.username,
        timestamp: new Date().toISOString()
      });
    };

    const handleUserLeft = (data) => {
      console.log('User left:', {
        userId: data.userId,
        username: data.username,
        timestamp: new Date().toISOString()
      });
    };

    socket.on('userJoined', handleUserJoined);
    socket.on('userLeft', handleUserLeft);

    return () => {
      socket.off('userJoined', handleUserJoined);
      socket.off('userLeft', handleUserLeft);
    };
  }, [socket]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle chat messages
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      console.log('Received new message:', {
        messageId: message._id,
        sender: message.user?.username,
        timestamp: new Date().toISOString()
      });

      // Add message to state with proper formatting
      setMessages(prev => [...prev, {
        ...message,
        createdAt: new Date(message.createdAt),
        type: message.type || 'chat'
      }]);

      // Scroll to bottom after a short delay to ensure smooth scrolling
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    };

    const handleSystemMessage = (message) => {
      console.log('Received system message:', {
        message: message.text,
        timestamp: new Date().toISOString()
      });

      setMessages(prev => [...prev, {
        type: 'system',
        message: message.text,
        createdAt: new Date()
      }]);

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('systemMessage', handleSystemMessage);

    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('systemMessage', handleSystemMessage);
    };
  }, [socket]);

  // Handle sending messages
  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!newMessage.trim() || !socket?.connected || !roomState?._id) {
      console.warn('Cannot send message:', {
        hasMessage: !!newMessage.trim(),
        socketConnected: socket?.connected,
        hasRoomId: !!roomState?._id,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const messageText = newMessage.trim();
    setNewMessage(''); // Clear input immediately for better UX

    try {
      // Optimistically add message to UI
      const tempMessage = {
        _id: Date.now().toString(), // Temporary ID
        message: messageText,
        user: {
          _id: user._id,
          username: user.username,
          avatar: user.avatar
        },
        createdAt: new Date(),
        type: 'chat',
        isPending: true // Mark as pending until server confirms
      };

      setMessages(prev => [...prev, tempMessage]);

      // Send to server
      socket.emit('chatMessage', { message: messageText }, (response) => {
        if (response?.error) {
          console.error('Chat error:', response.error);
          setError('Failed to send message: ' + response.error);
          
          // Remove failed message
          setMessages(prev => prev.filter(m => m._id !== tempMessage._id));
          
          // Restore message text
          setNewMessage(messageText);
        } else {
          // Update message with server response
          setMessages(prev => prev.map(m => 
            m._id === tempMessage._id 
              ? { ...m, _id: response.messageId, isPending: false }
              : m
          ));
        }
      });
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message. Please try again.');
      setNewMessage(messageText); // Restore message text
    }
  };

  const handleLogout = () => {
    if (socket) {
      socket.close();
    }
    logout();
  };

  // Add debug logging for component state
  useEffect(() => {
    console.log('MainRoom component state:', {
      socket: socket ? {
        id: socket.id,
        connected: socket.connected,
        hasHandlers: !!socket.listeners('roomState').length
      } : null,
      roomState: roomState ? {
        id: roomState._id,
        name: roomState.name,
        participantsCount: roomState.participants?.length,
        objectsCount: roomState.objects?.length
      } : null,
      user: user ? {
        id: user._id,
        username: user.username
      } : null,
      isInitializing,
      isDataReady,
      timestamp: new Date().toISOString()
    });
  }, [socket, roomState, user, isInitializing, isDataReady]);

  // Render game only when all data is ready
  const renderGame = () => {
    // Log the current state before rendering
    console.log('Rendering game with state:', {
      isDataReady,
      hasSocket: !!socket,
      socketConnected: socket?.connected,
      socketId: socket?.id,
      hasRoomState: !!roomState,
      roomId: roomState?._id,
      hasUser: !!user,
      userId: user?._id,
      isInitializing,
      timestamp: new Date().toISOString()
    });

    if (!isDataReady || !socket?.connected || !roomState?._id || !user?._id || isInitializing) {
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-gray-500">
            {isInitializing ? 'Initializing room...' :
             !socket ? 'Connecting to server...' :
             !socket.connected ? 'Waiting for connection...' :
             !roomState ? `Loading room... ${joinAttempts > 0 ? `(Attempt ${joinAttempts + 1}/${MAX_JOIN_ATTEMPTS})` : ''}` :
             !user ? 'Loading user data...' :
             !roomState._id ? 'Initializing room data...' :
             !isDataReady ? 'Preparing game data...' :
             'Preparing game...'}
          </p>
        </div>
      );
    }

    return (
      <>
        <PhaserGame
          key={`game-${roomState._id}-${socket.id}-${user._id}`}
          roomState={roomState}
          socket={socket}
          user={user}
        />
        {/* Debug overlay */}
        <div className="absolute top-0 right-0 p-2 text-xs text-gray-600 bg-white bg-opacity-50">
          <div>Socket ID: {socket.id}</div>
          <div>Socket Connected: {socket.connected ? 'Yes' : 'No'}</div>
          <div>Room ID: {roomState._id}</div>
          <div>Room Name: {roomState.name}</div>
          <div>Players: {roomState.participants?.length || 0}</div>
          <div>Objects: {roomState.objects?.length || 0}</div>
          <div>User ID: {user._id}</div>
          <div>Username: {user.username}</div>
          <div>Last Update: {new Date().toISOString()}</div>
        </div>
      </>
    );
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <button
            onClick={handleLogout}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {roomState?.name || 'Loading...'}
          </h1>
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">Welcome, {user?.username}</span>
            <button
              onClick={handleLogout}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Game Container */}
        <div className="flex-1 relative" ref={gameContainerRef}>
          <div className="absolute inset-0 bg-white rounded-lg shadow overflow-hidden">
            {renderGame()}
          </div>
        </div>

        {/* Chat and Users Sidebar */}
        <div className="w-80 bg-white shadow-lg flex flex-col">
          {/* Users List */}
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold mb-2">Users Online</h2>
            <div className="space-y-2">
              {roomState?.participants?.map((participant) => (
                <div
                  key={`${participant.user._id}-${participant.user.socketId || 'unknown'}`}
                  className="flex items-center space-x-2"
                >
                  <div className={`w-2 h-2 rounded-full ${
                    participant.user.isOnline ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <span className="text-gray-700">{participant.user.username}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={message._id || index}
                  className={`p-2 rounded transition-opacity duration-200 ${
                    message.isPending ? 'opacity-50' : 'opacity-100'
                  } ${
                    message.type === 'system'
                      ? 'bg-gray-100 text-gray-600 text-sm'
                      : message.user?._id === user?._id
                      ? 'bg-blue-100 ml-4'
                      : 'bg-gray-50 mr-4'
                  }`}
                >
                  {message.type === 'system' ? (
                    <p className="text-center italic">{message.message}</p>
                  ) : (
                    <>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-sm text-gray-700">
                          {message.user?.username}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(message.createdAt).toLocaleTimeString()}
                        </span>
                        {message.isPending && (
                          <span className="text-xs text-gray-400">(sending...)</span>
                        )}
                      </div>
                      <p className="mt-1 text-gray-800 break-words">{message.message}</p>
                    </>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Message Input */}
          <form onSubmit={handleSendMessage} className="p-4 border-t">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!socket?.connected}
                maxLength={500} // Prevent extremely long messages
              />
              <button
                type="submit"
                className={`px-4 py-2 rounded transition-colors duration-200 ${
                  socket?.connected && newMessage.trim()
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!socket?.connected || !newMessage.trim()}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MainRoom; 