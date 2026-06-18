const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const { verifyAuth } = require('../middlewares/auth.middleware');

router.get('/', verifyAuth, notificationsController.getNotifications);
router.get('/unread-count', verifyAuth, notificationsController.getUnreadCount);
router.put('/read-all', verifyAuth, notificationsController.markAllRead);
router.post('/test-push', verifyAuth, notificationsController.sendCustomPush);

module.exports = router;
