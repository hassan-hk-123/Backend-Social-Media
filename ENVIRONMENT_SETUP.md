# Environment Variables Setup

Create a `.env` file in the Backend directory with the following variables:

## Required Environment Variables

```env
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/talkhub

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here

# Email Configuration
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_app_password

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here

# Facebook OAuth Configuration
FACEBOOK_APP_ID=your_facebook_app_id_here
FACEBOOK_APP_SECRET=your_facebook_app_secret_here

# Cloudinary Configuration (for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Node Environment
NODE_ENV=development
```

## Frontend Environment Variables

Create a `.env.local` file in the Frontend directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id_here
NEXT_PUBLIC_FACEBOOK_APP_ID=your_facebook_app_id_here
```

## How to Get OAuth Credentials

### Google OAuth Setup:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Set authorized origins: `http://localhost:3000`
6. Set authorized redirect URIs: `http://localhost:3000`
7. Copy the Client ID

### Facebook OAuth Setup (FIXED for "Invalid Scopes: email" error):
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or select existing one
3. Add Facebook Login product
4. Go to Settings → Basic
5. Copy the App ID
6. **IMPORTANT: Go to Facebook Login → Settings**
7. Add Valid OAuth Redirect URIs: `http://localhost:3000`
8. Add Valid OAuth Redirect URIs: `http://localhost:3000/login`
9. Add Valid OAuth Redirect URIs: `http://localhost:3000/signup`
10. **CRITICAL: Go to App Review → Permissions and Features**
11. **Add the following permissions:**
    - `email` (Basic permissions - no review needed)
    - `public_profile` (Basic permissions - no review needed)
12. **Go to Roles → Test Users**
13. **Add yourself as a Test User** (if app is in development mode)
14. **Go to App Settings → Advanced**
15. **Add your domain to "Valid OAuth Redirect URIs"**
16. **Make sure "Client OAuth Login" is enabled**
17. **Make sure "Web OAuth Login" is enabled**

### Fixing "Invalid Scopes: email" Error:
If you're getting the "Invalid Scopes: email" error:

1. **Check App Status:**
   - Go to App Review → App Review
   - Make sure your app is either in "Development" or "Live" mode
   - If in "Development" mode, add yourself as a Test User

2. **Verify Permissions:**
   - Go to App Review → Permissions and Features
   - Make sure `email` and `public_profile` are listed
   - These are basic permissions that don't require review

3. **Check App Settings:**
   - Go to Settings → Basic
   - Make sure "App Domains" includes `localhost`
   - Add `http://localhost:3000` to "Valid OAuth Redirect URIs"

4. **Test with Test Users:**
   - If your app is in development mode, you can only test with Test Users
   - Go to Roles → Test Users
   - Create a test user or add your Facebook account as a test user

5. **Common Issues:**
   - **App not in development mode:** Make sure your app is set to "Development" mode
   - **Missing permissions:** Add `email` and `public_profile` to permissions
   - **Wrong redirect URIs:** Make sure all your redirect URIs are properly configured
   - **Not a test user:** If in development mode, you must be a test user

## Installation Steps

1. Install backend dependencies:
```bash
cd Backend
npm install
```

2. Install frontend dependencies:
```bash
cd Frontend
npm install
```

3. Set up environment variables as shown above

4. Start the backend server:
```bash
cd Backend
npm run dev
```

5. Start the frontend development server:
```bash
cd Frontend
npm run dev
```

## Features Added

- ✅ Google OAuth Login/Signup
- ✅ Facebook OAuth Login/Signup
- ✅ Automatic username generation for social logins
- ✅ Profile image import from social accounts
- ✅ Password reset disabled for social accounts
- ✅ Seamless integration with existing manual login system 