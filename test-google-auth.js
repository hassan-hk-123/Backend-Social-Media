// Test file to debug Google OAuth issues
require('dotenv').config();
const { OAuth2Client } = require('google-auth-library');

console.log('=== Google OAuth Debug Test ===');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL || 'NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');

if (!process.env.GOOGLE_CLIENT_ID) {
  console.error('❌ GOOGLE_CLIENT_ID is not set in environment variables');
  console.log('Please add GOOGLE_CLIENT_ID to your .env file');
} else {
  console.log('✅ GOOGLE_CLIENT_ID is configured');
  
  // Test Google client creation
  try {
    const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    console.log('✅ Google OAuth client created successfully');
  } catch (error) {
    console.error('❌ Error creating Google OAuth client:', error.message);
  }
}

console.log('\n=== Environment Check Complete ===');
console.log('If you see any ❌ errors above, please fix them before testing Google login.'); 