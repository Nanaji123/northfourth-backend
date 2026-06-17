const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhooks.controller');

// /api/webhooks/supabase
router.post('/supabase', webhookController.handleSupabaseWebhook);

module.exports = router;
