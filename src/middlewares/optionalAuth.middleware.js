const { createClient } = require('@supabase/supabase-js');

// Uses the anon key to optionally verify the token.
// Does NOT block the request if no token is provided.
const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user } } = await authClient.auth.getUser(token);
    req.user = user || null;
  } catch {
    req.user = null;
  }
  next();
};

module.exports = { optionalAuth };
