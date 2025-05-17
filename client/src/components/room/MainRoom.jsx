import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { io } from 'socket.io-client';
import axios from 'axios';
import GameCanvas from '../game/GameCanvas';

export const MainRoom = () => {
  const { user, logout } = useAuth();
  const [socket, setSocket] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState(null);
  const [lobbyId, setLobbyId] = useState(null);
  const messagesEndRef = useRef(null);
  const gameContainerRef = useRef(null);

  // Fetch lobby room ID
  useEffect(() => {
    const fetchLobbyRoom = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          console.error('No token available for fetching lobby room');
          setError('Authentication required');
          return;
        }

        console.log('Fetching lobby room...');
        const response = await axios.get('/api/rooms', {
          headers: { Authorization: `Bearer ${token}` },
          params: { name: 'Lobby' }
        });
        
        console.log('Lobby room response:', response.data);
        
        if (response.data?.rooms && Array.isArray(response.data.rooms)) {
          const lobbyRoom = response.data.rooms.find(room => room.name === 'Lobby');
          if (lobbyRoom) {
            console.log('Found lobby room:', lobbyRoom);
            setLobbyId(lobbyRoom._id);
            setRoomState(lobbyRoom); // Set initial room state
          } else {
            console.error('Lobby room not found in rooms array');
            setError('Lobby room not found. Please try refreshing the page.');
          }
        } else {
          console.error('Invalid rooms response format:', response.data);
          setError('Invalid server response. Please try refreshing the page.');
        }
      } catch (err) {
        console.error('Error fetching lobby room:', {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status
        });
        setError(err.response?.data?.message || 'Failed to fetch lobby room. Please try refreshing the page.');
      }
    };

    fetchLobbyRoom();
  }, []);

  // Initialize Socket.IO connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('No authentication token found');
      return;
    }

    // Create socket with explicit URL and path
    const newSocket = io('/', {  // Use relative URL to work with proxy
      auth: { token },
      withCredentials: true,
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      path: '/socket.io/',
      autoConnect: true,
      forceNew: true,
      rejectUnauthorized: false
    });

    // Log connection attempts
    console.log('Attempting to connect to Socket.IO server...');

    newSocket.on('connect', () => {
      console.log('Connected to server with transport:', newSocket.io.engine.transport.name);
      setError(null);
      
      // Authenticate after connection
      newSocket.emit('authenticate', { token }, (response) => {
        if (response.error) {
          console.error('Authentication error:', response.error);
          setError('Authentication failed: ' + response.error);
        } else if (response.success) {
          console.log('Authenticated as:', response.user.username);
        }
      });
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', {
        message: err.message,
        description: err.description,
        type: err.type,
        transport: newSocket.io.engine?.transport?.name
      });
      setError('Failed to connect to server. Please try refreshing the page.');
    });

    newSocket.on('error', (err) => {
      console.error('Socket error:', err);
      setError(err.message || 'An error occurred');
    });

    newSocket.on('roomState', (state) => {
      console.log('Room state updated:', state);
      setRoomState(state);
    });

    newSocket.on('userJoined', (userData) => {
      console.log('User joined:', userData);
      setMessages(prev => [...prev, {
        type: 'system',
        message: `${userData.username} joined the room`,
        createdAt: new Date().toISOString()
      }]);
    });

    newSocket.on('userLeft', (userData) => {
      console.log('User left:', userData);
      setMessages(prev => [...prev, {
        type: 'system',
        message: `${userData.username} left the room`,
        createdAt: new Date().toISOString()
      }]);
    });

    newSocket.on('newMessage', (message) => {
      console.log('New message received:', message);
      setMessages(prev => [...prev, {
        ...message,
        type: 'chat'
      }]);
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      if (newSocket) {
        console.log('Cleaning up socket connection...');
        newSocket.removeAllListeners();
        newSocket.close();
      }
    };
  }, []);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Join room when socket, user, and lobbyId are available
  useEffect(() => {
    if (socket && user && lobbyId && socket.connected) {
      console.log('Attempting to join room:', {
        socketId: socket.id,
        userId: user._id,
        lobbyId: lobbyId,
        isConnected: socket.connected
      });

      socket.emit('joinRoom', lobbyId, (response) => {
        if (response?.error) {
          console.error('Error joining room:', response.error);
          setError('Failed to join room: ' + response.error);
        } else {
          console.log('Successfully joined room:', response);
          // Update room state with the response if available
          if (response) {
            setRoomState(prev => ({
              ...prev,
              ...response
            }));
          }
        }
      });
    } else {
      console.log('Cannot join room:', {
        hasSocket: !!socket,
        hasUser: !!user,
        hasLobbyId: !!lobbyId,
        isConnected: socket?.connected
      });
    }
  }, [socket, user, lobbyId]);

  // Handle room state updates
  useEffect(() => {
    if (socket) {
      const handleRoomState = (newRoomState) => {
        console.log('Received room state update:', {
          roomId: newRoomState._id,
          roomName: newRoomState.name,
          participants: newRoomState.participants?.length,
          currentUser: user?._id,
          participants: newRoomState.participants?.map(p => ({
            userId: p.user._id,
            username: p.user.username,
            position: p.position
          }))
        });

        setRoomState(newRoomState);
      };

      socket.on('roomState', handleRoomState);

      // Join lobby room if not already in a room
      if (!roomState?._id && lobbyId) {
        console.log('Joining lobby room with ID:', lobbyId);
        socket.emit('joinRoom', lobbyId);
      }

      return () => {
        socket.off('roomState', handleRoomState);
      };
    }
  }, [socket, user, roomState, lobbyId]);

  // Handle user joined events
  useEffect(() => {
    if (socket) {
      const handleUserJoined = (data) => {
        console.log('User joined room:', data);
        // Room state will be updated via roomState event
      };

      const handleUserLeft = (data) => {
        console.log('User left room:', data);
        // Room state will be updated via roomState event
      };

      socket.on('userJoined', handleUserJoined);
      socket.on('userLeft', handleUserLeft);

      return () => {
        socket.off('userJoined', handleUserJoined);
        socket.off('userLeft', handleUserLeft);
      };
    }
  }, [socket]);

  // Debug log for room state changes
  useEffect(() => {
    if (roomState) {
      console.log('Room state changed:', {
        roomId: roomState._id,
        roomName: roomState.name,
        participants: roomState.participants?.length,
        currentUser: user?._id,
        hasGameCanvas: !!roomState.objects?.length
      });
    }
  }, [roomState, user]);

  // Handle user movement updates from other players
  useEffect(() => {
    if (!socket) return;

    const handleUserMoved = (data) => {
      console.log('User moved:', data);
      setRoomState(prev => {
        if (!prev) return prev;

        const updatedParticipants = prev.participants.map(p => {
          if (p.user._id === data.userId) {
            return {
              ...p,
              position: data.position
            };
          }
          return p;
        });

        return {
          ...prev,
          participants: updatedParticipants
        };
      });
    };

    socket.on('userMoved', handleUserMoved);

    return () => {
      socket.off('userMoved', handleUserMoved);
    };
  }, [socket]);

  // Handle player movement
  const handlePlayerMove = (position) => {
    console.log('handlePlayerMove called with position:', {
      position,
      hasSocket: !!socket,
      socketConnected: socket?.connected,
      hasRoomState: !!roomState,
      roomId: roomState?._id,
      userId: user?._id
    });

    if (!socket?.connected || !roomState?._id) {
      console.log('Cannot send movement:', {
        hasSocket: !!socket,
        isConnected: socket?.connected,
        hasRoom: !!roomState,
        roomId: roomState?._id
      });
      return;
    }

    // Emit movement to server
    console.log('Emitting userMove event:', {
      roomId: roomState._id,
      position,
      socketId: socket.id
    });

    socket.emit('userMove', {
      roomId: roomState._id,
      position
    }, (response) => {
      console.log('userMove response:', response);
      if (response?.error) {
        console.error('Error sending movement:', response.error);
        setError('Failed to update position: ' + response.error);
      }
    });

    // Update local state immediately for smooth movement
    setRoomState(prev => {
      if (!prev) {
        console.log('No previous room state to update');
        return prev;
      }

      console.log('Updating local room state with new position:', {
        userId: user._id,
        oldPosition: prev.participants.find(p => p.user._id === user._id)?.position,
        newPosition: position
      });

      const updatedParticipants = prev.participants.map(p => {
        if (p.user._id === user._id) {
          return {
            ...p,
            position
          };
        }
        return p;
      });

      return {
        ...prev,
        participants: updatedParticipants
      };
    });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    console.log('Attempting to send message:', {
      message: newMessage.trim(),
      hasSocket: !!socket,
      socketConnected: socket?.connected,
      hasRoom: !!roomState,
      roomId: roomState?._id
    });

    if (!newMessage.trim() || !socket?.connected || !roomState?._id) {
      console.log('Cannot send message:', {
        hasMessage: !!newMessage.trim(),
        hasSocket: !!socket,
        isConnected: socket?.connected,
        hasRoom: !!roomState,
        roomId: roomState?._id
      });
      return;
    }

    const messageData = {
      roomId: roomState._id,
      message: newMessage.trim()
    };

    console.log('Emitting chatMessage event:', messageData);

    socket.emit('chatMessage', messageData, (response) => {
      console.log('Chat message response:', response);
      if (response?.error) {
        console.error('Error sending message:', response.error);
        setError('Failed to send message: ' + response.error);
      } else {
        // Add message to local state immediately
        setMessages(prev => [...prev, {
          type: 'chat',
          user: {
            _id: user._id,
            username: user.username
          },
          message: newMessage.trim(),
          createdAt: new Date().toISOString()
        }]);
        setNewMessage('');
      }
    });
  };

  const handleLogout = () => {
    if (socket) {
      socket.close();
    }
    logout();
  };

  // Debug log for room state and socket
  useEffect(() => {
    console.log('MainRoom state:', {
      hasSocket: !!socket,
      socketConnected: socket?.connected,
      socketId: socket?.id,
      hasRoomState: !!roomState,
      roomId: roomState?._id,
      roomName: roomState?.name,
      participants: roomState?.participants?.length,
      objects: roomState?.objects?.length,
      objectsData: roomState?.objects,
      messages: messages.length
    });
  }, [socket, roomState, messages]);

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
                  key={index}
                  className={`p-2 rounded ${
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
                      </div>
                      <p className="mt-1 text-gray-800">{message.message}</p>
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
              />
              <button
                type="submit"
                className={`px-4 py-2 rounded ${
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