import Phaser from 'phaser';
import PlayerSprite from '../phaser/PlayerSprite';
import RoomObjects from '../phaser/RoomObjects';
import NetworkManager from '../phaser/NetworkManager';
import ModernMapSystem from '../phaser/ModernMapSystem';

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
    this.mapSystem = null;
    this.debugText = null;
  }

  validateSceneData(data) {
    const validation = {
      roomState: {
        exists: !!data.roomState,
        hasId: !!data.roomState?._id,
        hasParticipants: Array.isArray(data.roomState?.participants),
        hasObjects: Array.isArray(data.roomState?.objects),
        data: data.roomState
      },
      socket: {
        exists: !!data.socket,
        connected: data.socket?.connected,
        hasId: !!data.socket?.id,
        data: data.socket
      },
      user: {
        exists: !!data.user,
        hasId: !!data.user?._id,
        hasUsername: !!data.user?.username,
        data: data.user
      }
    };

    console.log('Scene data validation:', validation);

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
      console.error('Scene: Invalid data received:', {
        missingRoomState: !validation.roomState.exists,
        missingRoomId: !validation.roomState.hasId,
        missingParticipants: !validation.roomState.hasParticipants,
        missingSocket: !validation.socket.exists,
        socketNotConnected: !validation.socket.connected,
        missingSocketId: !validation.socket.hasId,
        missingUser: !validation.user.exists,
        missingUserId: !validation.user.hasId,
        missingUsername: !validation.user.hasUsername
      });
    }

    return isValid;
  }

  updateSceneData(data) {
    console.log('Updating scene data:', {
      hasRoomState: !!data.roomState,
      hasSocket: !!data.socket,
      hasUser: !!data.user,
      roomState: data.roomState ? {
        id: data.roomState._id,
        name: data.roomState.name,
        participants: data.roomState.participants?.length || 0,
        hasObjects: !!data.roomState.objects
      } : null,
      user: data.user ? {
        id: data.user._id,
        username: data.user.username
      } : null,
      socket: data.socket ? {
        id: data.socket.id,
        connected: data.socket.connected
      } : null,
      isReady: this.isReady,
      timestamp: new Date().toISOString()
    });

    // Validate data before updating
    if (!this.validateSceneData(data)) {
      console.error('Scene: Cannot update - invalid data');
      return;
    }

    let shouldRefresh = false;

    // Update socket if changed
    if (data.socket && (!this.socket || this.socket.id !== data.socket.id)) {
      console.log('Socket updated:', {
        oldId: this.socket?.id,
        newId: data.socket.id,
        connected: data.socket.connected
      });
      this.socket = data.socket;
      this.isConnected = data.socket.connected;
      shouldRefresh = true;
    }

    // Update user if changed
    if (data.user && (!this.user || this.user._id !== data.user._id)) {
      console.log('User updated:', {
        oldId: this.user?._id,
        newId: data.user._id,
        username: data.user.username
      });
      this.user = data.user;
      shouldRefresh = true;
    }

    // Update room state if changed
    if (data.roomState && (!this.roomState || this.roomState._id !== data.roomState._id)) {
      console.log('Room state updated:', {
        oldId: this.roomState?._id,
        newId: data.roomState._id,
        name: data.roomState.name,
        participants: data.roomState.participants?.length || 0,
        hasObjects: !!data.roomState.objects
      });

      // Ensure room state has required properties
      this.roomState = {
        ...data.roomState,
        participants: data.roomState.participants || [],
        objects: data.roomState.objects || []
      };
      shouldRefresh = true;
    }

    // If we have all required data and the scene is ready, refresh
    if (shouldRefresh && this.roomState && this.socket && this.user && this.isReady) {
      console.log('All required data present, refreshing scene:', {
        hasRoomState: !!this.roomState,
        hasSocket: !!this.socket,
        hasUser: !!this.user,
        isReady: this.isReady,
        isConnected: this.isConnected,
        roomId: this.roomState._id,
        userId: this.user._id,
        socketId: this.socket.id
      });
      this.refreshScene();
    } else {
      console.log('Cannot refresh scene - missing required data:', {
        hasRoomState: !!this.roomState,
        hasSocket: !!this.socket,
        hasUser: !!this.user,
        isReady: this.isReady,
        isConnected: this.isConnected,
        roomId: this.roomState?._id,
        userId: this.user?._id,
        socketId: this.socket?.id
      });
    }
  }

  createEnvironment() {
    // Create room objects if we have room state
    if (this.roomState && this.roomState.objects) {
      try {
        this.roomObjects = new RoomObjects(this, this.roomState.objects);
      } catch (error) {
        console.error('MainScene: Failed to create room objects:', error);
      }
    }
  }

  createPlayer() {
    console.log('Creating player:', {
      userId: this.user?._id,
      username: this.user?.username,
      hasRoomState: !!this.roomState,
      roomId: this.roomState?._id,
      spawnPoint: this.roomState?.objects?.spawnPoint,
      timestamp: new Date().toISOString()
    });

    if (!this.user) {
      console.error('Cannot create player - no user data');
      return;
    }

    const startX = this.roomState?.objects?.spawnPoint?.x || 400;
    const startY = this.roomState?.objects?.spawnPoint?.y || 300;

    try {
      this.player = new PlayerSprite(this, startX, startY, this.user);
      console.log('Player sprite created:', {
        position: { x: startX, y: startY },
        sprite: !!this.player.sprite,
        label: !!this.player.label
      });
      
      this.physics.add.existing(this.player.sprite);
      this.player.sprite.body.setCircle(this.player.radius);
      console.log('Physics body added to player');
      
      this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
      this.cameras.main.setZoom(1);
      console.log('Camera set to follow player');

      console.log('Player creation complete:', {
        position: { x: this.player.sprite.x, y: this.player.sprite.y },
        hasPhysics: !!this.player.sprite.body,
        hasLabel: !!this.player.label,
        isVisible: this.player.sprite.visible
      });
    } catch (error) {
      console.error('Failed to create player:', error);
      // Try to clean up any partially created player
      if (this.player) {
        try {
          if (this.player.sprite) this.player.sprite.destroy();
          if (this.player.label) this.player.label.destroy();
        } catch (cleanupError) {
          console.error('Error cleaning up failed player:', cleanupError);
        }
        this.player = null;
      }
    }
  }

  refreshScene() {
    console.log('Refreshing scene:', {
      hasPlayer: !!this.player,
      hasRoomState: !!this.roomState,
      hasSocket: !!this.socket,
      hasUser: !!this.user,
      isReady: this.isReady,
      isConnected: this.isConnected,
      roomId: this.roomState?._id,
      userId: this.user?._id,
      socketId: this.socket?.id,
      timestamp: new Date().toISOString()
    });

    this.clearScene();

    // Create new scene elements
    if (this.roomState && this.user) {
      console.log('Creating new scene elements');
      
      this.createPlayer();
      
      if (this.roomState.objects) {
        console.log('Creating room objects:', {
          count: this.roomState.objects.length
        });
        this.roomObjects = new RoomObjects(this);
        this.roomState.objects.forEach(obj => this.roomObjects.createObject(obj));
      }
      if (this.roomState.participants) {
        console.log('Creating other players:', {
          count: this.roomState.participants.length,
          currentUserId: this.user._id
        });
        this.roomState.participants.forEach(participant => {
          if (participant.user._id !== this.user._id) {
            const remotePlayer = new PlayerSprite(
              this,
              participant.position?.x || 400,
              participant.position?.y || 300,
              participant.user
            );
            this.remotePlayers.set(participant.user._id, remotePlayer);
          }
        });
      }

      if (this.socket && this.user) {
        console.log('Setting up network manager with data:', {
          userId: this.user._id,
          socketId: this.socket.id,
          timestamp: new Date().toISOString()
        });
        this.network = new NetworkManager(this, this.socket, this.user);
      } else {
        console.warn('Cannot set up network manager - missing required data:', {
          hasSocket: !!this.socket,
          hasUser: !!this.user,
          socketId: this.socket?.id,
          userId: this.user?._id,
          timestamp: new Date().toISOString()
        });
      }

      console.log('Scene refresh complete:', {
        hasPlayer: !!this.player,
        remotePlayerCount: this.remotePlayers.size,
        hasRoomObjects: !!this.roomObjects,
        hasNetwork: !!this.network
      });
    } else {
      console.warn('Cannot create scene elements - missing required data:', {
        hasRoomState: !!this.roomState,
        hasUser: !!this.user
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

  preload() {
    }

  create() {
    console.log('Creating scene:', {
      hasRoomState: !!this.roomState,
      hasSocket: !!this.socket,
      hasUser: !!this.user,
      timestamp: new Date().toISOString()
    });

    this.add.rectangle(0, 0, 800, 600, this.mapSystem?.mapConfig.colors.background || 0xf8fafc)
      .setOrigin(0, 0);
    
    const grid = this.add.graphics();
    grid.lineStyle(1, this.mapSystem?.mapConfig.colors.grid || 0xe2e8f0, 0.5);
    for (let x = 0; x <= 800; x += 40) {
      grid.moveTo(x, 0);
      grid.lineTo(x, 600);
    }
    for (let y = 0; y <= 600; y += 40) {
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

    this.mapSystem = new ModernMapSystem(this);
    this.mapSystem.initialize();

    if (this.roomState) {
      this.mapSystem.addRoom({
        id: this.roomState._id,
        name: this.roomState.name,
        position: this.roomState.position || { x: 0, y: 0 },
        type: this.roomState.type || 'public',
        template: this.roomState.template || 'office'
      });
      this.mapSystem.setCurrentRoom(this.roomState._id);
    }

    this.time.delayedCall(100, () => {
      console.log('Scene ready, checking data:', {
        hasRoomState: !!this.roomState,
        hasSocket: !!this.socket,
        hasUser: !!this.user,
        timestamp: new Date().toISOString()
      });

      this.isReady = true;
      if (this.roomState && this.socket && this.user) {
        this.refreshScene();
      } else {
        console.error('Scene ready but missing required data:', {
          hasRoomState: !!this.roomState,
          hasSocket: !!this.socket,
          hasUser: !!this.user
        });
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
    let dx = 0, dy = 0;

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

      // Update debug text
    this.updateDebugText();

      // Update map system
    if (this.mapSystem) {
      this.mapSystem.update();
    }
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
    // Remove event listeners
    this.events.off('updateData', this.updateSceneData, this);
    this.events.off('connectionStatusChanged');
    this.events.off('updateRemotePlayers');
    this.events.off('playerMoved');
    this.events.off('playerJoined');
    this.events.off('playerLeft');
    
    // Clean up scene
    this.clearScene();
    
    // Clean up network manager
    if (this.network) {
      this.network.destroy();
      this.network = null;
    }

    // Hide connection message
    this.hideConnectionMessage();
  }
}