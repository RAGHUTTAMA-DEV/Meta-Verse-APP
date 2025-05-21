import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../contexts/SocketContext';
import { useAuth } from '../../contexts/AuthContext';
import { roomAPI } from '../../utils/api';

const CreateRoom = () => {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    type: 'public', 
    password: '',
    template: 'default', 
    maxPlayers: 10,
    description: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Creating room with data:', formData);
      const response = await roomAPI.createRoom({
        name: formData.name,
        description: formData.description,
        isPrivate: formData.type === 'private',
        password: formData.type === 'private' ? formData.password : undefined,
        maxParticipants: formData.maxPlayers,
        template: formData.template
      });
      
      console.log('Room creation response:', response);
      
      if (!response || !response.data || !response.data.room) {
        console.error('Invalid response structure:', response);
        throw new Error('Invalid response from server');
      }

      const roomId = response.data.room._id;
      if (!roomId) {
        console.error('Room ID missing from response:', response.data.room);
        throw new Error('Room ID not found in response');
      }

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log('Authenticating socket...');
      await new Promise((resolve, reject) => {
        socket.emit('authenticate', { token }, (authResponse) => {
          console.log('Socket authentication response:', authResponse);
          if (authResponse?.error) {
            reject(new Error(authResponse.error));
          } else {
            resolve(authResponse);
          }
        });
      });

      console.log('Joining room:', roomId);
      await new Promise((resolve, reject) => {
        const roomStateHandler = (roomState) => {
          if (roomState._id === roomId) {
            socket.off('roomState', roomStateHandler);
            resolve(roomState);
          }
        };

        const errorHandler = (error) => {
          socket.off('error', errorHandler);
          reject(new Error(error.message));
        };

        const timeout = setTimeout(() => {
          socket.off('roomState', roomStateHandler);
          socket.off('error', errorHandler);
          reject(new Error('Timeout waiting for room join'));
        }, 5000);

        socket.on('roomState', roomStateHandler);
        socket.on('error', errorHandler);

        socket.emit('joinRoom', roomId);

        Promise.race([
          new Promise(resolve => socket.once('roomState', resolve)),
          new Promise((_, reject) => socket.once('error', reject))
        ]).finally(() => {
          clearTimeout(timeout);
          socket.off('roomState', roomStateHandler);
          socket.off('error', errorHandler);
        });
      });
      
      navigate(`/game/${roomId}`);
    } catch (err) {
      console.error('Room creation error:', err);
      setError(err.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">
          Create New Room
        </h2>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Room Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Enter room name"
            />
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700">
              Room Type
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="hub">Hub</option>
            </select>
          </div>

          {formData.type === 'private' && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Room Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Enter room password"
              />
            </div>
          )}

          <div>
            <label htmlFor="template" className="block text-sm font-medium text-gray-700">
              Room Template
            </label>
            <select
              id="template"
              name="template"
              value={formData.template}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="default">Default</option>
              <option value="office">Office</option>
              <option value="lounge">Lounge</option>
              <option value="gaming">Gaming</option>
            </select>
          </div>

          <div>
            <label htmlFor="maxPlayers" className="block text-sm font-medium text-gray-700">
              Maximum Players
            </label>
            <input
              type="number"
              id="maxPlayers"
              name="maxPlayers"
              min="1"
              max="50"
              value={formData.maxPlayers}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Room Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Describe your room..."
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
              ${loading 
                ? 'bg-indigo-400 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
              }`}
          >
            {loading ? 'Creating Room...' : 'Create Room'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateRoom; 