# Quick Deployment Steps for Firebase

## 🚀 Quick Start Guide

### Step 1: Install Firebase CLI
```bash
npm install -g firebase-tools
```

### Step 2: Login
```bash
firebase login
```

### Step 3: Initialize Firebase
```bash
firebase init
```

**Select:**
- ✅ Hosting
- ✅ Firestore
- Public directory: `dist`
- Single-page app: `Yes`
- Overwrite index.html: `No`

### Step 4: Get Firebase Config
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select/Create your project
3. Go to Project Settings (gear icon)
4. Scroll to "Your apps" → Click Web icon `</>`
5. Copy the config object

### Step 5: Create Firebase Config File
Create `src/firebase.ts` with your config:
```typescript
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
```

### Step 6: Install Firebase SDK
```bash
npm install firebase
```

### Step 7: Enable Firestore
1. Firebase Console → Firestore Database
2. Click "Create database"
3. Start in test mode
4. Choose location

### Step 8: Build & Deploy
```bash
npm run build
firebase deploy
```

### Step 9: Access Your App
Your app will be live at:
- `https://YOUR-PROJECT-ID.web.app`
- `https://YOUR-PROJECT-ID.firebaseapp.com`

## 🔧 Troubleshooting

### Service Account Error
If you encounter this error:
```
Error: Service account github-action-XXXXX@PROJECT-ID.iam.gserviceaccount.com does not exist.
```

**Solution 1: Skip GitHub Actions Setup (Recommended for manual deployment)**
- When running `firebase init`, answer `No` to "Set up automatic builds and deploys with GitHub?"
- Deploy manually using `firebase deploy` after building

**Solution 2: Create the Service Account (For CI/CD)**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (`mymate-2487`)
3. Navigate to **IAM & Admin** → **Service Accounts**
4. Click **Create Service Account**
5. Enter name: `github-action-1130129058` (or the ID from the error)
6. Grant roles: **Firebase Admin** and **Service Account User**
7. Click **Done**

**Solution 3: Use Firebase Token Instead**
1. Generate a token: `firebase login:ci`
2. Use the token in your CI/CD pipeline instead of service account

## 📝 Note
For real-time sync, you'll need to update the code to use Firestore instead of localStorage. See `FIREBASE_DEPLOYMENT.md` for detailed integration steps.

