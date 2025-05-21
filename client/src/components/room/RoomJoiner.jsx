import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../contexts/SocketContext';
import { useAuth } from '../../contexts/AuthContext';
import { roomAPI } from '../../utils/api';

const RoomJoiner = ({ onJoin }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [password, setPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const { socket } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchRooms();
    
      if (socket) {
      socket.on('roomState', handleRoomState);
      socket.on('error', handleError);
    }

    return () => {
      if (socket) {
        socket.off('roomState', handleRoomState);
        socket.off('error', handleError);
      }
    };
  }, [socket]);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const response = await roomAPI.getRooms();
      
      if (response?.data?.rooms) {
        setRooms(response.data.rooms);
      } else {
        console.error('Invalid response structure:', response);
        setError('Failed to fetch rooms: Invalid response from server');
      }
    } catch (err) {
      console.error('Error fetching rooms:', err);
      setError(err.message || 'Failed to fetch rooms');
    } finally {
      setLoading(false);
    }
  };

  const handleRoomState = (roomState) => {
    if (onJoin) {
      onJoin(roomState);
    }
    navigate(`/room/${roomState._id}`);
  };

  const handleError = (error) => {
    setError(error.message);
    setShowPasswordModal(false);
  };

  const handleJoinRoom = async (room) => {
    setSelectedRoom(room);
    
    if (room.isPrivate) {
      setShowPasswordModal(true);
    } else {
      joinRoom(room._id);
    }
  };

  const joinRoom = (roomId, roomPassword = null) => {
    if (!socket) {
      setError('Not connected to server');
      return;
    }

    const joinData = roomPassword ? { roomId, password: roomPassword } : { roomId };
    socket.emit('joinRoom', roomId);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (selectedRoom) {
      joinRoom(selectedRoom._id, password);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <span className="block sm:inline">{error}</span>
          <button 
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
            onClick={() => setError(null)}
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map(room => (
          <div 
            key={room._id}
            className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300"
          >
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">{room.name}</h3>
              <p className="text-gray-600 mb-4">{room.description}</p>
              
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">
                    {room.participants?.length || 0} / {room.settings?.maxParticipants || 50} online
                  </span>
                  {room.isPrivate && (
                    <span className="px-2 py-1 text-xs font-semibold text-purple-700 bg-purple-100 rounded-full">
                      Private
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleJoinRoom(room)}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200"
                >
                  Join Room
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Password Modal */}
      {showPasswordModal && selectedRoom && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 max-w-md w-full">
            <h3 className="text-xl font-semibold mb-4">Enter Room Password</h3>
            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded mb-4"
                placeholder="Enter room password"
                required
              />
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomJoiner; 