import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth, axios } from '../../context/AuthContext';
import { io } from 'socket.io-client';
import GameCanvas from '../game/GameCanvas';

export const MainRoom = () => {
  const { user, logout } = useAuth();
  const [socket, setSocket] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState(null);
  const [lobbyRoomId, setLobbyRoomId] = useState(null);
  const messagesEndRef = useRef(null);
  const gameContainerRef = useRef(null);

  // Remove debug log for user and socket state
  useEffect(() => {
    // Only log critical state changes
    if (!user || !socket?.connected) {
      console.log('Critical state change:', {
        hasUser: !!user,
        hasSocket: !!socket,
        socketConnected: socket?.connected,
        timestamp: new Date().toISOString()
      });
    }
  }, [user, socket]);

  useEffect(() => {
    const fetchLobbyRoom = async () => {
      try {
        console.log('Fetching lobby room:', {
          hasUser: !!user,
          hasToken: !!localStorage.getItem('token'),
          timestamp: new Date().toISOString()
        });

        if (!user) {
          console.log('No user data available for fetching lobby room:', {
            timestamp: new Date().toISOString()
          });
          return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
          console.error('No authentication token found:', {
            timestamp: new Date().toISOString()
          });
          setError('Authentication required. Please log in again.');
          return;
        }

        const response = await axios.get('/api/rooms', {
          params: { name: 'Lobby' },
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        // The response is wrapped in a data field
        const { data } = response.data;
        console.log('Lobby room response:', {
          success: !!data,
          rooms: data?.rooms,
          timestamp: new Date().toISOString()
        });

        if (!data?.rooms || !Array.isArray(data.rooms)) {
          throw new Error('Invalid response format from server');
        }

        const lobbyRoom = data.rooms.find(room => room.name === 'Lobby');
        if (!lobbyRoom) {
          throw new Error('Lobby room not found');
        }

        console.log('Found lobby room:', {
          roomId: lobbyRoom._id,
          name: lobbyRoom.name,
          timestamp: new Date().toISOString()
        });

        setLobbyRoomId(lobbyRoom._id);
        setRoomState(lobbyRoom); // Set initial room state
      } catch (err) {
        console.error('Error fetching lobby room:', {
          error: err.message,
          response: err.response?.data,
          status: err.response?.status,
          timestamp: new Date().toISOString()
        });

        if (err.response?.status === 401) {
          // If unauthorized, clear the token and redirect to login
          localStorage.removeItem('token');
          setError('Session expired. Please log in again.');
        } else {
          setError('Failed to fetch lobby room: ' + (err.response?.data?.error || err.message));
        }
      }
    };

    fetchLobbyRoom();
  }, [user]);

  // Handle room state updates
  useEffect(() => {
    if (!socket) return;

    const handleRoomStateUpdate = (state) => {
      if (!state || !state.participants) {
        console.error('Invalid room state received:', {
          roomId: state?._id,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Update room state with proper participant handling
      setRoomState(prevState => {
        if (!prevState) return state;

        // Create a map of existing participants for quick lookup
        const existingParticipants = new Map(
          prevState.participants?.map(p => [p.user._id, p]) || []
        );

        // Update participants with proper position handling
        const updatedParticipants = state.participants.map(participant => {
          const existingParticipant = existingParticipants.get(participant.user._id);
          const isCurrentUser = participant.user._id === user._id;

          if (!existingParticipant) {
            // New participant
            return {
              ...participant,
              lastPosition: { ...participant.position }
            };
          }

          // Update existing participant
          return {
            ...participant,
            lastPosition: isCurrentUser ? 
              existingParticipant.lastPosition : 
              { ...existingParticipant.position }
          };
        });

        // Return updated state
        return {
          ...state,
          participants: updatedParticipants,
          _lastUpdate: Date.now()
        };
      });
    };

    socket.on('roomState', handleRoomStateUpdate);

    return () => {
      socket.off('roomState', handleRoomStateUpdate);
    };
  }, [socket, user]);

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

  // Initialize socket connection
  useEffect(() => {
    if (!user || !lobbyRoomId) {
      console.log('Cannot initialize socket:', {
        hasUser: !!user,
        hasLobbyRoomId: !!lobbyRoomId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    console.log('Initializing socket connection:', {
      userId: user._id,
      username: user.username,
      lobbyRoomId,
      timestamp: new Date().toISOString()
    });

    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found for socket connection');
      setError('Authentication required. Please log in again.');
      return;
    }

    const newSocket = io(import.meta.env.VITE_SERVER_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      forceNew: true
    });

    // Handle authentication
    newSocket.on('connect', () => {
      console.log('Socket connected, authenticating...', {
        socketId: newSocket.id,
        userId: user._id,
        timestamp: new Date().toISOString()
      });

      newSocket.emit('authenticate', { token }, (response) => {
        if (response?.error) {
          console.error('Socket authentication failed:', response.error);
          setError('Authentication failed. Please log in again.');
          newSocket.disconnect();
        } else {
          console.log('Socket authenticated successfully:', {
            socketId: newSocket.id,
            userId: user._id,
            username: user.username,
            timestamp: new Date().toISOString()
          });

          // Join room after successful authentication
          if (lobbyRoomId) {
            console.log('Joining room after authentication:', {
              roomId: lobbyRoomId,
              socketId: newSocket.id,
              timestamp: new Date().toISOString()
            });
            newSocket.emit('joinRoom', lobbyRoomId);
          }
        }
      });
    });

    // Handle errors
    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
      setError(error.message);
    });

    // Handle disconnection
    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', {
        reason,
        socketId: newSocket.id,
        timestamp: new Date().toISOString()
      });
    });

    setSocket(newSocket);

    return () => {
      console.log('Cleaning up socket connection:', {
        socketId: newSocket.id,
        userId: user._id,
        timestamp: new Date().toISOString()
      });
      newSocket.disconnect();
    };
  }, [user, lobbyRoomId]);

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

  // Remove debug log for room state and socket
  useEffect(() => {
    // Only log critical state changes
    if (!socket?.connected || !roomState) {
      console.log('Critical connection state:', {
        socketConnected: socket?.connected,
        hasRoomState: !!roomState,
        timestamp: new Date().toISOString()
      });
    }
  }, [socket, roomState]);

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
    <div className="min-h-screen bg-gray-100 flex flex-col">
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
        <div className="flex-1 p-4" ref={gameContainerRef}>
          <div className="bg-white rounded-lg shadow h-full overflow-hidden relative">
            {!socket ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-500">Connecting to server...</p>
              </div>
            ) : !socket.connected ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-500">Waiting for connection...</p>
              </div>
            ) : !roomState ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-500">Loading room...</p>
              </div>
            ) : !roomState.objects ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-500">Initializing game objects...</p>
              </div>
            ) : (
              <>
                <GameCanvas
                  key={`game-canvas-${roomState._id}`}
                  roomState={roomState}
                  socket={socket}
                  onPlayerMove={handlePlayerMove}
                />
                {/* Debug overlay */}
                <div className="absolute top-0 right-0 p-2 text-xs text-gray-600 bg-white bg-opacity-50">
                  <div>Socket ID: {socket.id}</div>
                  <div>Room ID: {roomState._id}</div>
                  <div>Players: {roomState.participants?.length}</div>
                  <div>Objects: {roomState.objects?.length}</div>
                  <div>Room Name: {roomState.name}</div>
                </div>
              </>
            )}
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
                  key={participant.user._id}
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