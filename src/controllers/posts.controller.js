const supabase = require('../config/supabaseClient');

exports.createPost = async (req, res) => {
  console.log('[createPost] user:', req.user?.id, '| content length:', req.body?.content?.length);
  try {
    const { content, media_urls, tags } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: req.user.id,
        content: content.trim(),
        media_urls: media_urls || null,
        tags: tags && tags.length > 0 ? tags : null,
      })
      // Use the FK alias format: profiles:user_id(...) for Supabase to resolve FK
      .select('*, profiles:user_id(id, full_name, avatar_url, role)')
      .single();

    if (error) {
      console.error('[createPost] Supabase error:', error);
      throw error;
    }

    console.log('[createPost] Success, post id:', data.id);

    const post = {
      id: data.id,
      userId: data.user_id,
      userName: data.profiles?.full_name || 'User',
      userRole: data.profiles?.role || 'Member',
      initials: (data.profiles?.full_name || 'U').substring(0, 2).toUpperCase(),
      color: '#3498db',
      content: data.content,
      tags: data.tags || [],
      likes: 0,
      comments: 0,
      timestamp: 'Just now',
      liked: false,
    };
    res.status(201).json(post);
  } catch (error) {
    console.error('[createPost] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

exports.getFeed = async (req, res) => {
  console.log('[getFeed] user:', req.user?.id || 'anonymous');
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:user_id(id, full_name, avatar_url, role),
        post_likes(count),
        post_comments(count)
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[getFeed] Supabase error:', error);
      throw error;
    }

    console.log('[getFeed] Fetched', data.length, 'posts');

    let userLikes = new Set();
    if (req.user && data.length > 0) {
      const { data: likesData } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', req.user.id)
        .in('post_id', data.map(p => p.id));

      if (likesData) {
        likesData.forEach(l => userLikes.add(l.post_id));
      }
    }

    const formattedPosts = data.map(post => {
      const likesCount = post.post_likes?.[0]?.count ?? 0;
      const commentsCount = post.post_comments?.[0]?.count ?? 0;

      const diff = Date.now() - new Date(post.created_at).getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      let timestamp = 'Just now';
      if (minutes > 0) { timestamp = `${minutes}m ago`; }
      if (hours > 0) { timestamp = `${hours}h ago`; }
      if (days > 0) { timestamp = `${days}d ago`; }

      return {
        id: post.id,
        userId: post.user_id,
        userName: post.profiles?.full_name || 'User',
        userRole: post.profiles?.role || 'Member',
        initials: (post.profiles?.full_name || 'U').substring(0, 2).toUpperCase(),
        color: '#3498db',
        content: post.content,
        tags: post.tags || [],
        likes: Number(likesCount),
        comments: Number(commentsCount),
        timestamp,
        liked: req.user ? userLikes.has(post.id) : false,
      };
    });

    res.json(formattedPosts);
  } catch (error) {
    console.error('[getFeed] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

exports.likePost = async (req, res) => {
  const { id } = req.params;
  console.log('[likePost] post:', id, 'user:', req.user?.id);
  try {
    const { data: existingLike } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (existingLike) {
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('id', existingLike.id);
      if (error) throw error;
      console.log('[likePost] Unliked post', id);
      return res.status(200).json({ liked: false });
    } else {
      const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: id, user_id: req.user.id });
      if (error) throw error;
      console.log('[likePost] Liked post', id);
      return res.status(201).json({ liked: true });
    }
  } catch (error) {
    console.error('[likePost] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

exports.getComments = async (req, res) => {
  const { id } = req.params;
  console.log('[getComments] post:', id);
  try {
    const { data, error } = await supabase
      .from('post_comments')
      .select('*, profiles:user_id(id, full_name, avatar_url, role)')
      .eq('post_id', id)
      .order('created_at', { ascending: true });

    if (error) { console.error('[getComments] error:', error); throw error; }

    const formatted = data.map(c => {
      const diff = Date.now() - new Date(c.created_at).getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      let time = 'Just now';
      if (minutes > 0) { time = `${minutes}m`; }
      if (hours > 0) { time = `${hours}h`; }
      if (days > 0) { time = `${days}d`; }
      return {
        id: c.id,
        userId: c.user_id,
        name: c.profiles?.full_name || 'User',
        initials: (c.profiles?.full_name || 'U').substring(0, 2).toUpperCase(),
        color: '#3498db',
        text: c.content,
        time,
        createdAt: c.created_at,
      };
    });
    console.log('[getComments] Returning', formatted.length, 'comments for post', id);
    res.json(formatted);
  } catch (error) {
    console.error('[getComments] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

exports.addComment = async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  console.log('[addComment] post:', id, 'user:', req.user?.id);
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content is required' });
  }
  try {
    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: id, user_id: req.user.id, content: content.trim() })
      .select('*, profiles:user_id(id, full_name, avatar_url, role)')
      .single();

    if (error) { console.error('[addComment] error:', error); throw error; }

    console.log('[addComment] Success, comment id:', data.id);
    res.status(201).json({
      id: data.id,
      userId: data.user_id,
      name: data.profiles?.full_name || 'User',
      initials: (data.profiles?.full_name || 'U').substring(0, 2).toUpperCase(),
      color: '#3498db',
      text: data.content,
      time: 'Just now',
      createdAt: data.created_at,
    });
  } catch (error) {
    console.error('[addComment] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

exports.getUserPosts = async (req, res) => {
  const { userId } = req.params;
  console.log('[getUserPosts] for user:', userId);
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:user_id(id, full_name, avatar_url, role),
        post_likes(count),
        post_comments(count)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    let userLikes = new Set();
    if (req.user && data.length > 0) {
      const { data: likesData } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', req.user.id)
        .in('post_id', data.map(p => p.id));
      if (likesData) likesData.forEach(l => userLikes.add(l.post_id));
    }

    const formatted = data.map(post => {
      const diff = Date.now() - new Date(post.created_at).getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      let timestamp = 'Just now';
      if (minutes > 0) { timestamp = `${minutes}m ago`; }
      if (hours > 0) { timestamp = `${hours}h ago`; }
      if (days > 0) { timestamp = `${days}d ago`; }

      return {
        id: post.id,
        userId: post.user_id,
        userName: post.profiles?.full_name || 'User',
        userRole: post.profiles?.role || 'Member',
        initials: (post.profiles?.full_name || 'U').substring(0, 2).toUpperCase(),
        color: '#3498db',
        content: post.content,
        tags: post.tags || [],
        likes: Number(post.post_likes?.[0]?.count ?? 0),
        comments: Number(post.post_comments?.[0]?.count ?? 0),
        timestamp,
        liked: req.user ? userLikes.has(post.id) : false,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('[getUserPosts] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
