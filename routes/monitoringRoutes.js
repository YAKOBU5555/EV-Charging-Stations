const express = require('express');
const { body } = require('express-validator');
const controller = require('../controllers/monitoringController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');

const router = express.Router();
router.use(protect);

router.get('/overview', controller.overview);
router.get('/map', controller.mapData);
router.get('/chargers/:id', controller.chargerHealth);
router.get('/stations/:id', controller.stationHealth);

router.post('/telemetry', authorize('admin', 'operator'),
  body('chargerId').notEmpty().withMessage('chargerId is required'),
  body('voltage').isFloat(), body('current').isFloat(),
  body('temperature').isFloat(),
  validate, controller.ingestTelemetry);

router.get('/config', controller.getConfiguration);
router.put('/config', authorize('admin'), controller.updateConfiguration);

router.get('/simulator', controller.simulatorStatus);
router.post('/simulator/start', authorize('admin'), controller.simulatorStart);
router.post('/simulator/stop', authorize('admin'), controller.simulatorStop);

module.exports = router;
