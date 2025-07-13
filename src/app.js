const express = require('express')
const cors = require('cors')
const path = require('path')
const { errorHandler, notFound } = require('./middleware/errorMiddleware')
const audioRoutes = require('./routes/audioRoutes')

const app = express()

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')))

// Routes
app.use('/api', audioRoutes)

// Error handling middleware
app.use(notFound)
app.use(errorHandler)

module.exports = app
