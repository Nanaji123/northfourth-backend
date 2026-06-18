const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users.controller');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { optionalAuth } = require('../middlewares/optionalAuth.middleware');

// IMPORTANT: specific routes must come BEFORE /:id to avoid param conflict
router.get('/me/profile', verifyAuth, usersController.getMyProfile);
router.put('/me/location', verifyAuth, usersController.updateLocation);
router.put('/me/fcm-token', verifyAuth, usersController.updateFcmToken);
router.get('/nearby', verifyAuth, usersController.getNearbyUsers);
router.get('/search', verifyAuth, usersController.searchUsers);
router.get('/suggested', verifyAuth, usersController.getSuggestedUsers);
router.get('/:id', optionalAuth, usersController.getProfile);
router.put('/:id', verifyAuth, usersController.updateProfile);

module.exports = router;
