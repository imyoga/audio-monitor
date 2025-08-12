// State
let isRouting = false
let inputsData = []
let outputsData = []
let routesTimer = null

// Theme
function applyTheme(theme) {
	document.documentElement.classList.toggle('dark', theme === 'dark')
}
function toggleTheme() {
	const current = localStorage.getItem('theme') || 'light'
	const next = current === 'dark' ? 'light' : 'dark'
	localStorage.setItem('theme', next)
	applyTheme(next)
}
applyTheme(localStorage.getItem('theme') || 'light')

// UI helpers
function showStatus(message, isError = false) {
	const statusDiv = document.getElementById('status')
	statusDiv.textContent = message
	statusDiv.className = `status ${isError ? 'error' : 'success'} visible`
	clearTimeout(showStatus._t)
	showStatus._t = setTimeout(() => {
		statusDiv.classList.remove('visible')
	}, 5000)
}
function getSelectedRadioValue(name) {
	const el = document.querySelector(`input[name="${name}"]:checked`)
	return el ? el.value : ''
}
function updateButtonStates() {
	const startBtn = document.getElementById('startBtn')
	const stopBtn = document.getElementById('stopBtn')
	const hasInput = !!getSelectedRadioValue('inputDevice')
	const hasOutput = !!getSelectedRadioValue('outputDevice')
	const hasDevicesSelected = hasInput && hasOutput
	startBtn.disabled = isRouting || !hasDevicesSelected
	stopBtn.disabled = !isRouting
}

function deviceItemTemplate(
	device,
	groupName,
	highlight = false,
	deemphasize = false
) {
	const id = `${groupName}-${device.id}`
	const cls = `device-item ${highlight ? 'compatible' : ''} ${
		deemphasize ? 'incompatible' : ''
	}`
	const sr = device.defaultSampleRate || 'n/a'
	const meta = `id: ${device.id} • default SR: ${sr} • in:${
		device.maxInputChannels || 0
	} out:${device.maxOutputChannels || 0}`
	const tip = `${device.name} — ${meta}`
	const hasIn = (device.maxInputChannels || 0) > 0
	const hasOut = (device.maxOutputChannels || 0) > 0
	const badges = `
					${hasIn ? '<span class="badge badge-mic">Mic</span>' : ''}
					${hasOut ? '<span class="badge badge-speaker">Speaker</span>' : ''}
				`
	return `
					<label class="${cls}" title="${tip}">
						<input type="radio" id="${id}" name="${groupName}" value="${device.id}">
						<div>
							<div class="device-name">${badges} ${device.name}</div>
							<div class="device-meta">${meta}</div>
						</div>
					</label>
				`
}

function renderListsWithFilters() {
	const inputFilter = document.getElementById('searchInput').value.toLowerCase()
	const outputFilter = document
		.getElementById('searchOutput')
		.value.toLowerCase()

	const selectedInputId = getSelectedRadioValue('inputDevice')
	const selectedInput = inputsData.find(
		(d) => String(d.id) === String(selectedInputId)
	)

	const inputList = document.getElementById('inputList')
	const outputList = document.getElementById('outputList')

	const filteredInputs = inputsData.filter((d) =>
		d.name.toLowerCase().includes(inputFilter)
	)
	const filteredOutputs = outputsData.filter((d) =>
		d.name.toLowerCase().includes(outputFilter)
	)

	// Group by host API and sort groups; items by badge category (Mic, Speaker, Both) then name
	const badgeRank = (d) => {
		const hasIn = (d.maxInputChannels || 0) > 0
		const hasOut = (d.maxOutputChannels || 0) > 0
		if (hasIn && !hasOut) return 0 // Mic
		if (!hasIn && hasOut) return 1 // Speaker
		if (hasIn && hasOut) return 2 // Both
		return 3
	}
	const sortByBadgeThenName = (a, b) => {
		const ra = badgeRank(a)
		const rb = badgeRank(b)
		if (ra !== rb) return ra - rb
		return (a.name || '')
			.toLowerCase()
			.localeCompare((b.name || '').toLowerCase())
	}
	const groupKey = (d) => d.hostAPIName || d.hostAPI || 'Other'
	const groupAndSort = (arr) => {
		const map = new Map()
		arr.forEach((d) => {
			const g = groupKey(d)
			if (!map.has(g)) map.set(g, [])
			map.get(g).push(d)
		})
		const groups = Array.from(map.entries())
		groups.sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
		groups.forEach((g) => g[1].sort(sortByBadgeThenName))
		return groups
	}

	document.getElementById('countInput').textContent = filteredInputs.length
	document.getElementById('countOutput').textContent = filteredOutputs.length

	// Build grouped HTML for inputs
	const inputGroups = groupAndSort(filteredInputs)
	inputList.innerHTML = inputGroups
		.map(([gName, items]) => {
			const itemsHtml = items
				.map((d) => deviceItemTemplate(d, 'inputDevice'))
				.join('')
			return `<div class="group">
							<div class="group-label">${gName} <span class="group-count">(${items.length})</span></div>
							${itemsHtml}
						</div>`
		})
		.join('')

	// Highlight outputs matching selected input's sample rate to hint compatibility
	// Build grouped HTML for outputs with compatibility hint
	const outputGroups = groupAndSort(filteredOutputs)
	outputList.innerHTML = outputGroups
		.map(([gName, items]) => {
			const itemsHtml = items
				.map((d) => {
					let highlight = false
					let deemph = false
					if (selectedInput) {
						const inSR = selectedInput.defaultSampleRate
						const outSR = d.defaultSampleRate
						if (inSR && outSR) {
							highlight = inSR === outSR
							deemph = !highlight
						}
					}
					return deviceItemTemplate(d, 'outputDevice', highlight, deemph)
				})
				.join('')
			return `<div class="group">
							<div class="group-label">${gName} <span class="group-count">(${items.length})</span></div>
							${itemsHtml}
						</div>`
		})
		.join('')

	// Restore previously selected radios if they still exist
	if (selectedInputId) {
		const el = document.getElementById(`inputDevice-${selectedInputId}`)
		if (el) el.checked = true
	}
	const selectedOutputId = getSelectedRadioValue('outputDevice')
	if (selectedOutputId) {
		const el = document.getElementById(`outputDevice-${selectedOutputId}`)
		if (el) el.checked = true
	}

	inputList.addEventListener('change', () => {
		renderListsWithFilters()
		updateButtonStates()
	})
	outputList.addEventListener('change', updateButtonStates)
	updateButtonStates()
}

function renderDeviceLists(inputs, outputs) {
	inputsData = inputs
	outputsData = outputs
	renderListsWithFilters()
}

async function fetchDevices() {
	try {
		showStatus('Loading audio devices...', false)
		const res = await fetch('/api/devices')
		const response = await res.json()
		if (!response.success)
			throw new Error(response.message || 'Failed to fetch devices')
		const { inputs, outputs } = response.data
		// Build a combined unique list by device id so both sides show the same set
		const byId = new Map()
		;[...inputs, ...outputs].forEach((d) => byId.set(d.id, d))
		const allDevices = Array.from(byId.values())
		renderDeviceLists(allDevices, allDevices)
		showStatus(
			`✅ Found ${inputs.length} input(s) and ${outputs.length} output(s)`,
			false
		)
	} catch (error) {
		console.error('Error fetching devices:', error)
		showStatus(`❌ Error loading devices: ${error.message}`, true)
	}
}

async function fetchRoutes() {
	try {
		const res = await fetch('/api/routes')
		const response = await res.json()
		const list = document.getElementById('routesList')
		if (!response.success) throw new Error(response.message || 'Failed')
		const routes = response.data || []
		list.innerHTML = routes
			.map(
				(r) => `
						<div class="route-item">
							<div class="route-main">
								<div class="route-title">#${r.id} • ${r.inputDevice} → ${r.outputDevice}</div>
								<div class="route-meta">${new Date(r.timestamp).toLocaleString()}</div>
							</div>
							<div>
								<button class="btn btn-danger" onclick="stopRouteById(${r.id})">Stop</button>
							</div>
						</div>
					`
			)
			.join('')
		isRouting = routes.length > 0
		updateButtonStates()
	} catch (e) {
		console.warn('Failed to fetch routes', e)
	}
}

async function stopRouteById(id) {
	try {
		const res = await fetch(`/api/route/${id}/stop`, { method: 'POST' })
		const response = await res.json()
		if (!response.success)
			throw new Error(response.message || 'Failed to stop route')
		showStatus(`Stopped route #${id}`, false)
		await fetchRoutes()
	} catch (e) {
		showStatus(`❌ ${e.message}`, true)
	}
}

async function startRouting() {
	const inputId = getSelectedRadioValue('inputDevice')
	const outputId = getSelectedRadioValue('outputDevice')
	if (!inputId || !outputId) {
		showStatus('❌ Please select both input and output devices', true)
		return
	}
	try {
		showStatus('🔄 Starting audio routing...', false)
		const res = await fetch('/api/route', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				inputId: parseInt(inputId),
				outputId: parseInt(outputId),
			}),
		})
		const response = await res.json()
		if (!response.success)
			throw new Error(
				response.error || response.message || 'Failed to start routing'
			)
		isRouting = true
		updateButtonStates()
		const { inputDevice, outputDevice } = response.data
		showStatus(
			`🎵 Audio routing started: ${inputDevice} → ${outputDevice}`,
			false
		)
		fetchRoutes()
	} catch (error) {
		console.error('Error starting routing:', error)
		showStatus(`❌ Failed to start routing: ${error.message}`, true)
	}
}

async function stopRouting() {
	try {
		showStatus('🔄 Stopping audio routing...', false)
		const res = await fetch('/api/stop', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
		})
		const response = await res.json()
		if (!response.success)
			throw new Error(response.message || 'Failed to stop routing')
		isRouting = false
		updateButtonStates()
		const { stoppedCount } = response.data
		showStatus(`⏹️ Stopped ${stoppedCount} audio route(s)`, false)
		fetchRoutes()
	} catch (error) {
		console.error('Error stopping routing:', error)
		showStatus(`❌ Failed to stop routing: ${error.message}`, true)
	}
}

// Events
document.getElementById('refreshBtn').addEventListener('click', fetchDevices)
document
	.getElementById('refreshRoutesBtn')
	.addEventListener('click', fetchRoutes)
document.getElementById('themeBtn').addEventListener('click', toggleTheme)
document
	.getElementById('searchInput')
	.addEventListener('input', renderListsWithFilters)
document
	.getElementById('searchOutput')
	.addEventListener('input', renderListsWithFilters)

// Init
fetchDevices()
fetchRoutes()
routesTimer = setInterval(() => {
	if (!document.hidden) fetchRoutes()
}, 5000)
document.addEventListener('visibilitychange', () => {
	if (!document.hidden) fetchRoutes()
})
