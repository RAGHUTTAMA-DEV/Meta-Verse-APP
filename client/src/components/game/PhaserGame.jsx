import React, { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import MainScene from './scenes/MainScene';

const PhaserGame = ({ roomState, socket, user }) => {
  const gameRef = useRef(null);
  const sceneRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Define handleResize as a useCallback
  const handleResize = useCallback(() => {
    if (gameRef.current) {
      const container = document.getElementById('phaser-game');
      if (container) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        gameRef.current.scale.resize(width, height);
      }
    }
  }, []);

  // Validate required props
  useEffect(() => {
    // Log raw props first
    console.log('PhaserGame received props:', {
      roomState: roomState ? {
        id: roomState._id,
        name: roomState.name,
        participants: roomState.participants?.length || 0,
        objects: roomState.objects?.length || 0
      } : null,
      socket: socket ? {
        id: socket.id,
        connected: socket.connected
      } : null,
      user: user ? {
        id: user._id,
        username: user.username
      } : null,
      timestamp: new Date().toISOString()
    });

    const validateProps = () => {
      const validation = {
        roomState: {
          exists: !!roomState,
          hasId: !!roomState?._id,
          hasParticipants: Array.isArray(roomState?.participants),
          hasObjects: Array.isArray(roomState?.objects),
          data: roomState
        },
        socket: {
          exists: !!socket,
          connected: socket?.connected,
          hasId: !!socket?.id,
          data: socket
        },
        user: {
          exists: !!user,
          hasId: !!user?._id,
          hasUsername: !!user?.username,
          data: user
        }
      };

      // Log detailed validation results
      console.log('PhaserGame props validation details:', {
        roomState: {
          exists: validation.roomState.exists,
          hasId: validation.roomState.hasId,
          hasParticipants: validation.roomState.hasParticipants,
          hasObjects: validation.roomState.hasObjects,
          value: roomState
        },
        socket: {
          exists: validation.socket.exists,
          connected: validation.socket.connected,
          hasId: validation.socket.hasId,
          value: socket
        },
        user: {
          exists: validation.user.exists,
          hasId: validation.user.hasId,
          hasUsername: validation.user.hasUsername,
          value: user
        }
      });

      // Check if all required data is present
      const isValid = 
        validation.roomState.exists && 
        validation.roomState.hasId && 
        validation.roomState.hasParticipants &&
        validation.socket.exists && 
        validation.socket.connected && 
        validation.socket.hasId &&
        validation.user.exists && 
        validation.user.hasId && 
        validation.user.hasUsername;

      if (!isValid) {
        const missingProps = {
          roomState: !validation.roomState.exists ? 'missing' :
            !validation.roomState.hasId ? 'missing id' :
            !validation.roomState.hasParticipants ? 'missing participants' :
            !validation.roomState.hasObjects ? 'missing objects' : null,
          socket: !validation.socket.exists ? 'missing' :
            !validation.socket.connected ? 'not connected' :
            !validation.socket.hasId ? 'missing id' : null,
          user: !validation.user.exists ? 'missing' :
            !validation.user.hasId ? 'missing id' :
            !validation.user.hasUsername ? 'missing username' : null
        };

        console.error('PhaserGame: Missing required props:', {
          roomState: missingProps.roomState || 'valid',
          socket: missingProps.socket || 'valid',
          user: missingProps.user || 'valid',
          rawProps: {
            roomState: roomState,
            socket: socket,
            user: user
          }
        });
      }

      return isValid;
    };

    // Only proceed if all required props are valid
    if (!validateProps()) {
      console.error('PhaserGame: Cannot initialize - missing required props');
      setIsInitialized(false);
      return;
    }

    // If we already have a game instance, update it
    if (gameRef.current) {
      console.log('Updating existing game instance:', {
        roomId: roomState._id,
        socketId: socket.id,
        userId: user._id,
        timestamp: new Date().toISOString()
      });

      if (sceneRef.current) {
        sceneRef.current.updateSceneData({ roomState, socket, user });
        sceneRef.current.refreshScene();
      }
      return;
    }

    // Initialize new game instance
    console.log('Initializing new Phaser game:', {
      roomId: roomState._id,
      socketId: socket.id,
      userId: user._id,
      timestamp: new Date().toISOString()
    });

    const config = {
      type: Phaser.AUTO,
      scale: {
        mode: Phaser.Scale.RESIZE,
        parent: 'phaser-game',
        width: '100%',
        height: '100%',
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      scene: [MainScene],
      physics: { 
        default: 'arcade',
        arcade: {
          debug: true,
          gravity: { y: 0 }
        }
      },
      transparent: false,
      backgroundColor: '#f7fafc'
    };

    try {
      gameRef.current = new Phaser.Game(config);
      
      // Add resize listener
      window.addEventListener('resize', handleResize);
      
      // Wait for the scene to be created and ready
      const checkScene = () => {
        const scene = gameRef.current.scene.getScene('MainScene');
        if (scene) {
          console.log('MainScene found, setting up initialization');
          
          // Set up scene reference
          sceneRef.current = scene;
          
          // Initialize scene with current data
          sceneRef.current.updateSceneData({ 
            roomState: {
              ...roomState,
              participants: roomState.participants || [],
              objects: roomState.objects || []
            }, 
            socket, 
            user 
          });

          // Set up socket handlers
          sceneRef.current.setupSocketHandlers();
          
          // Refresh the scene
          sceneRef.current.refreshScene();
          setIsInitialized(true);
        } else {
          console.log('Waiting for MainScene to be created...');
          // Check again after a short delay
          setTimeout(checkScene, 100);
        }
      };

      // Start checking for scene
      gameRef.current.events.once('ready', () => {
        console.log('Phaser game ready, checking for scene');
        checkScene();
      });
    } catch (error) {
      console.error('Error initializing Phaser game:', error);
      setIsInitialized(false);
    }

    // Cleanup
    return () => {
      console.log('Cleaning up Phaser game');
      window.removeEventListener('resize', handleResize);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
        setIsInitialized(false);
      }
    };
  }, [roomState?._id, socket?.id, user?._id]); // Only recreate on key changes

  // Show loading state if not initialized
  if (!isInitialized) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-gray-500">Initializing game...</div>
      </div>
    );
  }

  return <div id="phaser-game" className="w-full h-full" />;
};

export default PhaserGame;