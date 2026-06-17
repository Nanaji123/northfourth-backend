const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users.controller');
const { verifyAuth } = require('../middlewares/auth.middleware');

router.get('/nearby', verifyAuth, usersController.getNearbyUsers);
router.get('/:id', usersController.getProfile);
router.put('/:id', verifyAuth, usersController.updateProfile);

module.exports = router;
