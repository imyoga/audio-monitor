const portAudio = require('naudiodon')

class AudioService {
	constructor() {
		this.activeStreams = []
		this.defaultConfig = {
			channelCount: 2,
			sampleRate: 48000,
			sampleFormat: portAudio.SampleFormat24Bit,
			framesPerBuffer: 512,
		}
	}

	/**
	 * Get all available audio devices
	 * @returns {Object} Object containing input and output devices
	 */
	getAllDevices() {
		try {
			const devices = portAudio.getDevices()
			const inputs = devices.filter((device) => device.maxInputChannels > 0)
			const outputs = devices.filter((device) => device.maxOutputChannels > 0)

			return { inputs, outputs }
		} catch (error) {
			throw new Error(`Failed to get audio devices: ${error.message}`)
		}
	}

	/**
	 * Get device-specific optimal configuration
	 * @param {Object} device - Audio device object
	 * @returns {Object} Optimal configuration for the device
	 */
	getDeviceConfig(device) {
		// Use device's default sample rate if available, otherwise fallback to our default
		const sampleRate = device.defaultSampleRate || this.defaultConfig.sampleRate

		return {
			channelCount: Math.min(
				device.maxInputChannels || device.maxOutputChannels || 2,
				2
			),
			sampleRate: sampleRate,
			sampleFormat: portAudio.SampleFormat24Bit,
			framesPerBuffer: this.defaultConfig.framesPerBuffer,
		}
	}

	/**
	 * Create audio route from input device to output device
	 * @param {number} inputId - Input device ID
	 * @param {number} outputId - Output device ID
	 * @returns {Object} Route information
	 */
	async createAudioRoute(inputId, outputId) {
		try {
			// Validate device IDs
			const devices = this.getAllDevices()
			const inputDevice = devices.inputs.find((d) => d.id === inputId)
			const outputDevice = devices.outputs.find((d) => d.id === outputId)

			if (!inputDevice) {
				throw new Error(`Input device with ID ${inputId} not found`)
			}
			if (!outputDevice) {
				throw new Error(`Output device with ID ${outputId} not found`)
			}

			// Get device-specific configurations
			const inputConfig = this.getDeviceConfig(inputDevice)
			const outputConfig = this.getDeviceConfig(outputDevice)

			console.log(`Input device "${inputDevice.name}" config:`, inputConfig)
			console.log(`Output device "${outputDevice.name}" config:`, outputConfig)

			let audioInput, audioOutput

			// Try 24-bit first, fallback to 16-bit if needed
			try {
				audioInput = new portAudio.AudioIO({
					inOptions: {
						deviceId: inputId,
						...inputConfig,
						closeOnError: true,
					},
				})

				audioOutput = new portAudio.AudioIO({
					outOptions: {
						deviceId: outputId,
						...outputConfig,
					},
				})
			} catch (formatError) {
				console.warn(
					'24-bit format failed, trying 16-bit fallback:',
					formatError.message
				)

				// Fallback to 16-bit
				const fallbackInputConfig = {
					...inputConfig,
					sampleFormat: portAudio.SampleFormat16Bit,
				}
				const fallbackOutputConfig = {
					...outputConfig,
					sampleFormat: portAudio.SampleFormat16Bit,
				}

				audioInput = new portAudio.AudioIO({
					inOptions: {
						deviceId: inputId,
						...fallbackInputConfig,
						closeOnError: true,
					},
				})

				audioOutput = new portAudio.AudioIO({
					outOptions: {
						deviceId: outputId,
						...fallbackOutputConfig,
					},
				})

				console.log('Successfully created streams with 16-bit fallback')
			}

			// Set up the audio pipeline
			audioInput.pipe(audioOutput)

			// Start the streams
			await this.startStreams(audioOutput, audioInput)

			const routeInfo = {
				id: this.activeStreams.length,
				inputDevice: inputDevice.name,
				outputDevice: outputDevice.name,
				timestamp: new Date().toISOString(),
			}

			this.activeStreams.push({
				audioInput,
				audioOutput,
				routeInfo,
			})

			return routeInfo
		} catch (error) {
			throw new Error(`Failed to create audio route: ${error.message}`)
		}
	}

	/**
	 * Start audio streams in the correct order
	 * @param {Object} audioOutput - Audio output stream
	 * @param {Object} audioInput - Audio input stream
	 */
	async startStreams(audioOutput, audioInput) {
		return new Promise((resolve, reject) => {
			try {
				audioOutput.start()
				audioInput.start()
				resolve()
			} catch (error) {
				reject(error)
			}
		})
	}

	/**
	 * Stop all active audio routes
	 * @returns {number} Number of routes stopped
	 */
	stopAllRoutes() {
		const count = this.activeStreams.length

		this.activeStreams.forEach(({ audioInput, audioOutput }) => {
			try {
				audioInput.unpipe()
				audioInput.quit()
				audioOutput.quit()
			} catch (error) {
				console.warn('Error stopping audio stream:', error.message)
			}
		})

		this.activeStreams = []
		return count
	}

	/**
	 * Stop a specific audio route by ID
	 * @param {number} routeId - Route ID to stop
	 * @returns {boolean} Success status
	 */
	stopRoute(routeId) {
		const routeIndex = this.activeStreams.findIndex(
			(stream) => stream.routeInfo.id === routeId
		)

		if (routeIndex === -1) {
			return false
		}

		const { audioInput, audioOutput } = this.activeStreams[routeIndex]

		try {
			audioInput.unpipe()
			audioInput.quit()
			audioOutput.quit()
			this.activeStreams.splice(routeIndex, 1)
			return true
		} catch (error) {
			console.warn('Error stopping specific audio route:', error.message)
			return false
		}
	}

	/**
	 * Get information about active routes
	 * @returns {Array} Array of active route information
	 */
	getActiveRoutes() {
		return this.activeStreams.map((stream) => stream.routeInfo)
	}

	/**
	 * Graceful shutdown - stop all streams
	 */
	gracefulShutdown() {
		console.log('Stopping all audio streams...')
		this.stopAllRoutes()
		console.log('Audio service shutdown complete')
	}
}

// Create singleton instance
const audioService = new AudioService()

module.exports = {
	getAllDevices: () => audioService.getAllDevices(),
	createAudioRoute: (inputId, outputId) =>
		audioService.createAudioRoute(inputId, outputId),
	stopAllRoutes: () => audioService.stopAllRoutes(),
	stopRoute: (routeId) => audioService.stopRoute(routeId),
	getActiveRoutes: () => audioService.getActiveRoutes(),
	gracefulShutdown: () => audioService.gracefulShutdown(),
}
