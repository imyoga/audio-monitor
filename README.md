# Audio Monitor

A Node.js Express server for audio routing and monitoring using naudiodon.

## Features

- List all available input and output audio devices
- Route audio from any input device to any output device
- Real-time audio monitoring
- RESTful API endpoints
- Graceful shutdown handling
- Input validation
- Error handling middleware

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Start the server:
   ```bash
   yarn start
   ```

## Development

Run in development mode with auto-restart:

```bash
yarn dev
```

## API Endpoints

### GET /api/devices

Get all available audio devices.

**Response:**

```json
{
  "success": true,
  "data": {
    "inputs": [...],
    "outputs": [...]
  }
}
```

### POST /api/route

Start audio routing from input to output device.

**Body:**

```json
{
	"inputId": 1,
	"outputId": 2
}
```

**Response:**

```json
{
	"success": true,
	"message": "Audio route started successfully",
	"data": {
		"id": 0,
		"inputDevice": "Microphone",
		"outputDevice": "Speakers",
		"timestamp": "2025-07-13T..."
	}
}
```

### POST /api/stop

Stop all active audio routes.

**Response:**

```json
{
	"success": true,
	"message": "Stopped 1 audio route(s)",
	"data": {
		"stoppedCount": 1
	}
}
```

## Project Structure

```
├── server.js              # Entry point
├── src/
│   ├── app.js             # Express app configuration
│   ├── controllers/       # Route handlers
│   ├── middleware/        # Custom middleware
│   ├── routes/           # Route definitions
│   └── services/         # Business logic
├── public/               # Static files
└── package.json
```

## Environment Variables

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `DEFAULT_SAMPLE_RATE` - Audio sample rate (default: 48000)
- `DEFAULT_CHANNEL_COUNT` - Audio channels (default: 2)
- `DEFAULT_FRAMES_PER_BUFFER` - Buffer size (default: 512)

## License

MIT
