const { body, validationResult } = require('express-validator')

// Validation middleware for route requests
const validateRouteRequest = [
	body('inputId')
		.isInt({ min: 0 })
		.withMessage('Input ID must be a non-negative integer'),
	body('outputId')
		.isInt({ min: 0 })
		.withMessage('Output ID must be a non-negative integer'),

	// Handle validation errors
	(req, res, next) => {
		const errors = validationResult(req)
		if (!errors.isEmpty()) {
			return res.status(400).json({
				success: false,
				message: 'Validation failed',
				errors: errors.array(),
			})
		}
		next()
	},
]

module.exports = {
	validateRouteRequest,
}
