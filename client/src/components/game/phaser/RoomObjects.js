import Phaser from 'phaser';

export default class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
    this.player = null;
    this.otherPlayers = new Map();
    this.objects = new Map();
    this.cursors = null;
    this.wasd = null;
    this.roomState = null;
    this.socket = null;
    this.user = null;
    this.lastUpdateTime = 0;
    this.movementThrottle = 50; // ms between movement updates
    this.playerSpeed = 180;
    this.debugText = null;
  }

  init(data) {
    console.log('MainScene init with data:', {
      hasRoomState: !!data.roomState,
      hasSocket: !!data.socket,
      hasUser: !!data.user
    });
    this.roomState = data.roomState;
    this.socket = data.socket;
    this.user = data.user;

    // Listen for scene events
    this.events.on('updateData', this.handleUpdateData, this);
    this.events.on('roomStateUpdate', this.handleRoomStateUpdate, this);
  }

  handleUpdateData(data) {
    console.log('Scene received updateData event');
    if (data.roomState) this.roomState = data.roomState;
    if (data.socket) this.socket = data.socket;
    if (data.user) this.user = data.user;
    this.refreshScene();
  }

  handleRoomStateUpdate(roomState) {
    if (!roomState) return;
    
    // Store new room state
    this.roomState = roomState;
    
    // Update other players (don't update self here - that's handled locally)
    if (roomState.participants) {
      roomState.participants.forEach(participant => {
        const userId = participant.user._id;
        
        // Skip the current user
        if (userId === this.user._id) return;
        
        if (this.otherPlayers.has(userId)) {
          // Update existing player
          const playerSprite = this.otherPlayers.get(userId);
          
          // Create smooth movement
          this.tweens.add({
            targets: playerSprite,
            x: participant.position.x,
            y: participant.position.y,
            duration: 100,
            ease: 'Linear'
          });
          
          // Update player properties
          playerSprite.setData('participant', participant);
        } else {
          // Create new player
          this.createOtherPlayer(participant);
        }
      });
      
      // Remove players who left
      const currentPlayerIds = new Set(roomState.participants.map(p => p.user._id));
      for (const [playerId, playerSprite] of this.otherPlayers.entries()) {
        if (!currentPlayerIds.has(playerId)) {
          console.log('Player left:', playerId);
          playerSprite.destroy();
          this.otherPlayers.delete(playerId);
        }
      }
    }
  }

  refreshScene() {
    console.log('Refreshing scene');
    // Clear existing objects
    this.clearScene();
    
    // Recreate everything
    if (this.roomState && this.user) {
      this.createEnvironment();
      this.createPlayer();
      this.createOtherPlayers();
    }
  }

  clearScene() {
    // Destroy player
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
    
    // Destroy other players
    for (const [_, playerSprite] of this.otherPlayers.entries()) {
      playerSprite.destroy();
    }
    this.otherPlayers.clear();
    
    // Destroy objects
    for (const [_, object] of this.objects.entries()) {
      object.destroy();
    }
    this.objects.clear();
  }

  preload() {
    // No external assets needed for now
  }

  create() {
    // Create game world
    this.createEnvironment();
    
    // Set up input
    this.setupInput();
    
    // Create player and others
    this.createPlayer();
    this.createOtherPlayers();
    
    // Debug text
    this.debugText = this.add.text(10, 10, 'Debug info', {
      fontFamily: 'Arial',
      fontSize: 14,
      color: '#333333',
      backgroundColor: '#ffffff80',
      padding: { x: 5, y: 5 }
    });
    this.debugText.setDepth(1000);
    
    console.log('MainScene created successfully');
  }

  createEnvironment() {
    // Draw a light gray background
    this.add.rectangle(0, 0, 800, 600, 0xf7fafc).setOrigin(0, 0);
    
    // Draw grid
    const grid = this.add.grid(
      0, 0,
      800, 600,
      20, 20,
      0xeeeeee, 1,
      0xcccccc, 0.5
    ).setOrigin(0, 0);
    
    // Create objects from room state
    if (this.roomState?.objects && Array.isArray(this.roomState.objects)) {
      this.roomState.objects.forEach(obj => this.createObject(obj));
    }
  }

  createObject(objData) {
    let gameObj;
    
    // Create different types of objects based on type property
    switch (objData.type) {
      case 'wall':
        gameObj = this.add.rectangle(
          objData.position.x, 
          objData.position.y,
          objData.properties.width || 20,
          objData.properties.height || 20,
          parseInt(objData.properties.color?.replace('#', ''), 16) || 0x4a5568
        ).setOrigin(0, 0);
        
        // Add physics body
        this.physics.add.existing(gameObj, true); // true = static body
        break;
        
      case 'furniture':
        // Create furniture as circles for simplicity
        gameObj = this.add.circle(
          objData.position.x + 15, 
          objData.position.y + 15,
          15,
          parseInt(objData.properties.color?.replace('#', ''), 16) || 0x805ad5
        );
        
        // Add text label for furniture type
        const furnitureLabel = this.add.text(
          objData.position.x, 
          objData.position.y - 20, 
          objData.properties.type || 'item',
          { fontFamily: 'Arial', fontSize: 12, color: '#4a5568' }
        ).setOrigin(0.5, 0);
        
        // Group the objects
        gameObj = this.add.container(0, 0, [gameObj, furnitureLabel]);
        
        // Add physics
        this.physics.add.existing(gameObj);
        gameObj.body.setCircle(15);
        break;
        
      case 'decoration':
        // Create decoration as stars for simplicity
        const graphics = this.add.graphics();
        graphics.fillStyle(parseInt(objData.properties.color?.replace('#', ''), 16) || 0x48bb78, 1);
        graphics.fillStar(
          objData.position.x + 15, 
          objData.position.y + 15,
          10, 5, 5
        );
        
        // Add text label
        const decorLabel = this.add.text(
          objData.position.x, 
          objData.position.y - 15, 
          objData.properties.type || 'decor',
          { fontFamily: 'Arial', fontSize: 10, color: '#4a5568' }
        ).setOrigin(0.5, 0);
        
        // Group the objects
        gameObj = this.add.container(0, 0, [graphics, decorLabel]);
        break;
        
      default:
        // Generic object as a rectangle
        gameObj = this.add.rectangle(
          objData.position.x, 
          objData.position.y,
          20, 20,
          0x718096
        ).setOrigin(0, 0);
    }
    
    // Store object data
    gameObj.setData('objData', objData);
    
    // Add to objects map with an id
    const objId = objData._id || `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.objects.set(objId, gameObj);
    
    return gameObj;
  }

  setupInput() {
    // Set up keyboard controls
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });
  }

  createPlayer() {
    // Find the player's participant data
    const playerParticipant = this.roomState?.participants?.find(
      p => p.user._id === this.user._id
    );
    
    if (!playerParticipant) {
      console.warn('Player participant data not found');
      return;
    }
    
    // Initial position
    const x = playerParticipant.position?.x || 100;
    const y = playerParticipant.position?.y || 100;
    
    // Create player sprite
    this.player = this.add.circle(x, y, 15, 0x3182ce);
    
    // Add username text
    const nameText = this.add.text(x, y - 25, this.user.username, {
      fontFamily: 'Arial',
      fontSize: 14,
      color: '#2d3748',
      stroke: '#ffffff',
      strokeThickness: 3
    }).setOrigin(0.5, 0);
    
    // Create container for player and text
    this.player = this.add.container(0, 0, [this.player, nameText]);
    this.player.setData('nameText', nameText);
    this.player.setData('participant', playerParticipant);
    this.player.setData('isCurrentPlayer', true);
    
    // Add physics
    this.physics.add.existing(this.player);
    this.player.body.setCircle(15);
    
    // Ensure name text follows the player
    this.player.on('setPosition', () => {
      nameText.setPosition(this.player.x, this.player.y - 25);
    });
    
    // Add camera follow
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1);
    
    console.log('Player created at position:', x, y);
  }

  createOtherPlayers() {
    if (!this.roomState?.participants) return;
    
    // Create other players
    this.roomState.participants.forEach(participant => {
      // Skip the current user
      if (participant.user._id === this.user._id) return;
      
      this.createOtherPlayer(participant);
    });
  }

  createOtherPlayer(participant) {
    const userId = participant.user._id;
    const username = participant.user.username;
    const x = participant.position?.x || 100;
    const y = participant.position?.y || 100;
    
    // Create player circle with different color
    const playerCircle = this.add.circle(0, 0, 15, 0xe53e3e);
    
    // Add username text
    const nameText = this.add.text(0, -25, username, {
      fontFamily: 'Arial',
      fontSize: 14, 
      color: '#2d3748',
      stroke: '#ffffff',
      strokeThickness: 3
    }).setOrigin(0.5, 0);
    
    // Create container for player and text
    const playerContainer = this.add.container(x, y, [playerCircle, nameText]);
    playerContainer.setData('nameText', nameText);
    playerContainer.setData('participant', participant);
    playerContainer.setData('userId', userId);
    
    // Add to other players map
    this.otherPlayers.set(userId, playerContainer);
    
    return playerContainer;
  }

  update(time, delta) {
    // Skip if not ready
    if (!this.player || !this.socket || !this.roomState) return;
    
    // Update player movement
    this.updatePlayerMovement(time);
    
    // Update debug text
    this.updateDebugText();
  }

  updatePlayerMovement(time) {
    // Player movement speed (pixels per second)
    const speed = this.playerSpeed;
    
    // Reset velocity
    this.player.body.setVelocity(0);
    
    // Horizontal movement
    if (this.cursors.left.isDown || this.wasd.left.isDown) {
      this.player.body.setVelocityX(-speed);
    } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
      this.player.body.setVelocityX(speed);
    }
    
    // Vertical movement
    if (this.cursors.up.isDown || this.wasd.up.isDown) {
      this.player.body.setVelocityY(-speed);
    } else if (this.cursors.down.isDown || this.wasd.down.isDown) {
      this.player.body.setVelocityY(speed);
    }
    
    // Normalize velocity for diagonal movement
    this.player.body.velocity.normalize().scale(speed);
    
    // Send position update to server with throttling
    if (time > this.lastUpdateTime + this.movementThrottle) {
      this.lastUpdateTime = time;
      
      // Only send if position changed
      const newPosition = { x: this.player.x, y: this.player.y };
      const participant = this.player.getData('participant');
      const oldPosition = participant?.position || { x: 0, y: 0 };
      
      if (Math.abs(newPosition.x - oldPosition.x) > 0.5 || 
          Math.abs(newPosition.y - oldPosition.y) > 0.5) {
        
        // Update local participant data
        if (participant) {
          participant.lastPosition = { ...participant.position };
          participant.position = { ...newPosition };
          this.player.setData('participant', participant);
        }
        
        // Send to server
        if (this.socket.connected) {
          this.socket.emit('userMove', { position: newPosition });
        }
      }
    }
  }

  updateDebugText() {
    if (!this.debugText) return;
    
    // Show player position and connection status
    this.debugText.setText([
      `Position: ${Math.floor(this.player.x)}, ${Math.floor(this.player.y)}`,
      `Connected: ${this.socket.connected ? 'Yes' : 'No'}`,
      `Room: ${this.roomState.name || 'Unknown'}`,
      `Players: ${this.roomState.participants?.length || 0}`
    ].join('\n'));
  }

  shutdown() {
    // Remove event listeners to prevent memory leaks
    this.events.off('updateData', this.handleUpdateData, this);
    this.events.off('roomStateUpdate', this.handleRoomStateUpdate, this);
    
    // Clear the scene
    this.clearScene();
  }
}