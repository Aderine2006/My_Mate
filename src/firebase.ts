import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

/**
 * Firebase Configuration
 * 
 * Database URL Explanation:
 * - databaseURL is ONLY needed if you're using Firebase Realtime Database
 * - For Firestore (which this project uses), databaseURL is NOT required
 * - Format: https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com
 * 
 * Current Setup:
 * - ✅ Using Firestore (No databaseURL needed)
 * - ✅ Using Firebase Authentication
 * - ❌ Not using Realtime Database (databaseURL optional)
 * 
 * To find your config: Firebase Console → Project Settings → Your apps → Web app
 */
const firebaseConfig = {
  apiKey: 'AIzaSyDzb4Y2jqeGuC-ym0_u_eKxwsNZeMzJsok',
  authDomain: 'mymate-2487.firebaseapp.com',
  projectId: 'mymate-2487',
  storageBucket: 'mymate-2487.appspot.com',
  messagingSenderId: '252566323457',
  appId: '1:252566323457:web:a2d9edf540286543cddb00',
  databaseURL: 'https://mymate-2487-default-rtdb.firebaseio.com', // Optional: Only needed if using Firebase Realtime Database (not Firestore)
  measurementId: 'G-ES7JEJV41F', // Optional: Only needed if using Firebase Analytics
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore (for future real-time sync)
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

export default app;

