const express = require('express');
const { body } = require('express-validator');
const controller = require('../controllers/chargerController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect);

router.get('/', controller.list);
router.get('/:id', controller.detail);
router.post('/', authorize('admin'),
  body('chargerId').trim().notEmpty().withMessage('Charger ID is required'),
  body('station').isMongoId().withMessage('Select a station'),
  body('maxPower').optional().isFloat({ min: 1 }),
  validate, controller.create);
router.put('/:id', authorize('admin', 'operator'), controller.update);
router.delete('/:id', authorize('admin'), controller.remove);

module.exports = router;
