import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

const TILE_SIZE = 20;
const PLAYER_SIZE = 30;
const MOVEMENT_SPEED = 3;

const GameCanvas = ({ roomState, socket, onPlayerMove }) => {
  const canvasRef = useRef(null);
  const { user } = useAuth();
  const [gameState, setGameState] = useState({
    players: {},
    objects: [],
    viewport: { x: 0, y: 0, width: 800, height: 600 }
  });
  const keysPressed = useRef(new Set());
  const frameCount = useRef(0);
  const lastFrameTime = useRef(Date.now());

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
      objectsData: roomState?.objects,
      hasUser: !!user,
      userId: user?._id
    });
  }, [socket, roomState, user]);

  // Update game state when room state changes
  useEffect(() => {
    if (roomState) {
      console.log('Room state updated in GameCanvas:', {
        roomId: roomState._id,
        roomName: roomState.name,
        participants: roomState.participants?.length,
        objects: roomState.objects?.length,
        currentUser: user?._id,
        participants: roomState.participants?.map(p => ({
          userId: p.user._id,
          username: p.user.username,
          position: p.position
        }))
      });

      const players = roomState.participants.reduce((acc, participant) => {
        // Ensure participant has valid position
        const position = participant.position || { x: 100, y: 100 };
        if (typeof position.x !== 'number' || typeof position.y !== 'number') {
          console.warn('Invalid position for participant:', participant);
          position.x = 100;
          position.y = 100;
        }

        const playerData = {
          ...participant,
          username: participant.user.username,
          color: participant.user._id === user?._id ? '#4299e1' : '#48bb78',
          position
        };

        console.log('Adding player to game state:', {
          userId: participant.user._id,
          username: playerData.username,
          position: playerData.position,
          isCurrentUser: participant.user._id === user?._id
        });

        return {
          ...acc,
          [participant.user._id]: playerData
        };
      }, {});

      setGameState(prev => ({ 
        ...prev, 
        players, 
        objects: roomState.objects || [] 
      }));
    }
  }, [roomState, user]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e) => {
    if (!user || !roomState?._id) return;
    keysPressed.current.add(e.key.toLowerCase());
    e.preventDefault();
  }, [user, roomState]);

  const handleKeyUp = useCallback((e) => {
    keysPressed.current.delete(e.key.toLowerCase());
    e.preventDefault();
  }, []);

  // Set up keyboard event listeners and movement loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !user || !roomState?._id) {
      console.log('Movement setup skipped:', { 
        hasCanvas: !!canvas, 
        hasUser: !!user, 
        hasRoomState: !!roomState?._id 
      });
      return;
    }

    console.log('Setting up movement handlers for user:', {
      userId: user._id,
      username: user.username,
      roomId: roomState._id
    });

    canvas.focus();
    canvas.tabIndex = 0;
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('keyup', handleKeyUp);

    const moveLoop = setInterval(() => {
      if (!user || !gameState.players[user._id]) {
        console.log('No player found for movement:', {
          hasUser: !!user,
          hasPlayer: !!gameState.players[user._id],
          players: Object.keys(gameState.players)
        });
        return;
      }
      
      const currentPlayer = gameState.players[user._id];
      const movement = { x: 0, y: 0 };
      const keys = keysPressed.current;

      if (keys.has('w') || keys.has('arrowup')) movement.y -= MOVEMENT_SPEED;
      if (keys.has('s') || keys.has('arrowdown')) movement.y += MOVEMENT_SPEED;
      if (keys.has('a') || keys.has('arrowleft')) movement.x -= MOVEMENT_SPEED;
      if (keys.has('d') || keys.has('arrowright')) movement.x += MOVEMENT_SPEED;

      if (movement.x !== 0 || movement.y !== 0) {
        const newPosition = {
          x: currentPlayer.position.x + movement.x,
          y: currentPlayer.position.y + movement.y
        };

        console.log('Emitting movement:', {
          userId: user._id,
          from: currentPlayer.position,
          to: newPosition,
          keys: Array.from(keys)
        });

        // Emit movement to server
        if (socket && socket.connected) {
          socket.emit('userMove', {
            roomId: roomState._id,
            position: newPosition
          });
        } else {
          console.warn('Socket not connected, cannot emit movement');
        }
      }
    }, 1000 / 60);

    return () => {
      canvas.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('keyup', handleKeyUp);
      clearInterval(moveLoop);
    };
  }, [user, roomState, gameState, socket, handleKeyDown, handleKeyUp]);

  // Render game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f7fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    // Draw game objects
    gameState.objects.forEach((obj, index) => {
      if (!obj.position || typeof obj.position.x !== 'number' || typeof obj.position.y !== 'number') return;
      ctx.fillStyle = obj.properties?.color || '#718096';
      switch (obj.type) {
        case 'wall':
          ctx.fillRect(
            obj.position.x,
            obj.position.y,
            obj.properties?.width || TILE_SIZE,
            obj.properties?.height || TILE_SIZE
          );
          ctx.strokeStyle = '#000';
          ctx.strokeRect(
            obj.position.x,
            obj.position.y,
            obj.properties?.width || TILE_SIZE,
            obj.properties?.height || TILE_SIZE
          );
          break;
        case 'furniture':
          ctx.fillStyle = obj.properties?.color || '#805ad5';
          ctx.beginPath();
          ctx.arc(
            obj.position.x + TILE_SIZE/2,
            obj.position.y + TILE_SIZE/2,
            TILE_SIZE/2,
            0,
            Math.PI * 2
          );
          ctx.fill();
          break;
        case 'decoration':
          if (obj.properties?.type === 'plant') {
            ctx.fillStyle = '#48bb78';
            ctx.beginPath();
            ctx.moveTo(obj.position.x, obj.position.y + TILE_SIZE);
            ctx.lineTo(obj.position.x + TILE_SIZE/2, obj.position.y);
            ctx.lineTo(obj.position.x + TILE_SIZE, obj.position.y + TILE_SIZE);
            ctx.fill();
          } else {
            ctx.fillRect(
              obj.position.x,
              obj.position.y,
              TILE_SIZE,
              TILE_SIZE
            );
          }
          break;
      }
      ctx.fillStyle = '#000';
      ctx.font = '10px Arial';
      ctx.fillText(
        `${obj.type} ${index}`,
        obj.position.x,
        obj.position.y - 5
      );
    });
    // Draw players
    Object.values(gameState.players).forEach(player => {
      if (!player.position || typeof player.position.x !== 'number' || typeof player.position.y !== 'number') return;
      ctx.fillStyle = player.color || '#4299e1';
      ctx.beginPath();
      ctx.arc(
        player.position.x,
        player.position.y,
        PLAYER_SIZE / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        player.username,
        player.position.x,
        player.position.y - PLAYER_SIZE / 2 - 5
      );
      ctx.fillStyle = '#666';
      ctx.font = '10px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(
        `(${Math.round(player.position.x)}, ${Math.round(player.position.y)})`,
        player.position.x + PLAYER_SIZE / 2 + 5,
        player.position.y
      );
    });
    // Calculate and draw FPS
    frameCount.current++;
    const now = Date.now();
    const elapsed = now - lastFrameTime.current;
    if (elapsed >= 1000) {
      const fps = Math.round((frameCount.current * 1000) / elapsed);
      ctx.fillStyle = '#000';
      ctx.font = '12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`FPS: ${fps}`, 10, 20);
      frameCount.current = 0;
      lastFrameTime.current = now;
    }
  }, [gameState, user]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: '4px',
          backgroundColor: '#f7fafc',
          outline: 'none',
          display: 'block',
          margin: '0 auto'
        }}
        tabIndex={0}
      />
      {/* Debug overlay */}
      <div className="absolute top-0 left-0 p-2 text-xs text-gray-600 bg-white bg-opacity-50">
        <div>Players: {Object.keys(gameState.players).length}</div>
        <div>Objects: {gameState.objects.length}</div>
        <div>Room: {roomState?.name}</div>
        <div>Socket: {socket?.connected ? 'Connected' : 'Disconnected'}</div>
        <div>User: {user?.username}</div>
      </div>
    </div>
  );
};

export default GameCanvas; 