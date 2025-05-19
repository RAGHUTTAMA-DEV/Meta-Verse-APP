import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import MainScene from './scenes/MainScene';

const PhaserGame = ({ roomState, socket, user }) => {
  const gameRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    // Debug log for props
    console.log('PhaserGame props:', {
      hasSocket: !!socket,
      socketConnected: socket?.connected,
      socketId: socket?.id,
      hasRoomState: !!roomState,
      roomId: roomState?._id,
      roomName: roomState?.name,
      hasUser: !!user,
      userId: user?._id
    });

    if (!gameRef.current) {
      const config = {
        type: Phaser.AUTO,
        width: 800,
        height: 600,
        scene: [MainScene],
        physics: { default: 'arcade' },
        parent: 'phaser-game',
        transparent: false,
        backgroundColor: '#f7fafc'
      };

      gameRef.current = new Phaser.Game(config);
      
      // Wait for the scene to be ready
      gameRef.current.events.once('ready', () => {
        sceneRef.current = gameRef.current.scene.getScene('MainScene');
        // Initialize scene with current data
        if (sceneRef.current) {
          sceneRef.current.events.emit('updateData', { roomState, socket, user });
        }
      });
    } else if (sceneRef.current) {
      // Update existing scene with new data
      sceneRef.current.events.emit('updateData', { roomState, socket, user });
    }

    // Cleanup
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, [roomState?._id, socket?.id, user?._id]); // Only recreate on key changes

  return <div id="phaser-game" className="w-full h-full" />;
};

export default PhaserGame;