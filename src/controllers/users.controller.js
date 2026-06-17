const supabase = require('../config/supabaseClient');

exports.getProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Profile not found' });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

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
    res.status(500).json({ error: error.message });
  }
};

exports.getNearbyUsers = async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const { data, error } = await supabase.rpc('get_nearby_users', {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radius_meters: parseFloat(radius) || 50000 
    });

    if (error) throw error;

    const formatted = data.map(user => {
      const distanceKm = (user.distance_meters / 1000).toFixed(1);
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
        githubUrl: '',
        posts: 0,
        connections: 0,
        connected: false,
        requestSent: false
      };
    });

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
