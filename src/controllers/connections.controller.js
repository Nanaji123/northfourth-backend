const supabase = require('../config/supabaseClient');

// POST /api/connections/request — Send a connection request
exports.sendRequest = async (req, res) => {
  try {
    const { receiver_id } = req.body;

    if (!receiver_id) {
      return res.status(400).json({ error: 'receiver_id is required' });
    }

    // Check if a connection already exists (either direction)
    const { data: existing } = await supabase
      .from('connections')
      .select('id, status')
      .or(`and(sender_id.eq.${req.user.id},receiver_id.eq.${receiver_id}),and(sender_id.eq.${receiver_id},receiver_id.eq.${req.user.id})`)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'Connection already exists', existing });
    }

    const { data, error } = await supabase
      .from('connections')
      .insert({ sender_id: req.user.id, receiver_id, status: 'pending' })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('[sendRequest] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/connections/:id — Accept or reject a connection request
exports.updateRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be accepted or rejected' });
    }

    const { data, error } = await supabase
      .from('connections')
      .update({ status, updated_at: new Date() })
      .eq('id', id)
      .eq('receiver_id', req.user.id) // only receiver can accept/reject
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Request not found or not authorized' });
    res.json(data);
  } catch (error) {
    console.error('[updateRequest] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/connections/:id — Withdraw a sent request (or remove a connection)
exports.deleteRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('id', id)
      .eq('sender_id', req.user.id); // only sender can withdraw

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('[deleteRequest] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/connections/requests — Get incoming & sent connection requests
exports.getRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    // Incoming: others sent to me, still pending
    const { data: incomingRaw, error: inErr } = await supabase
      .from('connections')
      .select('id, status, created_at, profiles:sender_id(id, full_name, avatar_url, role, bio)')
      .eq('receiver_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (inErr) throw inErr;

    // Sent: I sent to others, still pending
    const { data: sentRaw, error: sentErr } = await supabase
      .from('connections')
      .select('id, status, created_at, profiles:receiver_id(id, full_name, avatar_url, role, bio)')
      .eq('sender_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (sentErr) throw sentErr;

    const formatUser = (profile, connectionId, createdAt) => ({
      connectionId,
      createdAt,
      user: {
        id: profile?.id,
        name: profile?.full_name || 'Unknown',
        role: profile?.role || 'Member',
        bio: profile?.bio || '',
        initials: (profile?.full_name || 'U').substring(0, 2).toUpperCase(),
        color: '#3498db',
        avatarUrl: profile?.avatar_url || null,
      }
    });

    const incoming = (incomingRaw || []).map(r => formatUser(r.profiles, r.id, r.created_at));
    const sent = (sentRaw || []).map(r => formatUser(r.profiles, r.id, r.created_at));

    console.log(`[getRequests] incoming: ${incoming.length}, sent: ${sent.length}`);
    res.json({ incoming, sent });
  } catch (error) {
    console.error('[getRequests] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/connections/my — Get accepted connections list
exports.getMyConnections = async (req, res) => {
  try {
    const userId = req.user.id;

    // Connections where I am sender
    const { data: asSender, error: e1 } = await supabase
      .from('connections')
      .select('id, created_at, profiles:receiver_id(id, full_name, avatar_url, role, bio, skills)')
      .eq('sender_id', userId)
      .eq('status', 'accepted');

    if (e1) throw e1;

    // Connections where I am receiver
    const { data: asReceiver, error: e2 } = await supabase
      .from('connections')
      .select('id, created_at, profiles:sender_id(id, full_name, avatar_url, role, bio, skills)')
      .eq('receiver_id', userId)
      .eq('status', 'accepted');

    if (e2) throw e2;

    const format = (c) => ({
      connectionId: c.id,
      connectedAt: c.created_at,
      id: c.profiles?.id,
      name: c.profiles?.full_name || 'Unknown',
      role: c.profiles?.role || 'Member',
      bio: c.profiles?.bio || '',
      skills: c.profiles?.skills || [],
      initials: (c.profiles?.full_name || 'U').substring(0, 2).toUpperCase(),
      color: '#3498db',
      avatarUrl: c.profiles?.avatar_url || null,
    });

    const connections = [
      ...(asSender || []).map(format),
      ...(asReceiver || []).map(format),
    ].filter(c => c.id); // filter out null profiles

    res.json(connections);
  } catch (error) {
    console.error('[getMyConnections] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
