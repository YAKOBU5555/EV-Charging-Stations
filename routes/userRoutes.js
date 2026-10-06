const express = require('express');
const { body } = require('express-validator');
const controller = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect, authorize('admin')); // user management is admin-only

router.get('/', controller.list);
router.post('/',
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Enter a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Use at least 8 characters'),
  body('role').isIn(['admin', 'operator', 'viewer']),
  validate, controller.create);
router.put('/:id', controller.update);
router.put('/:id/password', body('password').isLength({ min: 8 }), validate, controller.resetPassword);
router.delete('/:id', controller.remove);

module.exports = router;
