import Phaser from 'phaser';

export default class RoomObjects {
  constructor(scene, objects = []) {
    this.scene = scene;
    this.objects = new Map();
    this.createObjects(objects);
  }

  createObjects(objects) {
    objects.forEach(obj => this.createObject(obj));
  }

  createObject(objData) {
    let gameObj;
    
    // Create different types of objects based on type property
    switch (objData.type) {
      case 'wall':
        gameObj = this.scene.add.rectangle(
          objData.position.x, 
          objData.position.y,
          objData.properties.width || 20,
          objData.properties.height || 20,
          parseInt(objData.properties.color?.replace('#', ''), 16) || 0x4a5568
        ).setOrigin(0, 0);
        
        // Add physics body
        this.scene.physics.add.existing(gameObj, true); // true = static body
        break;
        
      case 'furniture':
        // Create furniture as circles for simplicity
        gameObj = this.scene.add.circle(
          objData.position.x + 15, 
          objData.position.y + 15,
          15,
          parseInt(objData.properties.color?.replace('#', ''), 16) || 0x805ad5
        );
        
        // Add text label for furniture type
        const furnitureLabel = this.scene.add.text(
          objData.position.x, 
          objData.position.y - 20, 
          objData.properties.type || 'item',
          { fontFamily: 'Arial', fontSize: 12, color: '#4a5568' }
        ).setOrigin(0.5, 0);
        
        // Group the objects
        gameObj = this.scene.add.container(0, 0, [gameObj, furnitureLabel]);
        
        // Add physics
        this.scene.physics.add.existing(gameObj);
        gameObj.body.setCircle(15);
        break;
        
      case 'decoration':
        // Create decoration as stars for simplicity
        const graphics = this.scene.add.graphics();
        graphics.fillStyle(parseInt(objData.properties.color?.replace('#', ''), 16) || 0x48bb78, 1);
        graphics.fillStar(
          objData.position.x + 15, 
          objData.position.y + 15,
          10, 5, 5
        );
        
        // Add text label
        const decorLabel = this.scene.add.text(
          objData.position.x, 
          objData.position.y - 15, 
          objData.properties.type || 'decor',
          { fontFamily: 'Arial', fontSize: 10, color: '#4a5568' }
        ).setOrigin(0.5, 0);
        
        // Group the objects
        gameObj = this.scene.add.container(0, 0, [graphics, decorLabel]);
        break;
        
      default:
        // Generic object as a rectangle
        gameObj = this.scene.add.rectangle(
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

  destroy() {
    // Destroy all objects
    for (const [_, object] of this.objects.entries()) {
      if (object.destroy) {
        object.destroy();
      }
    }
    this.objects.clear();
  }
} 