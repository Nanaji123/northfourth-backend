const express = require('express');
const router = express.Router();
const connectionsController = require('../controllers/connections.controller');
const { verifyAuth } = require('../middlewares/auth.middleware');

router.post('/request', verifyAuth, connectionsController.sendRequest);
router.put('/:id', verifyAuth, connectionsController.updateRequest);

module.exports = router;
