const express = require('express');
const router = express.Router();
const conversationsController = require('../controllers/conversations.controller');
const { verifyAuth } = require('../middlewares/auth.middleware');

router.get('/', verifyAuth, conversationsController.getConversations);
router.post('/', verifyAuth, conversationsController.startConversation);
router.get('/:id/messages', verifyAuth, conversationsController.getMessages);
router.post('/:id/messages', verifyAuth, conversationsController.sendMessage);

module.exports = router;
