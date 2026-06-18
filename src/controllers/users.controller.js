const supabase = require('../config/supabaseClient');

// GET /api/users/me/profile — Get authenticated user's full profile with stats
exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Run all queries in parallel
    const [profileResult, postsResult, followersResult, followingResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('connections').select('id', { count: 'exact', head: true }).eq('receiver_id', userId).eq('status', 'accepted'),
      supabase.from('connections').select('id', { count: 'exact', head: true }).eq('sender_id', userId).eq('status', 'accepted'),
    ]);

    if (profileResult.error) throw profileResult.error;
    const profile = profileResult.data;

    res.json({
      id: profile.id,
      fullName: profile.full_name || '',
      email: req.user.email || '',
      bio: profile.bio || '',
      role: profile.role || 'Member',
      avatarUrl: profile.avatar_url || null,
      githubUrl: profile.github_url || '',
      linkedinUrl: profile.linkedin_url || '',
      portfolioUrl: profile.portfolio_url || '',
      skills: profile.skills || [],
      companyName: profile.company_name || '',
      yearsOfExperience: profile.years_of_experience || 0,
      availabilityStatus: profile.availability_status || '',
      postsCount: postsResult.count || 0,
      followersCount: followersResult.count || 0,
      followingCount: followingResult.count || 0,
    });
  } catch (error) {
    console.error('[getMyProfile] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/users/:id — Get a specific user's public profile
exports.getProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = req.user?.id;

    const [profileResult, postsResult, followersResult, followingResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', id),
      supabase.from('connections').select('id', { count: 'exact', head: true }).eq('receiver_id', id).eq('status', 'accepted'),
      supabase.from('connections').select('id', { count: 'exact', head: true }).eq('sender_id', id).eq('status', 'accepted'),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (!profileResult.data) return res.status(404).json({ error: 'Profile not found' });

    const profile = profileResult.data;

    // Check connection status with viewer
    let connectionStatus = null;
    if (viewerId && viewerId !== id) {
      const { data: conn } = await supabase
        .from('connections')
        .select('id, status, sender_id')
        .or(`and(sender_id.eq.${viewerId},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${viewerId})`)
        .maybeSingle();
      if (conn) {
        connectionStatus = {
          id: conn.id,
          status: conn.status,
          isSender: conn.sender_id === viewerId,
        };
      }
    }

    res.json({
      id: profile.id,
      fullName: profile.full_name || '',
      bio: profile.bio || '',
      role: profile.role || 'Member',
      avatarUrl: profile.avatar_url || null,
      githubUrl: profile.github_url || '',
      linkedinUrl: profile.linkedin_url || '',
      skills: profile.skills || [],
      postsCount: postsResult.count || 0,
      followersCount: followersResult.count || 0,
      followingCount: followingResult.count || 0,
      connectionStatus,
    });
  } catch (error) {
    console.error('[getProfile] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/users/:id — Update own profile
exports.updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (req.user.id !== id) {
      return res.status(403).json({ error: 'Not authorized to update this profile' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('[updateProfile] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/users/me/location — Update user's GPS location
exports.updateLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'latitude and longitude must be numbers' });
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        latitude,
        longitude,
        last_location_updated_at: new Date().toISOString(),
      })
      .eq('id', req.user.id);

    if (error) throw error;
    console.log(`[updateLocation] user=${req.user.id} lat=${latitude} lng=${longitude}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[updateLocation] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/users/nearby — Get users near a location
exports.getNearbyUsers = async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const { data, error } = await supabase.rpc('get_nearby_users', {
      viewer_id: req.user.id,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radius_meters: parseFloat(radius) || 50000,
    });

    if (error) throw error;

    // For each nearby user, check connection status
    const viewerId = req.user.id;
    const userIds = data.map(u => u.id);

    let connectionMap = {};
    if (userIds.length > 0) {
      const { data: connections } = await supabase
        .from('connections')
        .select('id, status, sender_id, receiver_id')
        .or(`sender_id.in.(${userIds.join(',')}),receiver_id.in.(${userIds.join(',')})`)
        .or(`sender_id.eq.${viewerId},receiver_id.eq.${viewerId}`);

      if (connections) {
        connections.forEach(c => {
          const otherId = c.sender_id === viewerId ? c.receiver_id : c.sender_id;
          connectionMap[otherId] = { id: c.id, status: c.status, isSender: c.sender_id === viewerId };
        });
      }
    }

    const formatted = data.map(user => {
      const distanceKm = (user.distance_meters / 1000).toFixed(1);
      const conn = connectionMap[user.id];
      return {
        id: user.id,
        name: user.full_name || 'Unknown',
        role: user.role || 'Member',
        skills: user.skills || [],
        distance: `${distanceKm} km`,
        distanceKm: parseFloat(distanceKm),
        angle: Math.floor(Math.random() * 360),
        initials: (user.full_name || 'U').substring(0, 2).toUpperCase(),
        color: '#2ecc71',
        bio: user.bio || '',
        githubUrl: user.github_url || '',
        linkedinUrl: user.linkedin_url || '',
        posts: 0,
        connections: 0,
        connected: conn?.status === 'accepted',
        requestSent: conn?.isSender && conn?.status === 'pending',
        connectionId: conn?.id || null,
        latitude: user.latitude,
        longitude: user.longitude,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('[getNearbyUsers] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/users/search?q= — Search users by name or role
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, bio, avatar_url, skills')
      .or(`full_name.ilike.%${q}%,role.ilike.%${q}%`)
      .neq('id', req.user.id)
      .limit(20);

    if (error) throw error;

    const formatted = (data || []).map(p => ({
      id: p.id,
      name: p.full_name || 'Unknown',
      role: p.role || 'Member',
      bio: p.bio || '',
      skills: p.skills || [],
      initials: (p.full_name || 'U').substring(0, 2).toUpperCase(),
      color: '#3498db',
      avatarUrl: p.avatar_url,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('[searchUsers] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/users/suggested — Suggested people (not yet connected)
exports.getSuggestedUsers = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get IDs of people already connected/pending
    const { data: myConnections } = await supabase
      .from('connections')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    const excludeIds = new Set([userId]);
    (myConnections || []).forEach(c => {
      excludeIds.add(c.sender_id);
      excludeIds.add(c.receiver_id);
    });

    // Get random profiles not in excluded set
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, bio, avatar_url, skills')
      .not('id', 'in', `(${[...excludeIds].join(',')})`)
      .limit(15);

    if (error) throw error;

    const formatted = (data || []).map(p => ({
      id: p.id,
      name: p.full_name || 'Unknown',
      role: p.role || 'Member',
      bio: p.bio || '',
      skills: p.skills || [],
      initials: (p.full_name || 'U').substring(0, 2).toUpperCase(),
      color: '#3498db',
      avatarUrl: p.avatar_url,
      mutual: 0,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('[getSuggestedUsers] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/users/me/fcm-token
exports.updateFcmToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fcm_token } = req.body;

    if (!fcm_token) {
      return res.status(400).json({ error: 'fcm_token is required' });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ fcm_token })
      .eq('id', userId);

    if (error) throw error;
    res.json({ success: true, message: 'FCM token updated' });
  } catch (error) {
    console.error('[updateFcmToken] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
