# 2D Metaverse App

A real-time 2D metaverse application built with the MERN stack, WebRTC, and WebSocket technologies.

## Features

- 🎮 2D virtual world with user avatars
- 🎥 Real-time video/audio chat using WebRTC
- 💬 Real-time text chat
- 👤 User authentication
- 🏠 Virtual rooms and spaces
- 🎯 Interactive objects and games
- 👥 Presence system

## Tech Stack

- **Frontend**: React, Phaser.js, WebRTC, Socket.IO
- **Backend**: Node.js, Express, Socket.IO
- **Database**: MongoDB
- **Authentication**: JWT/Google OAuth

## Project Structure

```
metaverse-app/
├── client/         # React + Phaser frontend
├── server/         # Express + Socket.IO backend
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   # Install backend dependencies
   cd server
   npm install

   # Install frontend dependencies
   cd ../client
   npm install
   ```

3. Set up environment variables:
   - Create `.env` files in both client and server directories
   - Follow the `.env.example` files for required variables

4. Start the development servers:
   ```bash
   # Start backend server
   cd server
   npm run dev

   # Start frontend server
   cd ../client
   npm start
   ```

## Development Phases

1. Phase 1: MERN boilerplate with authentication
2. Phase 2: 2D world implementation with Phaser.js
3. Phase 3: WebSocket integration for movement and chat
4. Phase 4: WebRTC signaling and peer connections
5. Phase 5: UI/UX, rooms, avatars, and database integration
6. Phase 6: Deployment and hosting

## Contributing

[To be added]

## License

[To be added] 