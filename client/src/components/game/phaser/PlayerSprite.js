import Phaser from 'phaser';

export default class PlayerSprite {
  constructor(scene, x, y, user) {
    this.scene = scene;
    this.user = user;
    this.radius = 15;
    this.sprite = scene.add.circle(x, y, this.radius, 0x3182ce);
    this.label = scene.add.text(x, y - (this.radius + 4), user?.username || 'Player', {
      fontFamily: 'Arial',
      fontSize: 14,
      color: '#2d3748',
      stroke: '#ffffff',
      strokeThickness: 3
    }).setOrigin(0.5, 0);
  }

  update(cursors, wasd) {
    let dx = 0, dy = 0;
    if (cursors.left.isDown || wasd.left.isDown) dx -= 3;
    if (cursors.right.isDown || wasd.right.isDown) dx += 3;
    if (cursors.up.isDown || wasd.up.isDown) dy -= 3;
    if (cursors.down.isDown || wasd.down.isDown) dy += 3;
    if (dx !== 0 || dy !== 0) {
      this.sprite.x += dx;
      this.sprite.y += dy;
      this.label.x = this.sprite.x;
      this.label.y = this.sprite.y - (this.radius + 4);
    }
  }
}