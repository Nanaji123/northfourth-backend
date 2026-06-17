const admin = require('firebase-admin');
const { cert, initializeApp, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

try {
  if (!getApps().length) {
    const serviceAccount = require('../../firebase-service-account.json');
    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log('✅ Firebase Admin SDK Initialized');
  }
} catch (error) {
  console.warn('⚠️ Firebase Admin SDK not initialized:', error.message);
}

module.exports = { admin, getMessaging };
