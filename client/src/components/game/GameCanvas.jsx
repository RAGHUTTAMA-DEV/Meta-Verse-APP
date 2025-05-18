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
  const lastMoveTime = useRef(0);
  const moveThrottle = 16;
  const movementSpeed = 3;
  const lastPosition = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const animationFrameId = useRef(null);

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

  // Auto-focus canvas when component mounts or room state changes
  useEffect(() => {
    const focusCanvas = () => {
      if (canvasRef.current) {
        canvasRef.current.focus();
        setIsFocused(true);
        console.log('Canvas focused:', {
          timestamp: new Date().toISOString(),
          activeElement: document.activeElement === canvasRef.current,
          hasSocket: !!socket,
          socketConnected: socket?.connected
        });
      }
    };

    // Focus immediately
    focusCanvas();

    // Add click handler to parent container
    const container = canvasRef.current?.parentElement;
    if (container) {
      const handleContainerClick = (e) => {
        // Only focus if clicking directly on the container or canvas
        if (e.target === container || e.target === canvasRef.current) {
          focusCanvas();
        }
      };
      container.addEventListener('click', handleContainerClick);
      return () => container.removeEventListener('click', handleContainerClick);
    }
  }, [roomState, socket]);

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
      // Only handle keys if canvas is focused
      if (!isFocused) return;

      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault(); // Prevent default browser behavior
        if (!keys.current.has(key)) {
          keys.current.add(key);
          console.log('Key pressed:', {
            key,
            activeKeys: Array.from(keys.current),
            isFocused,
            hasSocket: !!socket,
            socketConnected: socket?.connected,
            timestamp: new Date().toISOString()
          });
        }
      }
    };

    const handleKeyUp = (e) => {
      // Only handle keys if canvas is focused
      if (!isFocused) return;

      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault(); // Prevent default browser behavior
        if (keys.current.has(key)) {
          keys.current.delete(key);
          console.log('Key released:', {
            key,
            activeKeys: Array.from(keys.current),
            isFocused,
            hasSocket: !!socket,
            socketConnected: socket?.connected,
            timestamp: new Date().toISOString()
          });
        }
      }
    };

    // Add keyboard listeners to window
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isFocused, socket]);

  // Movement loop
  useEffect(() => {
    if (!socket?.connected || !roomState || !currentUser) {
      console.log('Movement loop not started:', {
        hasSocket: !!socket,
        socketConnected: socket?.connected,
        hasRoomState: !!roomState,
        hasUser: !!currentUser,
        timestamp: new Date().toISOString()
      });
      return;
    }

    let lastFrameTime = performance.now();
    const moveThrottle = 16; // ~60fps

    const movementLoop = (timestamp) => {
      // Calculate delta time
      const deltaTime = timestamp - lastFrameTime;
      if (deltaTime < moveThrottle) {
        animationFrameId.current = requestAnimationFrame(movementLoop);
        return;
      }
      lastFrameTime = timestamp;

      // Update FPS counter
      frameCount.current++;
      if (timestamp - lastFpsUpdate.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastFpsUpdate.current = timestamp;
      }

      // Only process movement if canvas is focused and we have active keys
      if (isFocused && keys.current.size > 0) {
        const player = roomState.participants?.find(p => p.user._id === currentUser._id);
        if (!player) {
          console.log('No player found for movement:', {
            userId: currentUser._id,
            participants: roomState.participants,
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Store current position for interpolation
        lastPosition.current = { ...player.position };

        let moved = false;
        const newPosition = { ...player.position };
        const activeKeys = Array.from(keys.current);

        // Calculate movement based on active keys
        const isDiagonal = 
          (activeKeys.includes('w') || activeKeys.includes('arrowup')) && 
          (activeKeys.includes('a') || activeKeys.includes('arrowleft')) ||
          (activeKeys.includes('w') || activeKeys.includes('arrowup')) && 
          (activeKeys.includes('d') || activeKeys.includes('arrowright')) ||
          (activeKeys.includes('s') || activeKeys.includes('arrowdown')) && 
          (activeKeys.includes('a') || activeKeys.includes('arrowleft')) ||
          (activeKeys.includes('s') || activeKeys.includes('arrowdown')) && 
          (activeKeys.includes('d') || activeKeys.includes('arrowright'));

        const speed = isDiagonal ? movementSpeed * 0.707 : movementSpeed;

        if (activeKeys.includes('w') || activeKeys.includes('arrowup')) {
          newPosition.y -= speed;
          moved = true;
        }
        if (activeKeys.includes('s') || activeKeys.includes('arrowdown')) {
          newPosition.y += speed;
          moved = true;
        }
        if (activeKeys.includes('a') || activeKeys.includes('arrowleft')) {
          newPosition.x -= speed;
          moved = true;
        }
        if (activeKeys.includes('d') || activeKeys.includes('arrowright')) {
          newPosition.x += speed;
          moved = true;
        }

        // Keep player within bounds
        const bounds = {
          minX: 20,
          maxX: canvasRef.current.width - 20,
          minY: 20,
          maxY: canvasRef.current.height - 20
        };

        newPosition.x = Math.max(bounds.minX, Math.min(bounds.maxX, newPosition.x));
        newPosition.y = Math.max(bounds.minY, Math.min(bounds.maxY, newPosition.y));

        if (moved) {
          console.log('Sending movement update:', {
            oldPosition: player.position,
            newPosition,
            activeKeys,
            isDiagonal,
            speed,
            timestamp: new Date().toISOString()
          });

          onPlayerMove(newPosition);
        }
      }

      // Render frame
      render();

      // Request next frame
      animationFrameId.current = requestAnimationFrame(movementLoop);
    };

    // Start movement loop
    animationFrameId.current = requestAnimationFrame(movementLoop);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [roomState, currentUser, onPlayerMove, socket, isFocused]);

  // Initialize canvas and setup
  useEffect(() => {
    if (!canvasRef.current || !roomState) {
      console.log('Cannot initialize canvas:', {
        hasCanvas: !!canvasRef.current,
        hasRoomState: !!roomState,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas size
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;
      
      // Set canvas size to match container
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      
      console.log('Canvas resized:', {
        width: canvas.width,
        height: canvas.height,
        containerWidth: container.clientWidth,
        containerHeight: container.clientHeight,
        timestamp: new Date().toISOString()
      });

      // Trigger a render after resize
      render();
    };

    // Initial resize
    resizeCanvas();

    // Add resize listener
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [roomState]); // Only re-run if roomState changes

  const renderPlayer = (ctx, participant) => {
    const { position, user, lastPosition: participantLastPosition } = participant;
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      console.warn('Invalid position for participant:', {
        userId: user._id,
        username: user.username,
        position,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const isCurrentUser = user._id === currentUser?._id;
    
    // Calculate movement direction and speed for interpolation
    let displayPosition = { ...position };
    const lastPos = isCurrentUser ? lastPosition.current : participantLastPosition;

    if (lastPos) {
      const dx = position.x - lastPos.x;
      const dy = position.y - lastPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // If the movement is significant, interpolate the position
      if (distance > 0.1) {
        // Use a faster interpolation speed for other players to catch up
        const speed = isCurrentUser ? 
          Math.min(distance * 0.3, movementSpeed) : 
          Math.min(distance * 0.5, movementSpeed * 1.5); // Increased interpolation speed for other players
        
        const angle = Math.atan2(dy, dx);
        displayPosition = {
          x: lastPos.x + Math.cos(angle) * speed,
          y: lastPos.y + Math.sin(angle) * speed
        };

        // Log movement interpolation for debugging
        if (!isCurrentUser) {
          console.log('Interpolating other player movement:', {
            userId: user._id,
            username: user.username,
            lastPosition: lastPos,
            targetPosition: position,
            displayPosition,
            distance,
            speed,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
    
    // Draw movement trail first (for other players)
    if (!isCurrentUser && lastPos) {
      const dx = position.x - lastPos.x;
      const dy = position.y - lastPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0.1) {
        // Draw movement trail with gradient
        const gradient = ctx.createLinearGradient(
          lastPos.x,
          lastPos.y,
          position.x,
          position.y
        );
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
        
        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(position.x, position.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 6;
        ctx.stroke();

        // Draw movement particles
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
          const t = i / particleCount;
          const particleX = lastPos.x + dx * t;
          const particleY = lastPos.y + dy * t;
          
          ctx.beginPath();
          ctx.arc(particleX, particleY, 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(16, 185, 129, ${0.8 * (1 - t)})`;
          ctx.fill();
        }
      }
    }
    
    // Draw player circle with a larger size for better visibility
    ctx.beginPath();
    ctx.arc(displayPosition.x, displayPosition.y, 25, 0, Math.PI * 2);
    ctx.fillStyle = isCurrentUser ? '#3B82F6' : '#10B981';
    ctx.fill();
    ctx.strokeStyle = '#1F2937';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw username with better visibility
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#1F2937';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(user.username, displayPosition.x, displayPosition.y + 40);

    // Draw movement direction indicator for other players
    if (!isCurrentUser && lastPos) {
      const dx = position.x - lastPos.x;
      const dy = position.y - lastPos.y;
      
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        const angle = Math.atan2(dy, dx);
        const arrowLength = 20;
        
        // Draw direction arrow with gradient
        const arrowGradient = ctx.createLinearGradient(
          displayPosition.x,
          displayPosition.y,
          displayPosition.x + arrowLength * Math.cos(angle),
          displayPosition.y + arrowLength * Math.sin(angle)
        );
        arrowGradient.addColorStop(0, '#10B981');
        arrowGradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
        
        ctx.beginPath();
        ctx.moveTo(displayPosition.x, displayPosition.y);
        ctx.lineTo(
          displayPosition.x + arrowLength * Math.cos(angle),
          displayPosition.y + arrowLength * Math.sin(angle)
        );
        ctx.strokeStyle = arrowGradient;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw arrow head
        const headLength = 10;
        const headAngle = Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(
          displayPosition.x + arrowLength * Math.cos(angle),
          displayPosition.y + arrowLength * Math.sin(angle)
        );
        ctx.lineTo(
          displayPosition.x + arrowLength * Math.cos(angle) - headLength * Math.cos(angle - headAngle),
          displayPosition.y + arrowLength * Math.sin(angle) - headLength * Math.sin(angle - headAngle)
        );
        ctx.lineTo(
          displayPosition.x + arrowLength * Math.cos(angle) - headLength * Math.cos(angle + headAngle),
          displayPosition.y + arrowLength * Math.sin(angle) - headLength * Math.sin(angle + headAngle)
        );
        ctx.closePath();
        ctx.fillStyle = '#10B981';
        ctx.fill();
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

  const render = () => {
    if (!canvasRef.current || !roomState) {
      console.log('Cannot render:', {
        hasCanvas: !!canvasRef.current,
        hasRoomState: !!roomState,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get canvas context');
      return;
    }

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
      // Log current state of all participants
      console.log('Rendering participants:', {
        count: roomState.participants.length,
        participants: roomState.participants.map(p => ({
          userId: p.user._id,
          username: p.user.username,
          position: p.position,
          lastPosition: p.lastPosition,
          isCurrentUser: p.user._id === currentUser?._id
        })),
        timestamp: new Date().toISOString()
      });

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

    // Draw FPS counter
    if (fps > 0) {
      ctx.font = '14px Arial';
      ctx.fillStyle = '#4B5563';
      ctx.textAlign = 'left';
      ctx.fillText(`FPS: ${Math.round(fps)}`, 10, 20);
    }

    // Request next frame
    animationFrameId.current = requestAnimationFrame(render);
  };

  // Start render loop
  useEffect(() => {
    if (canvasRef.current && roomState) {
      console.log('Starting render loop:', {
        hasCanvas: !!canvasRef.current,
        hasRoomState: !!roomState,
        timestamp: new Date().toISOString()
      });
      animationFrameId.current = requestAnimationFrame(render);
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [roomState]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full outline-none focus:ring-2 focus:ring-blue-500"
        tabIndex={0}
        onFocus={() => {
          setIsFocused(true);
          console.log('Canvas focused:', {
            timestamp: new Date().toISOString(),
            activeElement: document.activeElement === canvasRef.current,
            hasSocket: !!socket,
            socketConnected: socket?.connected
          });
        }}
        onBlur={() => {
          setIsFocused(false);
          keys.current.clear();
          console.log('Canvas blurred:', {
            timestamp: new Date().toISOString(),
            activeElement: document.activeElement === canvasRef.current,
            hasSocket: !!socket,
            socketConnected: socket?.connected
          });
        }}
        onClick={(e) => {
          e.stopPropagation(); // Prevent event bubbling
          canvasRef.current?.focus();
          setIsFocused(true);
          console.log('Canvas clicked and focused:', {
            timestamp: new Date().toISOString(),
            activeElement: document.activeElement === canvasRef.current,
            hasSocket: !!socket,
            socketConnected: socket?.connected
          });
        }}
      />
      {/* Debug overlay */}
      <div className="absolute top-0 left-0 p-2 text-xs text-gray-600 bg-white bg-opacity-50">
        <div>Players: {roomState?.participants?.length}</div>
        <div>Objects: {roomState?.objects?.length}</div>
        <div>Room: {roomState?.name}</div>
        <div>Socket: {socket?.connected ? 'Connected' : 'Disconnected'}</div>
        <div>User: {currentUser?.username}</div>
        <div>Canvas Focus: {isFocused ? 'Focused' : 'Not Focused'}</div>
        <div>Active Keys: {Array.from(keys.current).join(', ') || 'None'}</div>
        <div>FPS: {Math.round(fps)}</div>
      </div>
    </div>
  );
};

export default GameCanvas; 