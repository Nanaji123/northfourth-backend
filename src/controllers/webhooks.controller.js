const supabase = require('../config/supabaseClient');
const { getMessaging } = require('../config/firebase');

exports.handleSupabaseWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log('Received Supabase Webhook:', payload);

    if (payload.type === 'INSERT' && payload.table === 'notifications') {
      const notification = payload.record;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('fcm_token')
        .eq('id', notification.user_id)
        .single();

      if (profile && profile.fcm_token) {
        const message = {
          notification: {
            title: 'New Activity',
            body: `You have a new ${notification.type}`,
          },
          token: profile.fcm_token,
        };
        
        try {
          await getMessaging().send(message);
          console.log('Push notification sent successfully');
        } catch (fcmError) {
          console.warn('FCM send failed (non-fatal):', fcmError.message);
        }
      }
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
