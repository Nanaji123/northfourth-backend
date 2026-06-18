const express = require('express');
const router = express.Router();
const connectionsController = require('../controllers/connections.controller');
const { verifyAuth } = require('../middlewares/auth.middleware');

router.get('/requests', verifyAuth, connectionsController.getRequests);
router.get('/my', verifyAuth, connectionsController.getMyConnections);
router.post('/request', verifyAuth, connectionsController.sendRequest);
router.put('/:id', verifyAuth, connectionsController.updateRequest);
router.delete('/:id', verifyAuth, connectionsController.deleteRequest);

module.exports = router;
