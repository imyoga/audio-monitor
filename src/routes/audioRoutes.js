const express = require('express')
const {
	getDevices,
	startAudioRoute,
	stopAudioRoutes,
	listRoutes,
	stopRouteById,
	status,
} = require('../controllers/audioController')
const { validateRouteRequest } = require('../middleware/validation')

const router = express.Router()

// GET /api/devices - List all audio devices
router.get('/devices', getDevices)

// POST /api/route - Start audio routing
router.post('/route', validateRouteRequest, startAudioRoute)

// POST /api/stop - Stop all audio routes
router.post('/stop', stopAudioRoutes)

// GET /api/routes - List active routes
router.get('/routes', listRoutes)

// POST /api/route/:id/stop - Stop a specific route
router.post('/route/:id/stop', stopRouteById)

// GET /api/status - Diagnostics / uptime / route count
router.get('/status', status)

module.exports = router
