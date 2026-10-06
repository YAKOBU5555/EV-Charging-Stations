const express = require('express');
const { body } = require('express-validator');
const controller = require('../controllers/stationController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect);

const stationRules = [
  body('stationId').trim().notEmpty().withMessage('Station ID is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('location').trim().notEmpty().withMessage('Location is required'),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180')
];

router.get('/', controller.list);
router.get('/:id', controller.detail);
router.post('/', authorize('admin'), stationRules, validate, controller.create);
router.put('/:id', authorize('admin'), controller.update);
router.delete('/:id', authorize('admin'), controller.remove);

module.exports = router;
