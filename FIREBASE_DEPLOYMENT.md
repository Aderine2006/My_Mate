# Firebase Deployment Guide for MYMate

This guide will walk you through deploying MYMate to Firebase Hosting and setting up real-time data synchronization using Firestore.

## Prerequisites

- Node.js installed
- A Google account
- Firebase CLI tools

## Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

Or if you prefer without global installation:
```bash
npm install --save-dev firebase-tools
```

## Step 2: Login to Firebase

```bash
firebase login
```

This will open your browser for authentication. Complete the login process.

## Step 3: Initialize Firebase in Your Project

Navigate to your project directory and run:

```bash
firebase init
```

You'll be prompted with several questions:

1. **Select Firebase features**: 
   - Select `Hosting` (press Space to select, Enter to confirm)
   - Optionally select `Firestore` for real-time database

2. **Select a Firebase project**: 
   - Choose "Create a new project" or select an existing one
   - Enter a project name (e.g., `mymate-tracker`)
   - Follow prompts to set up the project

3. **What do you want to use as your public directory?**
   - Enter: `dist` (this is where Vite builds the production files)

4. **Configure as a single-page app?**
   - Enter: `Yes` (this handles routing correctly)

5. **Set up automatic builds and deploys with GitHub?**
   - Enter: `No` (unless you want CI/CD)

6. **File dist/index.html already exists. Overwrite?**
   - Enter: `No` (we want to keep our existing HTML)

## Step 4: Build Your Project

First, build your project for production:

```bash
npm run build
```

This creates a `dist` folder with optimized production files.

## Step 5: Deploy to Firebase Hosting

```bash
firebase deploy
```

Or specifically for hosting:

```bash
firebase deploy --only hosting
```

Your app will be live at: `https://YOUR-PROJECT-ID.web.app` or `https://YOUR-PROJECT-ID.firebaseapp.com`

## Step 6: Set Up Firestore for Real-time Data

### 6.1 Enable Firestore Database

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click on "Firestore Database" in the left menu
4. Click "Create database"
5. Choose "Start in test mode" (for development) or set up production rules
6. Select a location closest to your users
7. Click "Enable"

### 6.2 Set Firestore Security Rules

Go to Firestore Database → Rules and update with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Allow authenticated users to manage their own data
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

For testing purposes, you can use:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

⚠️ **Warning**: The test mode rules allow anyone to read/write. Only use for development!

## Step 7: Update Package.json with Firebase SDK

Add Firebase to your dependencies:

```bash
npm install firebase
```

## Step 8: Create Firebase Configuration File

Create `src/firebase.ts`:

```typescript
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDzb4Y2jqeGuC-ym0_u_eKxwsNZeMzJsok",
  authDomain: "mymate-2487.firebaseapp.com",
  projectId: "mymate-2487",
  storageBucket: "mymate-2487.appspot.com",
  messagingSenderId: "252566323457",
  appId: "1:252566323457:web:a2d9edf540286543cddb00"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
```

**Where to find your config:**
1. Go to Firebase Console → Project Settings
2. Scroll down to "Your apps"
3. Click the web icon (</>) to add a web app or select existing
4. Copy the config values

## Step 9: Update Your App to Use Firestore

Replace localStorage calls with Firestore operations. This requires modifying `src/mymate-tracker.tsx` to use Firebase instead of localStorage.

## Step 10: Deploy Again

After making changes:

```bash
npm run build
firebase deploy
```

## Quick Deployment Checklist

- [ ] Firebase CLI installed
- [ ] Logged into Firebase
- [ ] Project initialized (`firebase init`)
- [ ] Firestore enabled in Firebase Console
- [ ] Security rules configured
- [ ] Firebase SDK installed
- [ ] Firebase config file created with your credentials
- [ ] Project built (`npm run build`)
- [ ] Deployed (`firebase deploy`)

## Useful Firebase Commands

```bash
# View deployment history
firebase hosting:channel:list

# Deploy to a preview channel
firebase hosting:channel:deploy preview

# Open Firebase Console
firebase open

# View project info
firebase projects:list

# Serve locally (with Firebase emulators)
firebase emulators:start
```

## Custom Domain (Optional)

1. Go to Firebase Console → Hosting
2. Click "Add custom domain"
3. Follow the DNS setup instructions
4. Wait for SSL certificate provisioning

## Troubleshooting

### Build Errors
- Make sure all dependencies are installed: `npm install`
- Check TypeScript errors: `npm run build`

### Deployment Errors
- Verify you're logged in: `firebase login`
- Check project is initialized: Look for `.firebaserc` and `firebase.json`
- Ensure `dist` folder exists after build

### Real-time Sync Issues
- Check Firestore security rules
- Verify Firebase config values are correct
- Check browser console for errors
- Ensure Firestore is enabled in Firebase Console

## Next Steps

After deployment, you can:
- Set up Firebase Authentication for real user authentication
- Add Firebase Analytics for usage tracking
- Set up Firebase Storage for file uploads
- Configure custom domain
- Set up automated deployments with GitHub Actions

## Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Hosting Guide](https://firebase.google.com/docs/hosting)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Firebase Console](https://console.firebase.google.com/)

