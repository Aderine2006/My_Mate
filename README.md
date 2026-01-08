# MYMate - Career Tracker

A modern, beautiful career tracking web application built with React, TypeScript, and Tailwind CSS.

## Features

- **Dashboard**: Overview of your career progress with key metrics
- **Goals Management**: Track and manage your career goals with categories and target dates
- **Skills Development**: Monitor your skill levels and hours invested
- **Time Logs**: Log and track time spent on learning and projects
- **Achievements**: Celebrate and document your career milestones
- **Data Export**: Export all your data as JSON for backup

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Lucide React** - Icon library
- **LocalStorage** - Data persistence

## Getting Started

### Prerequisites

- Node.js 16+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

## Usage

1. **Login/Signup**: Use any email and password (mock authentication)
2. **Add Goals**: Set career goals with descriptions, categories, and target dates
3. **Track Skills**: Add skills with proficiency levels and hours invested
4. **Log Time**: Record time spent on activities
5. **Record Achievements**: Document your career milestones
6. **Export Data**: Download your data as JSON for backup

## Data Storage

All data is stored in browser's LocalStorage, so it persists between sessions.

## Project Structure

```
MYMate/
├── src/
│   ├── mymate-tracker.tsx    # Main component
│   ├── main.tsx               # Entry point
│   └── vite-env.d.ts          # Vite types
├── index.html                 # HTML template
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
├── vite.config.ts             # Vite config
└── README.md                  # This file
```

## Firebase Deployment

To deploy this app to Firebase Hosting with real-time Firestore support:

### Quick Deploy
1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Initialize: `firebase init` (select Hosting and Firestore)
4. Build: `npm run build`
5. Deploy: `firebase deploy`

See `DEPLOYMENT_STEPS.md` for a quick guide or `FIREBASE_DEPLOYMENT.md` for detailed instructions.

### Real-time Sync
For real-time Firestore synchronization:
1. Install Firebase: `npm install firebase`
2. Create `src/firebase.ts` with your Firebase config (see `src/firebase.ts.example`)
3. Update code to use Firestore instead of localStorage
4. Enable Firestore in Firebase Console
5. Configure security rules

## License

MIT

