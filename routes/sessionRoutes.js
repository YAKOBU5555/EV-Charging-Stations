const express = require('express');
const { body } = require('express-validator');
const controller = require('../controllers/sessionController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect);

router.get('/', controller.list);
router.get('/:id', controller.detail);
router.post('/', authorize('admin', 'operator'),
  body('charger').isMongoId().withMessage('Select a charger'),
  body('vehicleId').trim().notEmpty().withMessage('Vehicle ID is required'),
  validate, controller.start);
router.put('/:id/stop', authorize('admin', 'operator'), controller.stop);

module.exports = router;
