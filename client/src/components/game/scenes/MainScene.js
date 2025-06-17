import Phaser from 'phaser';
import PlayerSprite from '../phaser/PlayerSprite';
import RoomObjects from '../phaser/RoomObjects';
import NetworkManager from '../phaser/NetworkManager';

export default class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
    this.player = null;
    this.remotePlayers = new Map();
    this.roomObjects = null;
    this.network = null;
    this.cursors = null;
    this.wasd = null;
    this.roomState = null;
    this.socket = null;
    this.user = null;
    this.lastUpdateTime = 0;
    this.updateThrottle = 50; // ms between updates
    this.playerSpeed = 180; // pixels per second
    this.isConnected = false;
    this.isReady = false;
  }

  init(data) {
    // Initialize with data from PhaserGame
    this.updateSceneData(data);
  }

  updateSceneData(data) {
    // Validate input data
    if (!data) {
      console.warn('MainScene: updateSceneData called with no data');
      return;
    }

    console.log('Updating scene data:', {
      hasRoomState: !!data.roomState,
      hasSocket: !!data.socket,
      hasUser: !!data.user,
      socketConnected: data.socket?.connected,
      roomName: data.roomState?.name,
      isReady: this.isReady,
      sceneState: this.scene?.isActive?.() ? 'active' : 'inactive'
    });

    // Update scene data
    let shouldRefresh = false;

    if (data.roomState) {
      this.roomState = data.roomState;
      shouldRefresh = true;
    }

    if (data.socket) {
      // Only update socket if it's different
      if (this.socket !== data.socket) {
        // Clean up old network manager if it exists
        if (this.network) {
          this.network.destroy();
          this.network = null;
        }
        this.socket = data.socket;
        this.isConnected = data.socket.connected;
        // Create new network manager
        if (this.user) { // Only create network manager if we have user data
          try {
            this.network = new NetworkManager(this, this.socket, this.user);
          } catch (error) {
            console.error('MainScene: Failed to create NetworkManager:', error);
          }
        }
      }
    }

    if (data.user) {
      const oldUserId = this.user?._id;
      this.user = data.user;
      // Create network manager if we have socket but no network manager
      if (this.socket && !this.network && this.user) {
        try {
          this.network = new NetworkManager(this, this.socket, this.user);
        } catch (error) {
          console.error('MainScene: Failed to create NetworkManager:', error);
        }
      }
      // Refresh if user changed
      if (oldUserId !== this.user._id) {
        shouldRefresh = true;
      }
    }

    // If we have all required data and the scene is ready, refresh
    if (shouldRefresh && this.roomState && this.socket && this.user && this.isReady) {
      // Use next frame to ensure scene is ready
      this.time.delayedCall(0, () => {
        if (this.isReady) {
          this.refreshScene();
        }
      });
    }
  }

  createEnvironment() {

    if (this.roomState && this.roomState.objects) {
      try {
        this.roomObjects = new RoomObjects(this, this.roomState.objects);
      } catch (error) {
        console.error('MainScene: Failed to create room objects:', error);
      }
    }
  }

  createPlayer() {
    const startX = this.roomState?.objects?.spawnPoint?.x || 400;
    const startY = this.roomState?.objects?.spawnPoint?.y || 300;

    try {
      this.player = new PlayerSprite(this, startX, startY, this.user);
    } catch (error) {
      console.error('MainScene: Failed to create player:', error);
    }
  }

  refreshScene() {
    console.log('Refreshing scene', {
      hasRoomState: !!this.roomState,
      hasUser: !!this.user,
      isReady: this.isReady,
      timestamp: new Date().toISOString()
    });

    this.clearScene();
    
    if (this.roomState && this.user) {
      try {
        this.createEnvironment();
        this.createPlayer();
        
        this.setupSocketHandlers();
        
        console.log('Scene refreshed successfully', {
          hasPlayer: !!this.player,
          hasRoomObjects: !!this.roomObjects,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('MainScene: Error refreshing scene:', error);
      }
    } else {
      console.warn('MainScene: Cannot refresh scene - missing required data', {
        hasRoomState: !!this.roomState,
        hasUser: !!this.user,
        timestamp: new Date().toISOString()
      });
    }
  }

  clearScene() {
    console.log('Clearing scene', {
      hasPlayer: !!this.player,
      remotePlayerCount: this.remotePlayers.size,
      hasRoomObjects: !!this.roomObjects,
      timestamp: new Date().toISOString()
    });

    if (this.player) {
      try {
        this.player.sprite.destroy();
        this.player.label.destroy();
      } catch (error) {
        console.error('MainScene: Error destroying player:', error);
      }
      this.player = null;
    }
    
    for (const [id, player] of this.remotePlayers.entries()) {
      try {
        player.sprite.destroy();
        player.label.destroy();
      } catch (error) {
        console.error('MainScene: Error destroying remote player:', { id, error });
      }
    }
    this.remotePlayers.clear();
    
    if (this.roomObjects) {
      try {
        this.roomObjects.destroy();
      } catch (error) {
        console.error('MainScene: Error destroying room objects:', error);
      }
      this.roomObjects = null;
    }
  }

  preload() {  }

  create() {

    this.add.rectangle(0, 0, 800, 600, 0xf7fafc).setOrigin(0, 0);
  
    const grid = this.add.graphics();
    grid.lineStyle(1, 0xcccccc, 0.5);
    for (let x = 0; x <= 800; x += 20) {
      grid.moveTo(x, 0);
      grid.lineTo(x, 600);
    }
    for (let y = 0; y <= 600; y += 20) {
      grid.moveTo(0, y);
      grid.lineTo(800, y);
    }
    grid.strokePath();

    this.debugText = this.add.text(10, 10, '', {
      fontFamily: 'Arial',
      fontSize: 14,
      color: '#222',
      backgroundColor: '#ffffff80',
      padding: { x: 5, y: 5 }
    });
    this.debugText.setDepth(1000);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });

 
    this.time.delayedCall(100, () => {
      this.isReady = true;
      if (this.roomState && this.socket && this.user) {
        this.refreshScene();
      }
    });

    this.events.on('updateData', this.updateSceneData, this);
  }

  setupSocketHandlers() {
 
    this.events.on('connectionStatusChanged', (isConnected) => {
      console.log('Connection status changed:', {
        isConnected,
        socketId: this.socket?.id,
        timestamp: new Date().toISOString()
      });
      this.isConnected = isConnected;
      
      this.updateDebugText();
      
      if (!isConnected) {
        this.showConnectionMessage('Disconnected from server. Attempting to reconnect...');
      } else {
        this.hideConnectionMessage();
      }
    });

    this.events.on('updateRemotePlayers', (remoteParticipants) => {
      if (!this.isConnected) return;

      remoteParticipants.forEach(p => {
        if (!this.remotePlayers.has(p.user._id)) {

          const remotePlayer = new PlayerSprite(this, p.position.x, p.position.y, p.user);
          this.remotePlayers.set(p.user._id, remotePlayer);
        } else {

          const remotePlayer = this.remotePlayers.get(p.user._id);
          this.tweens.add({
            targets: [remotePlayer.sprite, remotePlayer.label],
            x: p.position.x,
            y: p.position.y,
            duration: 100,
            ease: 'Linear',
            onUpdate: () => {
              remotePlayer.label.y = remotePlayer.sprite.y - (remotePlayer.radius + 4);
            }
          });
        }
      });

      const currentPlayerIds = new Set(remoteParticipants.map(p => p.user._id));
      for (const [id, player] of this.remotePlayers.entries()) {
        if (!currentPlayerIds.has(id)) {
          player.sprite.destroy();
          player.label.destroy();
          this.remotePlayers.delete(id);
        }
      }
    });

    this.events.on('playerMoved', (data) => {
      if (!this.isConnected) return;

      const { userId, position } = data;
      if (userId !== this.user._id && this.remotePlayers.has(userId)) {
        const player = this.remotePlayers.get(userId);
        this.tweens.add({
          targets: [player.sprite, player.label],
          x: position.x,
          y: position.y,
          duration: 100,
          ease: 'Linear',
          onUpdate: () => {
            player.label.y = player.sprite.y - (player.radius + 4);
          }
        });
      }
    });

    this.events.on('playerJoined', (data) => {
      if (!this.isConnected) return;

      if (data.user._id !== this.user._id) {
        const player = new PlayerSprite(this, data.position.x, data.position.y, data.user);
        this.remotePlayers.set(data.user._id, player);
      }
    });

    this.events.on('playerLeft', (userId) => {
      if (!this.isConnected) return;

      if (this.remotePlayers.has(userId)) {
        const player = this.remotePlayers.get(userId);
        player.sprite.destroy();
        player.label.destroy();
        this.remotePlayers.delete(userId);
      }
    });
  }

  showConnectionMessage(text) {
    if (!this.connectionMessage) {
      this.connectionMessage = this.add.text(400, 300, text, {
        fontFamily: 'Arial',
        fontSize: 16,
        color: '#ffffff',
        backgroundColor: '#ff0000',
        padding: { x: 10, y: 5 }
      }).setOrigin(0.5).setDepth(1000);
    } else {
      this.connectionMessage.setText(text).setVisible(true);
    }
  }

  hideConnectionMessage() {
    if (this.connectionMessage) {
      this.connectionMessage.setVisible(false);
    }
  }

  update(time, delta) {
    if (!this.player || !this.player.sprite || !this.isConnected) return;

    const speed = this.playerSpeed * (delta / 1000); 

    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= speed;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += speed;
    if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= speed;
    if (this.cursors.down.isDown || this.wasd.down.isDown) dy += speed;

    if (dx !== 0 && dy !== 0) {
      const factor = 1 / Math.sqrt(2);
      dx *= factor;
      dy *= factor;
    }

    if (dx !== 0 || dy !== 0) {
      this.player.sprite.x += dx;
      this.player.sprite.y += dy;
      this.player.label.x = this.player.sprite.x;
      this.player.label.y = this.player.sprite.y - (this.player.radius + 4);

      if (this.network) {
        this.network.sendPlayerUpdate({
          x: this.player.sprite.x,
          y: this.player.sprite.y
        });
      }
    }

    this.updateDebugText();
  }

  updateDebugText() {
    if (!this.debugText) return;
    
    const fps = Math.round(this.game.loop.actualFps);
    const playerCount = this.remotePlayers.size + 1;
    const position = this.player ? 
      `(${Math.round(this.player.sprite.x)}, ${Math.round(this.player.sprite.y)})` : 
      'N/A';
    const roomName = this.roomState?.name || 'N/A';
    const connected = this.isConnected ? 'Yes' : 'No';
    
    this.debugText.setText([
      `FPS: ${fps}`,
      `Players: ${playerCount}`,
      `Position: ${position}`,
      `Room: ${roomName}`,
      `Connected: ${connected}`
    ].join('\n'));
  }

  shutdown() {
    this.events.off('updateData', this.updateSceneData, this);
    this.events.off('connectionStatusChanged');
    this.events.off('updateRemotePlayers');
    this.events.off('playerMoved');
    this.events.off('playerJoined');
    this.events.off('playerLeft');
    
    this.clearScene();
    if (this.network) {
      this.network.destroy();
      this.network = null;
    }

    this.hideConnectionMessage();
  }
}
