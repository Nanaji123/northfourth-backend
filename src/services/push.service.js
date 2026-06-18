const { getMessaging } = require('../config/firebase');
const supabase = require('../config/supabaseClient');

/**
 * Sends a push notification to a specific user.
 * @param {string} userId - The Supabase user ID of the recipient.
 * @param {string} title - The title of the notification.
 * @param {string} body - The body of the notification.
 * @param {Object} data - Optional extra data payload.
 */
exports.sendPushNotification = async (userId, title, body, data = {}) => {
  try {
    // 1. Fetch user's FCM token from Supabase profiles
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('fcm_token')
      .eq('id', userId)
      .single();

    if (error) {
      console.error(`[PushService] Failed to fetch fcm_token for user ${userId}:`, error.message);
      return false;
    }

    if (!profile || !profile.fcm_token) {
      console.log(`[PushService] User ${userId} has no fcm_token. Skipping push notification.`);
      return false;
    }

    // 2. Construct FCM payload
    const message = {
      token: profile.fcm_token,
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        // Ensure all data values are strings as required by FCM
      },
      // Settings for high-priority delivery
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            sound: 'default',
          },
        },
      },
    };

    // 3. Send message via Firebase Admin
    const response = await getMessaging().send(message);
    console.log(`[PushService] Successfully sent message to user ${userId}:`, response);
    return true;

  } catch (error) {
    console.error(`[PushService] Error sending message to user ${userId}:`, error);
    return false;
  }
};
