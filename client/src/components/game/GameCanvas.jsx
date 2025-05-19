import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const TILE_SIZE = 20;
const PLAYER_SIZE = 30;
const BASE_MOVEMENT_SPEED = 180; // pixels per second
const MOVEMENT_THROTTLE = 16; // ~60fps

const GameCanvas = ({ roomState, socket, onPlayerMove }) => {
  const canvasRef = useRef(null);
  const { user: currentUser } = useAuth();
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastFpsUpdate = useRef(0);
  const keys = useRef(new Set());
  const lastMoveTime = useRef(0);
  const lastPosition = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const animationFrameId = useRef(null);
  const lastFrameTime = useRef(performance.now());

  // Debug log for keyboard state
  useEffect(() => {
    const logInterval = setInterval(() => {
      if (keys.current.size > 0) {
        console.log('Current active keys:', {
          keys: Array.from(keys.current),
          isFocused,
          hasSocket: !!socket,
          socketConnected: socket?.connected,
          timestamp: new Date().toISOString()
        });
      }
    }, 1000);

    return () => clearInterval(logInterval);
  }, [isFocused, socket]);

  // Auto-focus canvas when component mounts
  useEffect(() => {
    const focusCanvas = () => {
      if (canvasRef.current) {
        canvasRef.current.focus();
        setIsFocused(true);
      }
    };

    // Focus on mount and add click handlers
    const container = canvasRef.current?.parentElement;
    if (container) {
      focusCanvas();

      const handleClick = (e) => {
        if (e.target === container || e.target === canvasRef.current) {
          e.preventDefault();
          e.stopPropagation();
          focusCanvas();
        }
      };

      container.addEventListener('click', handleClick);
      canvasRef.current.addEventListener('click', handleClick);

      return () => {
        container.removeEventListener('click', handleClick);
        canvasRef.current?.removeEventListener('click', handleClick);
      };
    }
  }, []);

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
      userId: currentUser?._id,
      timestamp: new Date().toISOString()
    });
  }, [socket, roomState, currentUser]);

  // Update room state logging
  useEffect(() => {
    if (roomState) {
      console.log('Room state updated in GameCanvas:', {
        roomId: roomState._id,
        roomName: roomState.name,
        participants: roomState.participants?.map(p => ({
          userId: p.user._id,
          username: p.user.username,
          position: p.position,
          lastPosition: p.lastPosition,
          isCurrentUser: p.user._id === currentUser?._id
        })),
        timestamp: new Date().toISOString()
      });
    }
  }, [roomState, currentUser]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      
      // Try to focus canvas on movement key press
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        if (!isFocused) {
          canvasRef.current?.focus();
          setIsFocused(true);
        }
        e.preventDefault();
        
        if (!keys.current.has(key)) {
          keys.current.add(key);
        }
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        keys.current.delete(key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isFocused]);

  // Movement loop
  useEffect(() => {
    if (!roomState || !socket?.connected || !currentUser) return;

    let animationFrameId;
    let lastTime = performance.now();
    const moveSpeed = 3; // Reduced movement speed for smoother motion

    const moveLoop = (currentTime) => {
      const deltaTime = Math.min((currentTime - lastTime) / 16.67, 2); // Cap delta time to prevent large jumps
      lastTime = currentTime;

      // Get current player
      const currentPlayer = roomState.participants.find(p => p.user._id === currentUser._id);
      if (!currentPlayer) return;

      // Calculate movement based on active keys
      let dx = 0;
      let dy = 0;

      if (keys.current.has('ArrowUp') || keys.current.has('w')) dy -= moveSpeed * deltaTime;
      if (keys.current.has('ArrowDown') || keys.current.has('s')) dy += moveSpeed * deltaTime;
      if (keys.current.has('ArrowLeft') || keys.current.has('a')) dx -= moveSpeed * deltaTime;
      if (keys.current.has('ArrowRight') || keys.current.has('d')) dx += moveSpeed * deltaTime;

      // Normalize diagonal movement
      if (dx !== 0 && dy !== 0) {
        const factor = 1 / Math.sqrt(2);
        dx *= factor;
        dy *= factor;
      }

      // Only update if there's actual movement
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        const newPosition = {
          x: Math.max(20, Math.min(780, currentPlayer.position.x + dx)),
          y: Math.max(20, Math.min(580, currentPlayer.position.y + dy))
        };

        // Store last position for interpolation
        lastPosition.current = { ...currentPlayer.position };

        // Update local state immediately for smooth movement
        onPlayerMove(newPosition);
      }

      animationFrameId = requestAnimationFrame(moveLoop);
    };

    animationFrameId = requestAnimationFrame(moveLoop);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [roomState, socket, currentUser, onPlayerMove]);

  // FPS counter
  useEffect(() => {
    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    let animationFrameId;

    const updateFps = (currentTime) => {
      frameCount++;
      
      // Update FPS every second
      if (currentTime - lastFpsUpdate >= 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastFpsUpdate)));
        frameCount = 0;
        lastFpsUpdate = currentTime;
      }

      animationFrameId = requestAnimationFrame(updateFps);
    };

    animationFrameId = requestAnimationFrame(updateFps);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  // Render loop
  useEffect(() => {
    if (!canvasRef.current || !roomState) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let lastRenderTime = performance.now();

    const render = (currentTime) => {
      // Calculate time since last render
      const deltaTime = currentTime - lastRenderTime;
      lastRenderTime = currentTime;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background
      ctx.fillStyle = '#F3F4F6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw game objects
      if (roomState.objects) {
        roomState.objects.forEach(obj => renderGameObject(ctx, obj));
      }

      // Draw players
      if (roomState.participants) {
        // First pass: Draw movement trails for other players
        roomState.participants.forEach(participant => {
          if (participant.user._id !== currentUser?._id) {
            renderPlayer(ctx, participant);
          }
        });

        // Second pass: Draw current user
        const currentParticipant = roomState.participants.find(p => p.user._id === currentUser?._id);
        if (currentParticipant) {
          renderPlayer(ctx, currentParticipant);
        }
      }

      // Request next frame
      animationFrameId = requestAnimationFrame(render);
    };

    // Start render loop
    animationFrameId = requestAnimationFrame(render);

    // Handle canvas resize
    const handleResize = () => {
      const container = canvas.parentElement;
      if (!container) return;

      // Set canvas size to match container
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;

      // Force a render after resize
      render(performance.now());
    };

    // Initial resize
    handleResize();

    // Add resize listener
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [roomState, currentUser]);

  const renderPlayer = (ctx, participant) => {
    const { position, user, lastPosition: participantLastPosition } = participant;
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      return;
    }

    const isCurrentUser = user._id === currentUser?._id;
    
    // Calculate display position for smooth movement
    let displayPosition = { ...position };
    const lastPos = isCurrentUser ? lastPosition.current : participantLastPosition;

    if (lastPos) {
      const dx = position.x - lastPos.x;
      const dy = position.y - lastPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Use a fixed interpolation factor for smoother movement
      const interpolationFactor = 0.2; // Lower value = smoother but slower movement
      displayPosition = {
        x: lastPos.x + dx * interpolationFactor,
        y: lastPos.y + dy * interpolationFactor
      };
    }
    
    // Draw player circle with shadow for better visibility
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    ctx.beginPath();
    ctx.arc(displayPosition.x, displayPosition.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = isCurrentUser ? '#3B82F6' : '#10B981';
    ctx.fill();
    ctx.strokeStyle = '#1F2937';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw username with background for better readability
    ctx.font = 'bold 12px Arial';
    const username = user.username;
    const textMetrics = ctx.measureText(username);
    const textWidth = textMetrics.width;
    const textHeight = 16;
    const padding = 4;

    // Draw username background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(
      displayPosition.x - textWidth/2 - padding,
      displayPosition.y + 25 - textHeight/2 - padding,
      textWidth + padding * 2,
      textHeight + padding * 2
    );

    // Draw username text
    ctx.fillStyle = '#1F2937';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(username, displayPosition.x, displayPosition.y + 25);

    // Draw movement trail for other players
    if (!isCurrentUser && lastPos) {
      const dx = position.x - lastPos.x;
      const dy = position.y - lastPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 1) { // Only draw trail for significant movement
        const gradient = ctx.createLinearGradient(
          lastPos.x,
          lastPos.y,
          position.x,
          position.y
        );
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
        
        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(position.x, position.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
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

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full outline-none focus:ring-2 focus:ring-blue-500"
        tabIndex={0}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          keys.current.clear();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          canvasRef.current?.focus();
          setIsFocused(true);
        }}
      />
      {/* Debug overlay */}
      <div className="absolute top-0 left-0 p-2 text-xs text-gray-600 bg-white bg-opacity-50 rounded-br">
        <div>Players: {roomState?.participants?.length}</div>
        <div>Objects: {roomState?.objects?.length}</div>
        <div>Room: {roomState?.name}</div>
        <div>Socket: {socket?.connected ? 'Connected' : 'Disconnected'}</div>
        <div>User: {currentUser?.username}</div>
        <div>Canvas Focus: {isFocused ? 'Focused' : 'Not Focused'}</div>
        <div>Active Keys: {Array.from(keys.current).join(', ') || 'None'}</div>
        <div>FPS: {fps}</div>
      </div>
    </div>
  );
};

export default GameCanvas; 