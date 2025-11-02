# Multi-Source Audio Backend

This project is designed to handle audio streams from multiple devices, specifically three recorders and one background noise source. The backend API and WebSocket server facilitate the collection and synchronization of audio data based on precise timestamps.

## Features

- Receive audio streams from multiple devices.
- Synchronize audio data based on timestamps.
- Real-time audio data transmission using WebSockets.
- Modular architecture with separate services for audio processing and synchronization.

## Project Structure

```
multi-source-audio-backend
├── src
│   ├── server.ts               # Entry point of the application
│   ├── app.ts                  # Express application configuration
│   ├── controllers             # Contains controllers for handling requests
│   │   └── audioController.ts   # Handles audio data processing
│   ├── routes                  # Defines API routes
│   │   └── audioRoutes.ts       # API endpoints for audio streams
│   ├── sockets                 # WebSocket server and events
│   │   ├── index.ts            # Initializes WebSocket server
│   │   └── audioSocket.ts       # Manages audio data transmission
│   ├── services                # Business logic for audio processing
│   │   ├── audioService.ts      # Processes audio streams
│   │   └── syncService.ts       # Synchronizes audio streams
│   ├── middleware              # Middleware functions
│   │   └── auth.ts             # Authentication and authorization
│   ├── utils                   # Utility functions
│   │   └── time.ts             # Time-related operations
│   ├── types                   # TypeScript interfaces and types
│   │   └── index.ts            # Common types used in the application
│   └── config                  # Configuration settings
│       └── index.ts            # Environment variables and server settings
├── tests                       # Unit tests for the application
│   └── audio.test.ts           # Tests for audio functionalities
├── package.json                # NPM configuration file
├── tsconfig.json               # TypeScript configuration file
├── .env.example                # Example environment variables
└── README.md                   # Project documentation
```

## Setup Instructions

1. **Clone the repository:**
   ```
   git clone <repository-url>
   cd multi-source-audio-backend
   ```

2. **Install dependencies:**
   ```
   npm install
   ```

3. **Configure environment variables:**
   Copy `.env.example` to `.env` and update the values as needed.

4. **Run the application:**
   ```
   npm start
   ```

5. **Run tests:**
   ```
   npm test
   ```

## Usage

The API provides endpoints for receiving audio streams and synchronizing them. WebSocket connections allow for real-time data transmission. Refer to the API documentation for detailed usage instructions.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.