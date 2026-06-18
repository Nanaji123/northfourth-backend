const supabase = require('../config/supabaseClient');
const pushService = require('../services/push.service');

const formatTime = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m} ${ampm}`;
};

const formatRelative = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  return formatTime(dateString);
};

// GET /api/conversations — Get all conversations for the authenticated user
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch conversations where user is participant1 or participant2
    const { data: convos, error } = await supabase
      .from('conversations')
      .select(`
        id, 
        last_message_at,
        participant1_id,
        participant2_id,
        p1:participant1_id(id, full_name, role, avatar_url),
        p2:participant2_id(id, full_name, role, avatar_url)
      `)
      .or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`)
      .order('last_message_at', { ascending: false });

    if (error) throw error;

    // We also need the latest message for the UI and the unread count
    // Supabase JS doesn't easily do lateral joins in the standard client, so we fetch latest messages manually or use a view.
    // For simplicity, we can just do a second query or fetch messages in parallel.
    // Actually, getting the last message is common. We'll fetch the last 1 message per conversation.
    const formatted = await Promise.all(convos.map(async (c) => {
      const otherProfile = c.participant1_id === userId ? c.p2 : c.p1;

      const { data: latestMsg } = await supabase
        .from('messages')
        .select('content, is_read, sender_id, created_at')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count: unreadCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .eq('is_read', false)
        .neq('sender_id', userId);

      return {
        id: c.id,
        userId: otherProfile?.id,
        userName: otherProfile?.full_name || 'Unknown',
        userRole: otherProfile?.role || 'Member',
        initials: (otherProfile?.full_name || 'U').substring(0, 2).toUpperCase(),
        color: '#3498db', // We could generate this consistently based on ID
        lastMessage: latestMsg?.content || 'Started a conversation',
        lastMessageTime: formatRelative(latestMsg?.created_at || c.last_message_at),
        unread: unreadCount || 0,
      };
    }));

    res.json(formatted);
  } catch (error) {
    console.error('[getConversations] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/conversations — Start a conversation with a user
exports.startConversation = async (req, res) => {
  try {
    const { receiver_id } = req.body;
    const sender_id = req.user.id;

    if (!receiver_id) return res.status(400).json({ error: 'receiver_id is required' });

    // Ensure they are not the same person
    if (sender_id === receiver_id) return res.status(400).json({ error: 'Cannot message yourself' });

    // Check if conversation already exists
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant1_id.eq.${sender_id},participant2_id.eq.${receiver_id}),and(participant1_id.eq.${receiver_id},participant2_id.eq.${sender_id})`)
      .maybeSingle();

    if (existing) {
      return res.json({ id: existing.id, isNew: false });
    }

    // Create new conversation
    const { data: newConvo, error } = await supabase
      .from('conversations')
      .insert({ participant1_id: sender_id, participant2_id: receiver_id })
      .select('id')
      .single();

    if (error) throw error;
    res.status(201).json({ id: newConvo.id, isNew: true });
  } catch (error) {
    console.error('[startConversation] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/conversations/:id/messages — Get messages for a conversation
exports.getMessages = async (req, res) => {
  try {
    const { id } = req.params;

    // We should mark unread messages as read when fetching them
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', id)
      .neq('sender_id', req.user.id)
      .eq('is_read', false);

    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, content, created_at, is_read')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const formatted = data.map(m => ({
      id: m.id,
      chatId: id,
      senderId: m.sender_id === req.user.id ? 'me' : m.sender_id,
      text: m.content,
      timestamp: formatTime(m.created_at),
      rawDate: m.created_at
    }));

    res.json(formatted);
  } catch (error) {
    console.error('[getMessages] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/conversations/:id/messages — Send a message
exports.sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const sender_id = req.user.id;

    if (!content) return res.status(400).json({ error: 'Message content is required' });

    // Verify conversation exists and user is participant
    const { data: convo } = await supabase
      .from('conversations')
      .select('participant1_id, participant2_id')
      .eq('id', id)
      .maybeSingle();

    if (!convo || (convo.participant1_id !== sender_id && convo.participant2_id !== sender_id)) {
      return res.status(403).json({ error: 'Not authorized for this conversation' });
    }

    // Insert message
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: id,
        sender_id,
        content
      })
      .select('id, content, created_at')
      .single();

    if (error) throw error;

    // Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: data.created_at })
      .eq('id', id);

    // Notify receiver (in-app DB notification)
    const receiver_id = convo.participant1_id === sender_id ? convo.participant2_id : convo.participant1_id;
    await supabase
      .from('notifications')
      .insert({
        user_id: receiver_id,
        actor_id: sender_id,
        type: 'message',
        message: 'New message received'
      });

    // Send Push Notification
    const senderName = req.user.user_metadata?.full_name || 'Someone'; // Or query profiles if needed, for simplicity we use generic or JWT info
    pushService.sendPushNotification(
      receiver_id,
      'New Message',
      `${senderName}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
      { type: 'message', chatId: id }
    );

    res.status(201).json({
      id: data.id,
      chatId: id,
      senderId: 'me',
      text: data.content,
      timestamp: formatTime(data.created_at),
    });
  } catch (error) {
    console.error('[sendMessage] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
