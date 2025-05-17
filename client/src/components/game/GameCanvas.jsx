import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const TILE_SIZE = 20;
const PLAYER_SIZE = 30;
const MOVEMENT_SPEED = 3;

const GameCanvas = ({ roomState, socket, onPlayerMove }) => {
  const canvasRef = useRef(null);
  const { user: currentUser } = useAuth();
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastFpsUpdate = useRef(0);
  const keys = useRef(new Set());

  // Debug log for initial props and state
  useEffect(() => {
    console.log('GameCanvas mounted with props:', {
      hasSocket: !!socket,
      socketConnected: socket?.connected,
      socketId: socket?.id,
      hasRoomState: !!roomState,
      roomId: roomState?._id,
      roomName: roomState?.name,
      participants: roomState?.participants?.length,
      objects: roomState?.objects?.length,
      hasUser: !!currentUser,
      userId: currentUser?._id
    });
  }, [socket, roomState, currentUser]);

  // Update room state logging
  useEffect(() => {
    if (roomState) {
      console.log('Room state updated in GameCanvas:', {
        roomId: roomState._id,
        roomName: roomState.name,
        participants: roomState.participants?.length,
        objects: roomState.objects?.length,
        currentUser: currentUser?._id,
        participants: roomState.participants?.map(p => ({
          userId: p.user._id,
          username: p.user.username,
          avatar: p.user.avatar,
          position: p.position
        }))
      });
    }
  }, [roomState, currentUser]);

  // Initialize canvas and setup
  useEffect(() => {
    if (!canvasRef.current || !roomState) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas size
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Setup keyboard controls
    const handleKeyDown = (e) => {
      keys.current.add(e.key.toLowerCase());
    };

    const handleKeyUp = (e) => {
      keys.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Movement loop
    const movementLoop = () => {
      if (!roomState || !currentUser) return;

      const player = roomState.participants?.find(p => p.user._id === currentUser._id);
      if (!player) {
        console.log('No player found for movement:', {
          hasUser: !!currentUser,
          hasPlayer: !!player,
          players: roomState.participants
        });
        return;
      }

      const speed = 5;
      let moved = false;
      const newPosition = { ...player.position };

      if (keys.current.has('w') || keys.current.has('arrowup')) {
        newPosition.y -= speed;
        moved = true;
      }
      if (keys.current.has('s') || keys.current.has('arrowdown')) {
        newPosition.y += speed;
        moved = true;
      }
      if (keys.current.has('a') || keys.current.has('arrowleft')) {
        newPosition.x -= speed;
        moved = true;
      }
      if (keys.current.has('d') || keys.current.has('arrowright')) {
        newPosition.x += speed;
        moved = true;
      }

      // Keep player within bounds
      newPosition.x = Math.max(20, Math.min(canvas.width - 20, newPosition.x));
      newPosition.y = Math.max(20, Math.min(canvas.height - 20, newPosition.y));

      if (moved) {
        onPlayerMove(newPosition);
      }
    };

    // Animation loop
    const animate = (timestamp) => {
      // Calculate FPS
      frameCount.current++;
      if (timestamp - lastFpsUpdate.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastFpsUpdate.current = timestamp;
      }

      // Handle movement
      movementLoop();

      // Render frame
      render();

      // Request next frame
      requestAnimationFrame(animate);
    };

    // Start animation loop
    requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [roomState, currentUser, onPlayerMove]);

  const renderPlayer = (ctx, participant) => {
    const { position, user } = participant;
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      console.warn('Invalid position for participant:', participant);
      return;
    }

    const isCurrentUser = user._id === currentUser?._id;
    
    // Draw player circle
    ctx.beginPath();
    ctx.arc(position.x, position.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = isCurrentUser ? '#3B82F6' : '#10B981'; // Blue for current user, green for others
    ctx.fill();
    ctx.strokeStyle = '#1F2937';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw avatar image if available
    if (user.avatar) {
      const avatarSize = 32;
      const avatarX = position.x - avatarSize/2;
      const avatarY = position.y - avatarSize/2;
      
      // Draw avatar background circle
      ctx.beginPath();
      ctx.arc(position.x, position.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      
      // Load and draw avatar image
      const img = new Image();
      img.src = user.avatar;
      img.onload = () => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(position.x, position.y, 16, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
      };
    }

    // Draw username
    ctx.font = '12px Arial';
    ctx.fillStyle = '#1F2937';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(user.username, position.x, position.y + 35);
  };

  const renderGameObject = (ctx, obj) => {
    const { type, position, properties } = obj;
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      console.warn('Invalid position for game object:', obj);
      return;
    }
    
    switch (type) {
      case 'wall':
        ctx.fillStyle = properties.color || '#4B5563';
        ctx.fillRect(position.x, position.y, properties.width, properties.height);
        // Add a subtle shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        break;
        
      case 'furniture':
        // Draw furniture with a more detailed look
        ctx.fillStyle = properties.color || '#6B7280';
        ctx.beginPath();
        ctx.roundRect(position.x, position.y, 40, 40, 8);
        ctx.fill();
        // Add a highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
        
      case 'decoration':
        if (properties.type === 'plant') {
          // Draw a plant
          ctx.fillStyle = '#059669';
          ctx.beginPath();
          ctx.arc(position.x + 15, position.y + 15, 10, 0, Math.PI * 2);
          ctx.fill();
          // Draw pot
          ctx.fillStyle = '#92400E';
          ctx.beginPath();
          ctx.moveTo(position.x + 5, position.y + 25);
          ctx.lineTo(position.x + 25, position.y + 25);
          ctx.lineTo(position.x + 20, position.y + 35);
          ctx.lineTo(position.x + 10, position.y + 35);
          ctx.closePath();
          ctx.fill();
        } else if (properties.type === 'table') {
          // Draw a table
          ctx.fillStyle = '#92400E';
          ctx.fillRect(position.x, position.y, 60, 40);
          // Add table legs
          ctx.fillStyle = '#78350F';
          ctx.fillRect(position.x + 5, position.y + 40, 5, 20);
          ctx.fillRect(position.x + 50, position.y + 40, 5, 20);
        }
        break;
    }
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };

  const render = () => {
    if (!canvasRef.current || !roomState) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Draw background
    ctx.fillStyle = '#F3F4F6';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Draw grid
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < canvasRef.current.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasRef.current.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvasRef.current.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasRef.current.width, y);
      ctx.stroke();
    }

    // Draw game objects
    roomState.objects?.forEach(obj => renderGameObject(ctx, obj));

    // Draw players
    roomState.participants?.forEach(participant => renderPlayer(ctx, participant));

    // Draw FPS counter
    if (fps > 0) {
      ctx.font = '14px Arial';
      ctx.fillStyle = '#4B5563';
      ctx.textAlign = 'left';
      ctx.fillText(`FPS: ${Math.round(fps)}`, 10, 20);
    }
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        tabIndex={0}
        onFocus={() => console.log('Canvas focused')}
        onBlur={() => console.log('Canvas blurred')}
      />
      {/* Debug overlay */}
      <div className="absolute top-0 left-0 p-2 text-xs text-gray-600 bg-white bg-opacity-50">
        <div>Players: {roomState?.participants?.length}</div>
        <div>Objects: {roomState?.objects?.length}</div>
        <div>Room: {roomState?.name}</div>
        <div>Socket: {socket?.connected ? 'Connected' : 'Disconnected'}</div>
        <div>User: {currentUser?.username}</div>
      </div>
    </div>
  );
};

export default GameCanvas; 