const supabase = require('../config/supabaseClient');
const pushService = require('../services/push.service');

// GET /api/notifications — Get notifications for the authenticated user
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('notifications')
      .select('*, actor:actor_id(id, full_name, avatar_url, role)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const formatted = (data || []).map(n => {
      const diff = Date.now() - new Date(n.created_at).getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      let time = 'Just now';
      if (minutes > 0) { time = `${minutes}m ago`; }
      if (hours > 0) { time = `${hours}h ago`; }
      if (days > 0) { time = `${days}d ago`; }

      const actorName = n.actor?.full_name || 'Someone';
      let text = '';
      let icon = 'notifications-outline';
      let color = '#3498db';

      switch (n.type) {
        case 'like':
          text = `${actorName} liked your post.`;
          icon = 'heart';
          color = '#e74c3c';
          break;
        case 'comment':
          text = `${actorName} commented on your post.`;
          icon = 'chatbubble';
          color = '#3498db';
          break;
        case 'connect':
          text = `${actorName} sent you a connection request.`;
          icon = 'person-add';
          color = '#2ecc71';
          break;
        case 'accept':
          text = `${actorName} accepted your connection request.`;
          icon = 'people';
          color = '#9b59b6';
          break;
        default:
          text = n.message || 'New notification';
      }

      return {
        id: n.id,
        type: n.type,
        text,
        icon,
        color,
        time,
        isRead: n.is_read,
        actorId: n.actor_id,
        actorName,
        actorInitials: (n.actor?.full_name || 'U').substring(0, 2).toUpperCase(),
        postId: n.post_id || null,
        createdAt: n.created_at,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('[getNotifications] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/notifications/read-all — Mark all as read
exports.markAllRead = async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('[markAllRead] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/notifications/unread-count — Get count of unread notifications
exports.getUnreadCount = async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (error) {
    console.error('[getUnreadCount] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/notifications/test-push — Send a push notification manually (for testing via Postman)
exports.sendCustomPush = async (req, res) => {
  try {
    const { user_id, title, body, data } = req.body;

    if (!user_id || !title || !body) {
      return res.status(400).json({ error: 'user_id, title, and body are required' });
    }

    const success = await pushService.sendPushNotification(user_id, title, body, data || {});
    
    if (success) {
      // Also insert into the database so it shows up in the app's Notifications screen
      await supabase.from('notifications').insert({
        user_id,
        actor_id: req.user.id,
        type: 'custom',
        message: body,
      });

      res.json({ success: true, message: 'Push notification sent and saved to database' });
    } else {
      res.status(500).json({ error: 'Failed to send push notification. Check server logs.' });
    }
  } catch (error) {
    console.error('[sendCustomPush] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
