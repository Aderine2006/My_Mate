# Project Tech Stack & Architecture Documentation

This document provides a comprehensive overview of the technical stack and architectural decisions for the **MyMate Tracker** project. It is intended for technical interviewers, stakeholders, and developers.

## 1. High-Level Overview
**MyMate Tracker** is a personal productivity and goal-tracking application built as a modern Single Page Application (SPA). It leverages a serverless architecture for backend services and a local-first AI approach for intelligent features.

## 2. Technology Stack

### Frontend Core
*   **Framework**: [React](https://react.dev/) (v18.2.0) - A library for building user interfaces.
*   **Language**: [TypeScript](https://www.typescriptlang.org/) (v5.3.3) - Strongly typed JavaScript for better developer ergonomics and type safety.
*   **Build Tool**: [Vite](https://vitejs.dev/) (v5.0.8) - Next-generation frontend tooling for fast development and optimized builds.

### Styling & UI
*   **Styling Engine**: [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework for rapid UI development and consistent design tokens.
*   **Iconography**: [Lucide React](https://lucide.dev/) - A clean and consistent icon library.
*   **Dark Mode**: Implemented via Tailwind's `dark` class strategy.

### Backend & Infrastructure (BaaS)
The application relies heavily on **Google Firebase** (v12.7.0) for its backend infrastructure:
*   **Authentication**: Firebase Authentication (supporting Google Sign-In and potentially Email/Password) for secure user identity management.
*   **Database**: Cloud Firestore - A NoSQL, real-time database used for storing all user data (Goals, Sketches, Tasks, etc.).
*   **Hosting**: Firebase Hosting (implied by configuration) for fast and secure content delivery.

### Artificial Intelligence
*   **Local LLM Integration**: [Ollama](https://ollama.ai/) - The project integrates with local Large Language Models (LLMs) via a custom `ollama.ts` service, likely for generating personalized content, insights, or chatbot interactions without sending data to external AI APIs.

## 3. Architecture

### Architectural Pattern: Monolithic Component with State-Based Routing
Currently, the application follows a **Monolithic Component Architecture** centered around the main `MYMate` component.
*   **Single Entry Point**: The core logic resides in `src/mymate-tracker.tsx`, which serves as the central hub for state, logic, and view orchestration.
*   **Routing**: Unlike traditional SPAs that use `react-router`, this application uses **Conditional Rendering** based on local React state (`activeTab`) to switch between views (Dashboard, Goals, Schedule, etc.).

### State Management
*   **Local State**: The application primarily uses React's built-in `useState` hook for managing local UI state and form data.
*   **Data Synchronization**: It utilizes `useEffect` hooks to set up real-time listeners (`onSnapshot`) with Firestore. This ensures that the local state acts as a reactive mirror of the database, providing instant updates across devices.

### Data Flow & Persistence
1.  **Read**: The app subscribes to Firestore collections (`goals`, `skills`, `timeLogs`, etc.) on mount. Changes in the database automatically trigger React state updates.
2.  **Write**: User actions (add/edit/delete) directly invoke Firestore SDK functions (`addDoc`, `updateDoc`, `deleteDoc`).
3.  **Migration**: The app includes specific logic to migrate legacy data from `localStorage` to Firestore, ensuring users moving from a previous offline-only version retain their data.

## 4. Key Architectural Decisions

*   **Real-Time by Default**: Choosing Firestore allows the app to be real-time out of the box. Updates made on a mobile device immediately reflect on the desktop view without manual refreshing.
*   **Privacy-First AI**: Integrating with Ollama suggests a strong preference for data privacy, allowing users to leverage AI features locally without their sensitive query data leaving their machine.
*   **Utility-First Styling**: Tailwind CSS was chosen to streamline the styling process, handle dark mode effortlessly, and ensure a responsive design without the overhead of writing custom CSS files.

## 5. Directory Structure
```
src/
├── main.tsx             # Application Entry Point
├── mymate-tracker.tsx   # Core Application Logic & Views (The "God Component")
├── firebase.ts          # Firebase Configuration & Initialization
├── ollama.ts            # Service layer for Local LLM interaction
└── components/          # (Planned/Partial) Shared UI components
```
