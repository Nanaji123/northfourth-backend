const supabase = require('../config/supabaseClient');

exports.sendRequest = async (req, res) => {
  try {
    const { receiver_id } = req.body;
    const { data, error } = await supabase
      .from('connections')
      .insert({ sender_id: req.user.id, receiver_id })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; 

    const { data, error } = await supabase
      .from('connections')
      .update({ status, updated_at: new Date() })
      .eq('id', id)
      .eq('receiver_id', req.user.id) 
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
