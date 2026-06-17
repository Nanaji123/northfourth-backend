const { createClient } = require('@supabase/supabase-js');

// Use ANON key specifically for user JWT verification.
// The service role key cannot validate user tokens.
const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const verifyAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await authClient.auth.getUser(token);

    if (error || !user) {
      console.error('Auth error:', error?.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware exception:', err.message);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

module.exports = { verifyAuth };
