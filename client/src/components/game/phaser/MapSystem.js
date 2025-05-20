import Phaser from 'phaser';

export default class MapSystem {
  constructor(scene) {
    this.scene = scene;
    this.rooms = new Map(); // Store room data
    this.currentRoom = null;
    this.minimap = null;
    this.minimapContainer = null;
    this.roomMarkers = new Map();
    this.isMinimapVisible = false;
    
    // Map configuration
    this.mapConfig = {
      width: 2000,  // Total map width
      height: 2000, // Total map height
      minimapSize: 200, // Size of minimap display
      minimapScale: 0.1, // Scale of minimap relative to main map
      roomSize: 800, // Size of each room
      padding: 100 // Padding between rooms
    };
  }

  initialize() {
    // Create minimap container
    this.createMinimap();
    
    // Add keyboard shortcut for toggling minimap (M key)
    this.scene.input.keyboard.on('keydown-M', () => {
      this.toggleMinimap();
    });
  }

  createMinimap() {
    // Create container for minimap
    this.minimapContainer = this.scene.add.container(
      this.scene.cameras.main.width - this.mapConfig.minimapSize - 10,
      10
    );
    
    // Create minimap background
    const background = this.scene.add.rectangle(
      0, 0,
      this.mapConfig.minimapSize,
      this.mapConfig.minimapSize,
      0x000000, 0.5
    ).setOrigin(0, 0);
    
    // Create minimap view
    this.minimap = this.scene.add.graphics();
    
    // Add to container
    this.minimapContainer.add([background, this.minimap]);
    this.minimapContainer.setDepth(1000);
    this.minimapContainer.setScrollFactor(0);
    
    // Initially hide minimap
    this.minimapContainer.setVisible(false);
  }

  toggleMinimap() {
    this.isMinimapVisible = !this.isMinimapVisible;
    this.minimapContainer.setVisible(this.isMinimapVisible);
    this.updateMinimap();
  }

  addRoom(roomData) {
    const { id, name, position, type } = roomData;
    
    // Calculate room position on the map
    const mapX = position.x * (this.mapConfig.roomSize + this.mapConfig.padding);
    const mapY = position.y * (this.mapConfig.roomSize + this.mapConfig.padding);
    
    // Store room data
    this.rooms.set(id, {
      ...roomData,
      mapPosition: { x: mapX, y: mapY }
    });
    
    // Create room marker on minimap
    this.createRoomMarker(id, mapX, mapY, name, type);
    
    // Update minimap if visible
    if (this.isMinimapVisible) {
      this.updateMinimap();
    }
  }

  createRoomMarker(roomId, x, y, name, type) {
    // Create marker container
    const marker = this.scene.add.container(0, 0);
    
    // Create marker shape based on room type
    let markerShape;
    const markerSize = 8;
    const markerColor = this.getRoomColor(type);
    
    switch (type) {
      case 'hub':
        markerShape = this.scene.add.circle(0, 0, markerSize, markerColor);
        break;
      case 'private':
        markerShape = this.scene.add.rectangle(0, 0, markerSize * 2, markerSize * 2, markerColor);
        break;
      default:
        markerShape = this.scene.add.triangle(0, 0, 0, -markerSize, markerSize, markerSize, -markerSize, markerSize, markerColor);
    }
    
    // Add room name label
    const label = this.scene.add.text(0, markerSize + 2, name, {
      fontFamily: 'Arial',
      fontSize: 10,
      color: '#ffffff'
    }).setOrigin(0.5, 0);
    
    // Add to container
    marker.add([markerShape, label]);
    marker.setPosition(x * this.mapConfig.minimapScale, y * this.mapConfig.minimapScale);
    
    // Store marker
    this.roomMarkers.set(roomId, marker);
    
    // Add to minimap container
    this.minimapContainer.add(marker);
  }

  getRoomColor(type) {
    switch (type) {
      case 'hub':
        return 0x3182ce; // Blue
      case 'private':
        return 0x805ad5; // Purple
      case 'public':
        return 0x38a169; // Green
      default:
        return 0x718096; // Gray
    }
  }

  setCurrentRoom(roomId) {
    this.currentRoom = roomId;
    this.updateMinimap();
  }

  updateMinimap() {
    if (!this.isMinimapVisible) return;
    
    // Clear previous minimap
    this.minimap.clear();
    
    // Draw room connections
    this.minimap.lineStyle(1, 0xffffff, 0.5);
    
    // Draw current room highlight
    if (this.currentRoom && this.roomMarkers.has(this.currentRoom)) {
      const currentMarker = this.roomMarkers.get(this.currentRoom);
      this.minimap.fillStyle(0xffffff, 0.3);
      this.minimap.fillCircle(
        currentMarker.x,
        currentMarker.y,
        15
      );
    }
    
    // Draw player position
    if (this.scene.player) {
      const playerX = this.scene.player.sprite.x * this.mapConfig.minimapScale;
      const playerY = this.scene.player.sprite.y * this.mapConfig.minimapScale;
      
      this.minimap.fillStyle(0xff0000, 1);
      this.minimap.fillCircle(playerX, playerY, 3);
    }
  }

  getRoomAtPosition(x, y) {
    // Convert screen coordinates to map coordinates
    const mapX = Math.floor(x / (this.mapConfig.roomSize + this.mapConfig.padding));
    const mapY = Math.floor(y / (this.mapConfig.roomSize + this.mapConfig.padding));
    
    // Find room at these coordinates
    for (const [id, room] of this.rooms.entries()) {
      if (room.position.x === mapX && room.position.y === mapY) {
        return room;
      }
    }
    
    return null;
  }

  update() {
    // Update minimap if visible
    if (this.isMinimapVisible) {
      this.updateMinimap();
    }
  }
} 