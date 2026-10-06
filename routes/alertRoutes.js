const express = require('express');
const { body } = require('express-validator');
const controller = require('../controllers/alertController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect);

router.get('/', controller.list);
router.post('/', authorize('admin', 'operator'),
  body('type').notEmpty(), body('message').notEmpty(),
  validate, controller.create);
router.put('/:id/acknowledge', authorize('admin', 'operator'), controller.acknowledge);
router.put('/:id/resolve', authorize('admin', 'operator'), controller.resolve);
router.delete('/:id', authorize('admin'), controller.remove);

module.exports = router;
