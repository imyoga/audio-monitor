const portAudio = require('naudiodon')

class AudioService {
	constructor() {
		this.activeStreams = []
		this.defaultConfig = {
			channelCount: parseInt(process.env.DEFAULT_CHANNEL_COUNT || '2', 10),
			sampleRate: parseInt(process.env.DEFAULT_SAMPLE_RATE || '48000', 10),
			sampleFormat: portAudio.SampleFormat24Bit,
			framesPerBuffer: parseInt(
				process.env.DEFAULT_FRAMES_PER_BUFFER || '512',
				10
			),
		}
	}

	/**
	 * Raw device list from PortAudio (no filtering). Internal use only.
	 */
	getAllDevicesRaw() {
		try {
			return portAudio.getDevices()
		} catch (error) {
			throw new Error(`Failed to get audio devices: ${error.message}`)
		}
	}

	/**
	 * Get all available audio devices
	 * @returns {Object} Object containing input and output devices
	 */
	getAllDevices() {
		try {
			const devices = this.getAllDevicesRaw()
			const includeApisEnv = process.env.INCLUDE_HOST_APIS || 'Windows WASAPI'
			const includeApis = includeApisEnv
				.split(',')
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean)
			const hideLoopback =
				(process.env.EXCLUDE_LOOPBACK_FROM_UI || 'true').toLowerCase() !==
				'false'

			const apiOf = (d) =>
				(d.hostAPIName || d.hostAPI || '').toString().trim().toLowerCase()
			const isAllowedApi = (d) =>
				includeApis.length === 0 || includeApis.includes(apiOf(d))

			let inputs = devices.filter(
				(d) => d.maxInputChannels > 0 && isAllowedApi(d)
			)
			let outputs = devices.filter(
				(d) => d.maxOutputChannels > 0 && isAllowedApi(d)
			)

			// Optionally hide explicit loopback inputs from UI (we still use them internally)
			if (hideLoopback) {
				inputs = inputs.filter((d) => !/(loopback)/i.test(d.name || ''))
			}

			// Dedupe by name within direction (to reduce noise when drivers expose dupes)
			const dedupeByName = (list) => {
				const seen = new Set()
				return list.filter((d) => {
					const key = (d.name || '').toLowerCase()
					if (seen.has(key)) return false
					seen.add(key)
					return true
				})
			}
			inputs = dedupeByName(inputs)
			outputs = dedupeByName(outputs)

			return { inputs, outputs }
		} catch (error) {
			throw new Error(`Failed to get audio devices: ${error.message}`)
		}
	}

	/**
	 * Try to find a loopback input device corresponding to an output device (WASAPI loopback)
	 * This is heuristic and depends on how drivers expose devices. If no match, returns null.
	 */
	findLoopbackInputForOutputDevice(outputDevice, inputs) {
		if (!outputDevice) return null
		const outName = (outputDevice.name || '').toLowerCase()
		const outApi = (
			outputDevice.hostAPIName ||
			outputDevice.hostAPI ||
			''
		).toLowerCase()
		// Prefer names that include 'loopback' and share a token of the output name
		const candidates = inputs.filter((i) => {
			const nm = (i.name || '').toLowerCase()
			const api = (i.hostAPIName || i.hostAPI || '').toLowerCase()
			const sharesApi = !outApi || api === outApi || api.includes('wasapi')
			const loopbackish = nm.includes('loopback') || nm.includes('stereo mix')
			const sharesToken =
				outName &&
				(nm.includes(outName) || outName.includes(nm.split('(')[0].trim()))
			return sharesApi && (loopbackish || sharesToken)
		})
		return candidates[0] || null
	}

	/**
	 * Resolve selected device id to an input-capable device (or loopback proxy for outputs)
	 */
	resolveInputDevice(selectedId, devices) {
		const { inputs, outputs } = devices
		// If it's a real input device, use it
		const directIn = inputs.find((d) => d.id === selectedId)
		if (directIn) return directIn
		// If it's an output device, try to find a loopback input that corresponds to it
		const out = outputs.find((d) => d.id === selectedId)
		if (out) {
			const loopIn = this.findLoopbackInputForOutputDevice(out, inputs)
			if (loopIn) return loopIn
			throw new Error(
				`The selected source is an output-only device ("${out.name}"). Could not find a loopback input to capture it. On Windows, enable WASAPI loopback or use a "Stereo Mix"/virtual cable to capture output.`
			)
		}
		throw new Error(`Device with ID ${selectedId} not found for input.`)
	}

	/**
	 * Resolve selected device id to an output-capable device
	 */
	resolveOutputDevice(selectedId, devices) {
		const { inputs, outputs } = devices
		const out = outputs.find((d) => d.id === selectedId)
		if (out) return out
		const asInput = inputs.find((d) => d.id === selectedId)
		if (asInput) {
			throw new Error(
				`The selected destination is an input-only device ("${asInput.name}"). Sending audio to microphone devices is not supported without a virtual audio driver (e.g., VB-CABLE, VoiceMeeter).`
			)
		}
		throw new Error(`Device with ID ${selectedId} not found for output.`)
	}

	/**
	 * Get device-specific optimal configuration
	 * @param {Object} device - Audio device object
	 * @returns {Object} Optimal configuration for the device
	 */
	getDeviceConfig(device) {
		// Default per-device config; final route will normalize between input/output
		const sampleRate = device.defaultSampleRate || this.defaultConfig.sampleRate

		return {
			channelCount: Math.max(
				1,
				Math.min(device.maxInputChannels || device.maxOutputChannels || 2, 2)
			),
			sampleRate,
			sampleFormat: portAudio.SampleFormat24Bit,
			framesPerBuffer: this.defaultConfig.framesPerBuffer,
		}
	}

	/**
	 * Compute a common config between input and output so the pipe is compatible
	 */
	getCommonConfig(inputDevice, outputDevice) {
		const inCfg = this.getDeviceConfig(inputDevice)
		const outCfg = this.getDeviceConfig(outputDevice)

		// Channel count must match on both ends; prefer the smaller, cap to 2
		const channelCount = Math.max(
			1,
			Math.min(
				inCfg.channelCount,
				outCfg.channelCount,
				this.defaultConfig.channelCount,
				2
			)
		)

		// Sample rate should match; if device defaults differ, prefer env default,
		// then the lower of the two as a pragmatic fallback.
		let sampleRate = this.defaultConfig.sampleRate
		if (
			inputDevice.defaultSampleRate &&
			outputDevice.defaultSampleRate &&
			inputDevice.defaultSampleRate === outputDevice.defaultSampleRate
		) {
			sampleRate = inputDevice.defaultSampleRate
		} else if (
			inputDevice.defaultSampleRate &&
			outputDevice.defaultSampleRate
		) {
			sampleRate = Math.min(
				inputDevice.defaultSampleRate,
				outputDevice.defaultSampleRate
			)
		} else if (
			inputDevice.defaultSampleRate ||
			outputDevice.defaultSampleRate
		) {
			sampleRate =
				inputDevice.defaultSampleRate ||
				outputDevice.defaultSampleRate ||
				this.defaultConfig.sampleRate
		}

		return {
			channelCount,
			sampleRate,
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
			// Resolve devices allowing union selection (any device either side)
			const raw = { inputs: [], outputs: [] }
			const all = this.getAllDevicesRaw()
			raw.inputs = all.filter((d) => d.maxInputChannels > 0)
			raw.outputs = all.filter((d) => d.maxOutputChannels > 0)
			const inputDevice = this.resolveInputDevice(inputId, raw)
			const outputDevice = this.resolveOutputDevice(outputId, raw)

			// Compute a unified config so both streams match
			const commonConfig = this.getCommonConfig(inputDevice, outputDevice)

			console.log(
				`Input device "${inputDevice.name}" + Output device "${outputDevice.name}" common config:`,
				commonConfig
			)

			let audioInput, audioOutput

			// Try 24-bit first, fallback to 16-bit if needed
			try {
				audioInput = new portAudio.AudioIO({
					inOptions: {
						deviceId: inputId,
						...commonConfig,
						closeOnError: true,
					},
				})

				audioOutput = new portAudio.AudioIO({
					outOptions: {
						deviceId: outputId,
						...commonConfig,
						closeOnError: true,
					},
				})
			} catch (formatError) {
				console.warn(
					'24-bit format failed, trying 16-bit fallback:',
					formatError.message
				)

				// Fallback to 16-bit
				const fallbackCommonConfig = {
					...commonConfig,
					sampleFormat: portAudio.SampleFormat16Bit,
				}

				audioInput = new portAudio.AudioIO({
					inOptions: {
						deviceId: inputId,
						...fallbackCommonConfig,
						closeOnError: true,
					},
				})

				audioOutput = new portAudio.AudioIO({
					outOptions: {
						deviceId: outputId,
						...fallbackCommonConfig,
						closeOnError: true,
					},
				})

				console.log('Successfully created streams with 16-bit fallback')
			}

			// Set up the audio pipeline
			audioInput.pipe(audioOutput)

			// Start the streams
			await this.startStreams(audioInput, audioOutput)

			// Handle stream errors to avoid crashes and auto-cleanup
			const onStreamError = (err) => {
				console.warn('Audio stream error:', err?.message || err)
				try {
					audioInput.unpipe()
				} catch {}
				this.safeQuit(audioInput)
				this.safeQuit(audioOutput)
			}
			audioInput.on('error', onStreamError)
			audioOutput.on('error', onStreamError)

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
	async startStreams(audioInput, audioOutput) {
		return new Promise((resolve, reject) => {
			try {
				audioInput.start()
				audioOutput.start()
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
				this.safeQuit(audioInput)
				this.safeQuit(audioOutput)
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
			this.safeQuit(audioInput)
			this.safeQuit(audioOutput)
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

	/**
	 * Safely quit a stream without throwing
	 */
	safeQuit(stream) {
		if (!stream) return
		try {
			if (typeof stream.stop === 'function') {
				// Some builds expose stop(); ensure stopped before quit
				try {
					stream.stop()
				} catch {}
			}
			stream.quit()
		} catch {}
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
