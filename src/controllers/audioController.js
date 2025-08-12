const asyncHandler = require('express-async-handler')
const {
	getAllDevices,
	createAudioRoute,
	stopAllRoutes,
	getActiveRoutes,
	stopRoute,
} = require('../services/audioService')

// @desc    Get all audio devices
// @route   GET /api/devices
// @access  Public
const getDevices = asyncHandler(async (req, res) => {
	const devices = getAllDevices()
	res.status(200).json({
		success: true,
		data: devices,
	})
})

// @desc    Start audio routing from input to output
// @route   POST /api/route
// @access  Public
const startAudioRoute = asyncHandler(async (req, res) => {
	const { inputId, outputId } = req.body

	try {
		const result = await createAudioRoute(inputId, outputId)
		res.status(200).json({
			success: true,
			message: 'Audio route started successfully',
			data: result,
		})
	} catch (error) {
		res.status(400).json({
			success: false,
			message: 'Failed to start audio route',
			error: error.message,
		})
	}
})

// @desc    Stop all active audio routes
// @route   POST /api/stop
// @access  Public
const stopAudioRoutes = asyncHandler(async (req, res) => {
	const stoppedCount = stopAllRoutes()
	res.status(200).json({
		success: true,
		message: `Stopped ${stoppedCount} audio route(s)`,
		data: { stoppedCount },
	})
})

module.exports = {
	getDevices,
	startAudioRoute,
	stopAudioRoutes,
	// New helpers
	listRoutes: asyncHandler(async (req, res) => {
		res.status(200).json({ success: true, data: getActiveRoutes() })
	}),
	stopRouteById: asyncHandler(async (req, res) => {
		const id = parseInt(req.params.id, 10)
		if (Number.isNaN(id)) {
			return res
				.status(400)
				.json({ success: false, message: 'Invalid route id' })
		}
		const ok = stopRoute(id)
		if (!ok) {
			return res
				.status(404)
				.json({ success: false, message: 'Route not found' })
		}
		res.status(200).json({ success: true, message: `Stopped route ${id}` })
	}),
	status: asyncHandler(async (req, res) => {
		const routes = getActiveRoutes()
		res.status(200).json({
			success: true,
			data: {
				uptimeSec: Math.floor(process.uptime()),
				pid: process.pid,
				routesCount: routes.length,
				routes,
			},
		})
	}),
}
