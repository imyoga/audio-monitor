require('dotenv').config()
const app = require('./src/app')
const { gracefulShutdown } = require('./src/services/audioService')

const PORT = process.env.PORT || 3000

const server = app.listen(PORT, () => {
	console.log(`🚀 Server running on http://localhost:${PORT}`)
	console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
	console.log('SIGTERM received. Shutting down gracefully...')
	gracefulShutdown()
	server.close(() => {
		console.log('Process terminated')
		process.exit(0)
	})
})

process.on('SIGINT', () => {
	console.log('SIGINT received. Shutting down gracefully...')
	gracefulShutdown()
	server.close(() => {
		console.log('Process terminated')
		process.exit(0)
	})
})

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
	console.error('Uncaught Exception:', err)
	gracefulShutdown()
	process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason)
	gracefulShutdown()
	process.exit(1)
})
