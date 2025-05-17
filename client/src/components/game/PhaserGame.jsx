import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';

const TILE_SIZE = 20;
const PLAYER_SIZE = 30;
const MOVEMENT_SPEED = 3;

const PhaserGame = ({ roomState, socket, user }) => {
  const phaserRef = useRef(null);
  const gameRef = useRef(null);
  const latestRoomState = useRef(roomState);
  const latestSocket = useRef(socket);
  const latestUser = useRef(user);

  // Keep refs up to date
  useEffect(() => { latestRoomState.current = roomState; }, [roomState]);
  useEffect(() => { latestSocket.current = socket; }, [socket]);
  useEffect(() => { latestUser.current = user; }, [user]);

  useEffect(() => {
    if (!roomState || !user) return;
    if (gameRef.current) return; // Prevent multiple inits

    // Minimal debug scene (temporary) – only logs "create()" and "update()" (and "update event fired" every frame)
    class MinimalScene extends Phaser.Scene {
      constructor() {
        super('MinimalScene');
      }

      preload() {}

      create() {
        console.log("MinimalScene create() called – update() should now run every frame");
        this.events.on("update", () => { console.log("update event fired"); });
      }

      update() {
        console.log("MinimalScene update() called");
      }
    }

    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      backgroundColor: '#f7fafc',
      parent: phaserRef.current,
      scene: MinimalScene,
      physics: { default: 'arcade', arcade: { debug: false } },
      scale: { mode: Phaser.Scale.NONE },
      audio: { noAudio: true }
    };

    gameRef.current = new Phaser.Game(config);
    console.log("Phaser game instance created (using MinimalScene)");

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        console.log("Phaser game destroyed");
      }
    };
  }, [roomState, user, socket]);

  return (
    <div
      ref={phaserRef}
      style={{ width: 800, height: 600, margin: '0 auto', border: '1px solid #e2e8f0', borderRadius: 4 }}
    />
  );
};

export default PhaserGame; 