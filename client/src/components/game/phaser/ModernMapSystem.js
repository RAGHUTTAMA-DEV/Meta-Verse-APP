import Phaser from 'phaser';

export default class ModernMapSystem {
  constructor(scene) {
    this.scene = scene;
    this.rooms = new Map();
    this.currentRoom = null;
    this.minimap = null;
    this.minimapContainer = null;
    this.roomMarkers = new Map();
    this.isMinimapVisible = false;
    
    // Custom modern map configuration
    this.mapConfig = {
      width: 2400,  // Larger map for more rooms
      height: 2400,
      minimapSize: 250,
      minimapScale: 0.08,
      roomSize: 800,
      padding: 120,
      // Custom modern color palette
      colors: {
        background: 0xf8fafc,    // Light gray background
        grid: 0xe2e8f0,         // Subtle grid lines
        walls: 0x94a3b8,        // Modern wall color
        floor: 0xf1f5f9,        // Light floor color
        accent: 0x3b82f6,       // Blue accent
        highlight: 0x60a5fa,     // Light blue highlight
        text: 0x1e293b,         // Dark text
        minimap: {
          background: 0x1e293b,  // Dark minimap background
          border: 0x334155,     // Border color
          room: 0x3b82f6,       // Room color
          current: 0x60a5fa,    // Current room color
          player: 0xef4444      // Player marker color
        }
      }
    };
  }

  initialize() {
    this.createMinimap();
    this.setupControls();
    this.createRoomTemplates();
  }

  createMinimap() {
    // Create modern-styled minimap container
    this.minimapContainer = this.scene.add.container(
      this.scene.cameras.main.width - this.mapConfig.minimapSize - 20,
      20
    );
    
    // Modern minimap background with rounded corners
    const background = this.scene.add.graphics();
    background.fillStyle(this.mapConfig.colors.minimap.background, 0.9);
    background.fillRoundedRect(0, 0, this.mapConfig.minimapSize, this.mapConfig.minimapSize, 10);
    background.lineStyle(2, this.mapConfig.colors.minimap.border, 1);
    background.strokeRoundedRect(0, 0, this.mapConfig.minimapSize, this.mapConfig.minimapSize, 10);
    
    // Create minimap view
    this.minimap = this.scene.add.graphics();
    
    // Add to container
    this.minimapContainer.add([background, this.minimap]);
    this.minimapContainer.setDepth(1000);
    this.minimapContainer.setScrollFactor(0);
    this.minimapContainer.setVisible(false);
  }

  setupControls() {
    // Toggle minimap with M key
    this.scene.input.keyboard.on('keydown-M', () => {
      this.toggleMinimap();
    });

    // Zoom controls
    this.scene.input.keyboard.on('keydown-PLUS', () => {
      this.zoomMinimap(0.1);
    });
    this.scene.input.keyboard.on('keydown-MINUS', () => {
      this.zoomMinimap(-0.1);
    });
  }

  createRoomTemplates() {
    // Define modern room templates
    this.roomTemplates = {
      lobby: {
        name: 'Modern Lobby',
        type: 'hub',
        objects: [
          { type: 'reception', x: 400, y: 300 },
          { type: 'seating', x: 200, y: 400 },
          { type: 'plant', x: 600, y: 200 }
        ]
      },
      office: {
        name: 'Office Space',
        type: 'public',
        objects: [
          { type: 'desk', x: 300, y: 300 },
          { type: 'chair', x: 300, y: 350 },
          { type: 'computer', x: 320, y: 320 }
        ]
      },
      meeting: {
        name: 'Meeting Room',
        type: 'private',
        objects: [
          { type: 'table', x: 400, y: 300 },
          { type: 'chairs', x: 400, y: 350 },
          { type: 'screen', x: 400, y: 200 }
        ]
      }
    };
  }

  addRoom(roomData) {
    const { id, name, position, type, template } = roomData;
    
    // Calculate room position
    const mapX = position.x * (this.mapConfig.roomSize + this.mapConfig.padding);
    const mapY = position.y * (this.mapConfig.roomSize + this.mapConfig.padding);
    
    // Get room template if specified
    const roomTemplate = template ? this.roomTemplates[template] : null;
    
    // Store room data
    this.rooms.set(id, {
      ...roomData,
      mapPosition: { x: mapX, y: mapY },
      template: roomTemplate
    });
    
    // Create modern room marker
    this.createRoomMarker(id, mapX, mapY, name, type, roomTemplate);
    
    if (this.isMinimapVisible) {
      this.updateMinimap();
    }
  }

  createRoomMarker(roomId, x, y, name, type, template) {
    const marker = this.scene.add.container(0, 0);
    
    // Create modern marker design
    const markerSize = 10;
    let markerShape;
    
    // Modern marker designs based on room type
    switch (type) {
      case 'hub':
        // Circular marker with accent color
        markerShape = this.scene.add.circle(0, 0, markerSize, this.mapConfig.colors.accent);
        // Add inner circle for depth
        const innerCircle = this.scene.add.circle(0, 0, markerSize * 0.6, this.mapConfig.colors.highlight);
        marker.add(innerCircle);
        break;
        
      case 'private':
        // Square marker with rounded corners
        const graphics = this.scene.add.graphics();
        graphics.fillStyle(this.mapConfig.colors.accent, 1);
        graphics.fillRoundedRect(-markerSize, -markerSize, markerSize * 2, markerSize * 2, 4);
        markerShape = graphics;
        break;
        
      default:
        // Hexagonal marker for public rooms
        const hex = this.scene.add.graphics();
        hex.fillStyle(this.mapConfig.colors.accent, 1);
        const points = [];
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          points.push({
            x: Math.cos(angle) * markerSize,
            y: Math.sin(angle) * markerSize
          });
        }
        hex.fillPoints(points, true);
        markerShape = hex;
    }
    
    // Add room name with modern styling
    const label = this.scene.add.text(0, markerSize + 4, name, {
      fontFamily: 'Arial',
      fontSize: 12,
      color: '#ffffff',
      backgroundColor: this.mapConfig.colors.minimap.background,
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5, 0);
    
    // Add template indicator if exists
    if (template) {
      const templateIcon = this.scene.add.text(
        -markerSize - 2,
        -markerSize - 2,
        '📋',
        { fontSize: 10 }
      ).setOrigin(0, 0);
      marker.add(templateIcon);
    }
    
    // Add to container
    marker.add([markerShape, label]);
    marker.setPosition(x * this.mapConfig.minimapScale, y * this.mapConfig.minimapScale);
    
    // Store marker
    this.roomMarkers.set(roomId, marker);
    this.minimapContainer.add(marker);
  }

  toggleMinimap() {
    this.isMinimapVisible = !this.isMinimapVisible;
    this.minimapContainer.setVisible(this.isMinimapVisible);
    this.updateMinimap();
  }

  zoomMinimap(delta) {
    const newScale = Phaser.Math.Clamp(
      this.mapConfig.minimapScale + delta,
      0.05,
      0.2
    );
    this.mapConfig.minimapScale = newScale;
    
    // Update all marker positions
    for (const [id, marker] of this.roomMarkers.entries()) {
      const room = this.rooms.get(id);
      marker.setPosition(
        room.mapPosition.x * newScale,
        room.mapPosition.y * newScale
      );
    }
    
    this.updateMinimap();
  }

  updateMinimap() {
    if (!this.isMinimapVisible) return;
    
    this.minimap.clear();
    
    // Draw room connections with modern style
    this.minimap.lineStyle(2, this.mapConfig.colors.minimap.room, 0.5);
    
    // Draw current room highlight
    if (this.currentRoom && this.roomMarkers.has(this.currentRoom)) {
      const currentMarker = this.roomMarkers.get(this.currentRoom);
      this.minimap.fillStyle(this.mapConfig.colors.minimap.current, 0.3);
      this.minimap.fillCircle(
        currentMarker.x,
        currentMarker.y,
        20
      );
    }
    
    // Draw player position with modern style
    if (this.scene.player) {
      const playerX = this.scene.player.sprite.x * this.mapConfig.minimapScale;
      const playerY = this.scene.player.sprite.y * this.mapConfig.minimapScale;
      
      // Draw player marker with pulsing effect
      const pulse = Math.sin(this.scene.time.now / 200) * 0.5 + 0.5;
      this.minimap.fillStyle(this.mapConfig.colors.minimap.player, 0.8 + pulse * 0.2);
      this.minimap.fillCircle(playerX, playerY, 4);
      
      // Add outer glow
      this.minimap.fillStyle(this.mapConfig.colors.minimap.player, 0.2);
      this.minimap.fillCircle(playerX, playerY, 8);
    }
  }

  update() {
    if (this.isMinimapVisible) {
      this.updateMinimap();
    }
  }
} 