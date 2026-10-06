const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const controller = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');

const router = express.Router();

// Brute-force guard on the only unauthenticated write endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', // rate limiting would trip the test suite
  message: { success: false, message: 'Too many sign-in attempts. Try again in a few minutes.', error: 'RATE_LIMITED' }
});

router.post('/login', loginLimiter,
  body('email').isEmail().withMessage('Enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate, controller.login);

router.post('/logout', protect, controller.logout);
router.get('/me', protect, controller.me);
router.put('/password', protect,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).withMessage('Use at least 8 characters'),
  validate, controller.changePassword);

module.exports = router;
