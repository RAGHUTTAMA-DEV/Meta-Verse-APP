export default class NetworkManager {
  constructor(scene, socket, user) {
    if (!user || !user._id) {
      console.error('NetworkManager: Invalid user data', { user });
      throw new Error('NetworkManager requires valid user data');
    }

    this.scene = scene;
    this.socket = socket;
    this.user = user;
    this.lastUpdateTime = 0;
    this.updateThrottle = 50;
    this.isDestroyed = false;

    if (this.socket) {
      this.setupSocketHandlers();
    }
  }

  setupSocketHandlers() {
    if (!this.socket || this.isDestroyed) return;

    // Handle connection events
    this.socket.on('connect', () => {
      console.log('NetworkManager: Socket connected', {
        socketId: this.socket.id,
        userId: this.user._id,
        timestamp: new Date().toISOString()
      });
      this.scene.events.emit('connectionStatusChanged', true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('NetworkManager: Socket disconnected', {
        reason,
        socketId: this.socket.id,
        userId: this.user._id,
        timestamp: new Date().toISOString()
      });
      this.scene.events.emit('connectionStatusChanged', false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('NetworkManager: Socket connection error', {
        error: error.message,
        socketId: this.socket.id,
        userId: this.user._id,
        timestamp: new Date().toISOString()
      });
      this.scene.events.emit('connectionStatusChanged', false);
    });

    // Handle room state updates
    this.socket.on('roomState', (state) => {
      if (!state || !state.participants || !Array.isArray(state.participants)) {
        console.warn('NetworkManager: Invalid room state received', { 
          state,
          hasParticipants: !!state?.participants,
          isArray: Array.isArray(state?.participants),
          timestamp: new Date().toISOString()
        });
        return;
      }

      try {
        const remoteParticipants = state.participants.filter(p => {
          if (!p) return false;
          
          if (!p.user) {
            console.warn('NetworkManager: Participant missing user data', { participant: p });
            return false;
          }
          
          if (!p.user._id) {
            console.warn('NetworkManager: Participant missing user ID', { participant: p });
            return false;
          }
          
          if (p.user._id === this.user._id) return false;
          
          // Skip if position is missing
          if (!p.position || typeof p.position.x !== 'number' || typeof p.position.y !== 'number') {
            console.warn('NetworkManager: Participant missing valid position', { participant: p });
            return false;
          }
          
          return true;
        });

        if (remoteParticipants.length > 0) {
          this.scene.events.emit('updateRemotePlayers', remoteParticipants);
        }
      } catch (error) {
        console.error('NetworkManager: Error processing room state', {
          error: error.message,
          state,
          userId: this.user._id,
          timestamp: new Date().toISOString()
        });
      }
    });
    this.socket.on('playerMoved', (data) => {
      if (!data || !data.userId || data.userId === this.user._id) return;
      this.scene.events.emit('playerMoved', data);
    });

    this.socket.on('playerJoined', (data) => {
      if (!data || !data.user || !data.user._id || data.user._id === this.user._id) return;
      this.scene.events.emit('playerJoined', data);
    });

    this.socket.on('playerLeft', (userId) => {
      if (!userId || userId === this.user._id) return;
      this.scene.events.emit('playerLeft', userId);
    });
  }

  sendPlayerUpdate(position) {
    if (!this.socket || !this.socket.connected || this.isDestroyed) return;

    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateThrottle) return;
    this.lastUpdateTime = now;

    try {
      this.socket.emit('userMove', {
        position,
        timestamp: now
      });
    } catch (error) {
      console.error('NetworkManager: Error sending player update', {
        error: error.message,
        socketId: this.socket.id,
        timestamp: new Date().toISOString()
      });
    }
  }
  destroy() {
    this.isDestroyed = true;
    
    if (this.socket) {
      this.socket.off('connect');
      this.socket.off('disconnect');
      this.socket.off('connect_error');
      this.socket.off('roomState');
      this.socket.off('playerMoved');
      this.socket.off('playerJoined');
      this.socket.off('playerLeft');
    }

    this.socket = null;
    this.scene = null;
    this.user = null;
  }
} 
