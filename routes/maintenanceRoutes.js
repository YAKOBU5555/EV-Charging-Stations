const express = require('express');
const { body } = require('express-validator');
const controller = require('../controllers/maintenanceController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect);

router.get('/', controller.list);
router.post('/', authorize('admin', 'operator'),
  body('station').isMongoId().withMessage('Select a station'),
  body('description').trim().notEmpty().withMessage('Describe the work'),
  body('technician').trim().notEmpty().withMessage('Assign a technician'),
  body('scheduledDate').isISO8601().withMessage('Pick a date'),
  validate, controller.create);
router.put('/:id', authorize('admin', 'operator'), controller.update);
router.delete('/:id', authorize('admin'), controller.remove);

module.exports = router;
