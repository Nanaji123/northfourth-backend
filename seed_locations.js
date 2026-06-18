require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function seedLocations() {
  console.log('Seeding locations for test users...');

  // Get all users
  const { data: users, error } = await supabase.from('profiles').select('id');
  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  // San Francisco center as default generic mock area
  // We will scatter them randomly within ~50km of SF
  const BASE_LAT = 37.7749;
  const BASE_LNG = -122.4194;

  for (const user of users) {
    // Random offset between -0.4 and 0.4 degrees (~40km)
    const latOffset = (Math.random() - 0.5) * 0.8;
    const lngOffset = (Math.random() - 0.5) * 0.8;

    await supabase.from('profiles').update({
      latitude: BASE_LAT + latOffset,
      longitude: BASE_LNG + lngOffset
    }).eq('id', user.id);

    console.log(`Updated user ${user.id}`);
  }

  console.log('Done seeding locations! If your emulator is in SF, you will see them.');
}

seedLocations();
