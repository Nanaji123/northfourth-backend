const express = require('express');
const router = express.Router();
const postsController = require('../controllers/posts.controller');
const { verifyAuth } = require('../middlewares/auth.middleware');
const { optionalAuth } = require('../middlewares/optionalAuth.middleware');

// Feed: optionalAuth so liked state is correctly returned when logged in
router.get('/feed', optionalAuth, postsController.getFeed);
router.post('/', verifyAuth, postsController.createPost);
router.post('/:id/like', verifyAuth, postsController.likePost);
router.get('/:id/comments', postsController.getComments);
router.post('/:id/comments', verifyAuth, postsController.addComment);

module.exports = router;
