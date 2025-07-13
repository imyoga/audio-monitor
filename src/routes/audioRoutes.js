const express = require('express')
const {
	getDevices,
	startAudioRoute,
	stopAudioRoutes,
} = require('../controllers/audioController')
const { validateRouteRequest } = require('../middleware/validation')

const router = express.Router()

// GET /api/devices - List all audio devices
router.get('/devices', getDevices)

// POST /api/route - Start audio routing
router.post('/route', validateRouteRequest, startAudioRoute)

// POST /api/stop - Stop all audio routes
router.post('/stop', stopAudioRoutes)

module.exports = router
