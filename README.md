# 2D Metaverse App

A real-time multiplayer 2D metaverse application built with React, Phaser 3, and Socket.IO. This project allows users to create and join virtual rooms, interact with other players, and customize their avatars in a 2D environment.

## Features

- 🎮 Real-time multiplayer interaction
- 🏠 Customizable virtual rooms
- 👥 Player avatars with movement
- 💬 Real-time chat (coming soon)
- 🎨 Custom room objects and decorations
- 🔒 User authentication
- 🌐 Room discovery and joining
- 📱 Responsive design

## Tech Stack

### Frontend
- React.js - UI framework
- Phaser 3 - 2D game engine
- Socket.IO Client - Real-time communication
- TailwindCSS - Styling
- React Router - Navigation

### Backend
- Node.js - Runtime
- Express.js - Web framework
- Socket.IO - Real-time server
- MongoDB - Database
- JWT - Authentication

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── game/     # Phaser game components
│   │   │   ├── room/     # Room management components
│   │   │   └── auth/     # Authentication components
│   │   ├── contexts/     # React contexts
│   │   ├── hooks/        # Custom React hooks
│   │   └── utils/        # Utility functions
│   └── public/           # Static assets
│
└── server/                # Backend Node.js application
    ├── src/
    │   ├── controllers/  # Route controllers
    │   ├── models/       # Database models
    │   ├── routes/       # API routes
    │   ├── socket/       # Socket.IO handlers
    │   └── utils/        # Utility functions
    └── config/           # Server configuration
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/2d-metaverse-app.git
cd 2d-metaverse-app
```

2. Install dependencies:
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

3. Set up environment variables:
```bash
# In server directory
cp .env.example .env
# Edit .env with your configuration

# In client directory
cp .env.example .env
# Edit .env with your configuration
```

4. Start the development servers:
```bash
# Start backend server (from server directory)
npm run dev

# Start frontend server (from client directory)
npm run dev
```

The application should now be running at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## Game Features

### Player Movement
- WASD or Arrow keys for movement
- Smooth player interpolation
- Real-time position updates
- Collision detection with room objects

### Room System
- Create custom rooms
- Join existing rooms
- Room persistence
- Custom room objects and decorations
- Room discovery

### Multiplayer
- Real-time player synchronization
- Player join/leave events
- Room state management
- Player position updates
- Connection status handling

## Development

### Code Style
- ESLint for code linting
- Prettier for code formatting
- Follow React best practices
- Use TypeScript for type safety

### Testing
```bash
# Run backend tests
cd server
npm test

# Run frontend tests
cd client
npm test
```

### Building for Production
```bash
# Build backend
cd server
npm run build

# Build frontend
cd client
npm run build
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Phaser 3 for the game engine
- Socket.IO for real-time communication
- React team for the amazing framework
- All contributors and supporters of the project

## Support

For support, please:
1. Check the [documentation](docs/)
2. Open an issue
3. Join our [Discord community](https://discord.gg/your-discord)

## Roadmap

- [ ] Add real-time chat
- [ ] Implement room customization
- [ ] Add user profiles
- [ ] Add friend system
- [ ] Add room categories
- [ ] Implement room moderation
- [ ] Add custom avatars
- [ ] Add room events and activities