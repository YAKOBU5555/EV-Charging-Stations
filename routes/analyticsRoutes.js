const express = require('express');
const controller = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

router.get('/energy', controller.energy);
router.get('/utilization', controller.utilization);
router.get('/faults', controller.faults);
router.get('/stations', controller.stations);

module.exports = router;
