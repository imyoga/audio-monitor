const notFound = (req, res, next) => {
	const error = new Error(`Not found - ${req.originalUrl}`)
	res.status(404)
	next(error)
}

const errorHandler = (err, req, res, next) => {
	let statusCode = res.statusCode === 200 ? 500 : res.statusCode
	let message = err.message

	// Mongoose bad ObjectId
	if (err.name === 'CastError' && err.kind === 'ObjectId') {
		statusCode = 404
		message = 'Resource not found'
	}

	// Log error for debugging
	console.error({
		message: err.message,
		stack: process.env.NODE_ENV === 'production' ? null : err.stack,
		url: req.originalUrl,
		method: req.method,
		ip: req.ip,
		timestamp: new Date().toISOString(),
	})

	res.status(statusCode).json({
		success: false,
		message,
		...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
	})
}

module.exports = {
	notFound,
	errorHandler,
}
