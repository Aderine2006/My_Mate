import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile } from 'firebase/auth';
import { auth } from './firebase';
import { generateOllamaResponse, checkOllamaConnection, type UserContext } from './ollama';
import { saveToFirestore, loadFromFirestore, migrateLocalStorageToFirestore, hasUserMigrated } from './firestore-helpers';
import { Plus, Target, Clock, TrendingUp, BookOpen, Download, Menu, X, CheckCircle, Edit2, Trash2, Save, Calendar, Video, Image, FileText, Play, Flame, ListTodo, BarChart3, StickyNote, MessageCircle, Send, Bot, Wifi, WifiOff, User, Moon, Sun, Wallet, ChevronRight, Check, ArrowRight } from 'lucide-react';
import BudgetPlanner from './components/BudgetPlanner';
import SkillsTracker from './components/skills/SkillsTracker';
import ProfileDashboard from './components/profile/ProfileDashboard';
import type { SkillTopic } from './types/skill';
import CelebrationOverlay, { MicroCheck, type CelebrationScenario, type CelebrationStats } from './components/CelebrationOverlay';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Goal {
  id: number;
  title: string;
  description: string;
  category: string;
  targetDate: string;
  status: string;
  createdAt?: string;
  progress?: number;
}

interface Skill {
  id: number;
  name: string;
  level: string;
  hoursInvested: number;
  targetHours: number;
}

interface DeadlinePlan {
  id: number;
  title: string;
  description: string;
  deadline: string; // ISO Date string
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed' | 'overdue';
  reminderTime: string; // ISO Date string
  notificationSent: boolean;
}

interface Content {
  id: number;
  title: string;
  type: 'youtube' | 'instagram' | 'script' | 'roadmap';
  platform: string;
  script: string;
  status: 'draft' | 'in-progress' | 'completed' | 'published';
  publishDate: string;
  targetDate: string;
  tags: string[];
  notes: string;
  createdAt?: string;
}

interface StreakData {
  lastVisitDate: string;
  visitDates: string[];
  currentStreak: number;
  longestStreak: number;
}

interface ScheduleTask {
  id: number;
  title: string;
  description: string;
  time: string; // Format: "HH:MM"
  dayOfWeek: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  priority: 'low' | 'medium' | 'high';
  category: string;
  estimatedDuration: number; // in minutes
  createdAt: string;
}

interface DailyTask {
  id: number;
  scheduleTaskId: number;
  title: string;
  description: string;
  time: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  completedAt?: string;
  missed: boolean;
  priority: 'low' | 'medium' | 'high';
  category: string;
}

interface ManualNote {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: number;
  text: string;
  isUser: boolean;
  timestamp: string;
}



class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
          <div className="bg-white p-8  shadow-xl max-w-lg w-full">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
            <p className="text-[#172554] mb-4">The application encountered an error. Please try refreshing the page.</p>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-60 text-red-800">
              {this.state.error?.toString()}
            </pre>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="mt-6 w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 transition-colors"
            >
              Clear Data & Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const MYMate = () => {
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('mymate-active-tab');
    return ['dashboard', 'schedule', 'goals', 'skills', 'profile', 'planner', 'budget', 'content', 'notes', 'analysis'].includes(savedTab ?? '') ? savedTab as string : 'dashboard';
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches);

  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });

  // Smooth gliding indicator for left sidebar navigation
  const sidebarNavContainerRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [navIndicator, setNavIndicator] = useState<{ top: number; height: number; left: number; width: number; opacity: number }>({
    top: 0,
    height: 40,
    left: 12,
    width: 0,
    opacity: 0,
  });

  const updateNavIndicator = useCallback(() => {
    const container = sidebarNavContainerRef.current;
    const currentBtn = tabButtonRefs.current[activeTab];
    if (!container || !currentBtn) {
      setNavIndicator(prev => ({ ...prev, opacity: 0 }));
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const btnRect = currentBtn.getBoundingClientRect();
    if (btnRect.width === 0 || btnRect.height === 0) {
      return;
    }
    setNavIndicator({
      top: btnRect.top - containerRect.top + container.scrollTop,
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
      height: btnRect.height,
      opacity: 1,
    });
  }, [activeTab]);

  useLayoutEffect(() => {
    // Initial immediate update
    updateNavIndicator();

    // In case fonts, CSS layout, or auth transitions take a frame or two
    const r1 = requestAnimationFrame(updateNavIndicator);
    const r2 = requestAnimationFrame(() => {
      requestAnimationFrame(updateNavIndicator);
    });
    const t1 = setTimeout(updateNavIndicator, 50);
    const t2 = setTimeout(updateNavIndicator, 200);

    const handleResize = () => updateNavIndicator();
    window.addEventListener('resize', handleResize);

    // Also observe container resize if supported
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && sidebarNavContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateNavIndicator();
      });
      resizeObserver.observe(sidebarNavContainerRef.current);
    }

    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [activeTab, sidebarOpen, showAuth, updateNavIndicator]);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<number | null>(null);
  const [goalForm, setGoalForm] = useState({ title: '', description: '', category: 'career', targetDate: '', status: 'in-progress' });
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillTopics, setSkillTopics] = useState<SkillTopic[]>([]);

  const [deadlinePlans, setDeadlinePlans] = useState<DeadlinePlan[]>([]);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<number | null>(null);
  const [planForm, setPlanForm] = useState({
    title: '',
    description: '',
    deadline: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    reminderOffset: '15' // minutes before
  });
  const [contents, setContents] = useState<Content[]>([]);
  const [showContentForm, setShowContentForm] = useState(false);
  const [editingContent, setEditingContent] = useState<number | null>(null);
  const [contentForm, setContentForm] = useState({ title: '', type: 'youtube' as 'youtube' | 'instagram' | 'script' | 'roadmap', platform: 'youtube', script: '', status: 'draft' as 'draft' | 'in-progress' | 'completed' | 'published', publishDate: '', targetDate: '', tags: '', notes: '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakData>({ lastVisitDate: '', visitDates: [], currentStreak: 0, longestStreak: 0 });
  const [scheduleTasks, setScheduleTasks] = useState<ScheduleTask[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<number | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ title: '', description: '', time: '', dayOfWeek: [] as number[], priority: 'medium' as 'low' | 'medium' | 'high', category: 'general', estimatedDuration: '30' });
  const [manualNotes, setManualNotes] = useState<ManualNote[]>([]);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteForm, setNoteForm] = useState({ title: '', content: '', category: 'general', tags: '' });
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('mymate-theme');
    return savedTheme === 'dark' ? 'dark' : 'light';
  });
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationScenario, setCelebrationScenario] = useState<CelebrationScenario>('all_tasks_complete');
  const [celebrationStats, setCelebrationStats] = useState<CelebrationStats>({ completedCount: 0, totalCount: 0, completionPct: 0 });
  const [celebrationAnimKey, setCelebrationAnimKey] = useState(0);
  // Micro-check (single task) toast state
  const [showMicroCheck, setShowMicroCheck] = useState(false);
  const microCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dedup guard: stores the date for which we last fired the full celebration
  const celebratedDateRef = useRef<string>('');
  const [currentDate, setCurrentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Helper function to clear all data state
  const clearAllData = () => {
    setGoals([]);
    setSkills([]);
    setSkillTopics([]);
    setDeadlinePlans([]);
    setContents([]);
    setStreak({ lastVisitDate: '', visitDates: [], currentStreak: 0, longestStreak: 0 });
    setScheduleTasks([]);
    setDailyTasks([]);
    setManualNotes([]);
  };

  // Get today's date in YYYY-MM-DD format (Local Time)
  const getTodayDate = (): string => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateDDMMYYYY = (dateString: string): string => {
    const [year, month, day] = dateString.split('-');
    return `${day}-${month}-${year}`;
  };

  const formatTime12Hour = (time24: string): string => {
    if (!time24 || time24 === '') return '';
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours, 10);
    const minute = minutes || '00';

    if (isNaN(hour)) return time24; // Return original if invalid

    let hour12: number;
    let period: string;

    if (hour === 0) {
      hour12 = 12;
      period = 'AM';
    } else if (hour === 12) {
      hour12 = 12;
      period = 'PM';
    } else if (hour < 12) {
      hour12 = hour;
      period = 'AM';
    } else {
      hour12 = hour - 12;
      period = 'PM';
    }

    return `${hour12}:${minute} ${period}`;
  };

  // Convert 24-hour time to 12-hour components
  const parseTime24To12 = (time24: string): { hour: number; minute: string; period: 'AM' | 'PM' } => {
    if (!time24 || time24 === '') return { hour: 12, minute: '00', period: 'AM' };
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours, 10);
    const minute = minutes || '00';

    if (isNaN(hour)) return { hour: 12, minute: '00', period: 'AM' };

    if (hour === 0) {
      return { hour: 12, minute, period: 'AM' };
    } else if (hour === 12) {
      return { hour: 12, minute, period: 'PM' };
    } else if (hour < 12) {
      return { hour, minute, period: 'AM' };
    } else {
      return { hour: hour - 12, minute, period: 'PM' };
    }
  };

  // Convert 12-hour components to 24-hour time
  const convert12To24 = (hour12: number, minute: string, period: 'AM' | 'PM'): string => {
    let hour24: number;

    if (period === 'AM') {
      if (hour12 === 12) {
        hour24 = 0;
      } else {
        hour24 = hour12;
      }
    } else {
      if (hour12 === 12) {
        hour24 = 12;
      } else {
        hour24 = hour12 + 12;
      }
    }

    return `${hour24.toString().padStart(2, '0')}:${minute.padStart(2, '0')}`;
  };

  // Calculate streak from visit dates
  const calculateStreak = (visitDates: string[]): number => {
    if (!visitDates || visitDates.length === 0) return 0;

    const today = getTodayDate();
    const sortedUniqueDates = Array.from(new Set(visitDates)).sort().reverse();

    if (sortedUniqueDates.length === 0) return 0;

    let streak = 0;
    // Check if the most recent visit is today or yesterday to start the streak
    const lastVisit = sortedUniqueDates[0];

    // Create Date objects for comparison to handle month/year boundaries correctly
    const todayDate = new Date(today);
    const lastVisitDate = new Date(lastVisit);

    // Calculate difference in days
    const diffTime = Math.abs(todayDate.getTime() - lastVisitDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // If last visit was more than 1 day ago (not today [0] and not yesterday [1]), streak is broken/0
    // But we might want to calculate the *active* streak up to that point? 
    // Usually "current streak" implies it must be active. 
    // If the user missed yesterday, correct streak is 0.
    if (diffDays > 1) {
      return 0;
    }

    // Now count consecutive days backwards
    let currentDate = new Date(lastVisit);

    for (const visitDateStr of sortedUniqueDates) {
      const visitDate = new Date(visitDateStr);

      // Compare with expected date
      if (visitDate.getTime() === currentDate.getTime()) {
        streak++;
        // Move expected date back by one day
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        // Gap found
        break;
      }
    }

    return streak;
  };

  // Track daily visit and update streak
  const updateStreak = () => {
    if (!user) return;

    const today = getTodayDate();
    const streakData = localStorage.getItem(`streak-${user.id}`);
    let streak: StreakData;

    if (streakData) {
      streak = JSON.parse(streakData);
    } else {
      streak = { lastVisitDate: '', visitDates: [], currentStreak: 0, longestStreak: 0 };
    }

    // Update visit dates
    if (!streak.visitDates.includes(today)) {
      streak.visitDates.push(today);
      // Keep only unique dates and sort
      streak.visitDates = Array.from(new Set(streak.visitDates)).sort();
    }

    // Update last visit date
    streak.lastVisitDate = today;

    // Calculate current streak
    streak.currentStreak = calculateStreak(streak.visitDates);

    // Update longest streak if current is longer
    if (streak.currentStreak > streak.longestStreak) {
      streak.longestStreak = streak.currentStreak;
    }

    // Save to localStorage
    localStorage.setItem(`streak-${user.id}`, JSON.stringify(streak));
    setStreak(streak);
  };

  // Load streak data
  const loadStreak = () => {
    if (!user) {
      setStreak({ lastVisitDate: '', visitDates: [], currentStreak: 0, longestStreak: 0 });
      return;
    }

    try {
      const streakData = localStorage.getItem(`streak-${user.id}`);
      if (streakData) {
        const parsed = JSON.parse(streakData);
        // Recalculate streak to handle timezone/day changes
        parsed.currentStreak = calculateStreak(parsed.visitDates);
        setStreak(parsed);
        updateStreak(); // Update streak on load
      } else {
        updateStreak(); // Initialize streak for new user
      }
    } catch (error) {
      console.error('Error loading streak:', error);
      updateStreak();
    }
  };

  // Load user data from Firestore (with localStorage fallback)
  const loadData = async () => {
    if (!user) {
      clearAllData();
      return;
    }
    try {
      // Reset all arrays first to prevent showing previous user's data
      clearAllData();

      // Check if user needs to migrate from localStorage
      if (!hasUserMigrated(user.id)) {
        const hasLocalData = localStorage.getItem(`goals-${user.id}`) ||
          localStorage.getItem(`skills-${user.id}`) ||
          localStorage.getItem(`deadlinePlans-${user.id}`);

        if (hasLocalData) {
          console.log('📦 Migrating data from localStorage to Firestore...');
          await migrateLocalStorageToFirestore(user.id);
          console.log('✅ Migration complete!');
        } else {
          // Mark as migrated even if no data to migrate
          localStorage.setItem(`migrated-to-firestore-${user.id}`, 'true');
        }
      }

      // Load from Firestore
      const [goalsData, skillsData, skillTopicsData, deadlinePlansData, contentsData, scheduleTasksData, dailyTasksData, manualNotesData] = await Promise.all([
        loadFromFirestore(user.id, 'goals'),
        loadFromFirestore(user.id, 'skills'),
        loadFromFirestore(user.id, 'skillTopics'),
        loadFromFirestore(user.id, 'deadlinePlans'),
        loadFromFirestore(user.id, 'contents'),
        loadFromFirestore(user.id, 'scheduleTasks'),
        loadFromFirestore(user.id, 'dailyTasks'),
        loadFromFirestore(user.id, 'manualNotes')
      ]);

      if (goalsData) setGoals(goalsData);
      if (skillsData) setSkills(skillsData);
      if (skillTopicsData) setSkillTopics(skillTopicsData);
      if (deadlinePlansData) setDeadlinePlans(deadlinePlansData);
      if (contentsData) setContents(contentsData);
      if (scheduleTasksData) setScheduleTasks(scheduleTasksData);
      if (dailyTasksData) setDailyTasks(dailyTasksData);
      if (manualNotesData) setManualNotes(manualNotesData);
    } catch (error) {
      console.error('Error loading data from Firestore:', error);

      // Fallback to localStorage if Firestore fails
      try {
        const goalsData = localStorage.getItem(`goals-${user.id}`);
        const skillsData = localStorage.getItem(`skills-${user.id}`);
        const skillTopicsData = localStorage.getItem(`skillTopics-${user.id}`);
        const deadlinePlansData = localStorage.getItem(`deadlinePlans-${user.id}`);
        const contentsData = localStorage.getItem(`contents-${user.id}`);
        const scheduleTasksData = localStorage.getItem(`scheduleTasks-${user.id}`);
        const dailyTasksData = localStorage.getItem(`dailyTasks-${user.id}`);
        const manualNotesData = localStorage.getItem(`manualNotes-${user.id}`);

        if (goalsData) setGoals(JSON.parse(goalsData));
        if (skillsData) setSkills(JSON.parse(skillsData));
        if (skillTopicsData) setSkillTopics(JSON.parse(skillTopicsData));
        if (deadlinePlansData) setDeadlinePlans(JSON.parse(deadlinePlansData));
        if (contentsData) setContents(JSON.parse(contentsData));
        if (scheduleTasksData) setScheduleTasks(JSON.parse(scheduleTasksData));
        if (dailyTasksData) setDailyTasks(JSON.parse(dailyTasksData));
        if (manualNotesData) setManualNotes(JSON.parse(manualNotesData));
      } catch (localError) {
        console.error('Error loading from localStorage:', localError);
        clearAllData();
      }
    }
  };

  // Restore only Firebase-authenticated sessions so Firestore rules can verify ownership.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      if (!firebaseUser) {
        localStorage.removeItem('currentUser');
        setUser(null);
        setShowAuth(true);
        return;
      }

      setUser({
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'MyMate User',
      });
      setShowAuth(false);
    });
    return unsubscribe;
  }, []);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark', 'productive');
    root.classList.add(theme);
    localStorage.setItem('mymate-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('mymate-active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const closeSidebarOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', closeSidebarOnEscape);
    return () => window.removeEventListener('keydown', closeSidebarOnEscape);
  }, []);

  // Check AI service availability on mount
  useEffect(() => {
    let isCurrent = true;
    const checkAIServices = async () => {
      const ollamaStatus = await checkOllamaConnection();
      if (!isCurrent) return;
      setOllamaAvailable(ollamaStatus);
    };
    void checkAIServices();
    return () => { isCurrent = false; };
  }, [user]);

  // Load data when user changes
  useEffect(() => {
    if (user) {
      loadData();
      loadStreak();
    } else {
      // Clear all data when user logs out
      clearAllData();
    }
  }, [user]);

  // Update streak when component mounts or user logs in
  useEffect(() => {
    if (user) {
      updateStreak();
    }
  }, [user]);

  // Generate daily tasks when schedule changes (date changes are handled by currentDate useEffect)
  // Schedule management handlers
  useEffect(() => {
    if (user && scheduleTasks.length > 0 && currentDate) {
      generateDailyTasks(currentDate);
      checkMissedTasks();
      adjustScheduleForMissedTasks();
    }
  }, [scheduleTasks, user, currentDate]);

  // Request notification permission and check for reminders
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }

    const checkReminders = () => {
      const now = new Date();

      const newPlans = deadlinePlans.map(plan => {
        if (!plan.notificationSent && plan.status === 'pending' && plan.reminderTime) {
          const reminderTime = new Date(plan.reminderTime);
          if (now >= reminderTime) {
            // Trigger notification
            if (Notification.permission === 'granted') {
              new Notification(`Reminder: ${plan.title}`, {
                body: `Deadline: ${new Date(plan.deadline).toLocaleString()}`,
                icon: '/favicon.ico' // Assuming a favicon exists or browser default
              });
            }
            return { ...plan, notificationSent: true };
          }
        }
        return plan;
      });

      // Update state if any notification was sent to avoid repeated alerts
      if (JSON.stringify(newPlans) !== JSON.stringify(deadlinePlans)) {
        setDeadlinePlans(newPlans);
        saveData('deadlinePlans', newPlans);
      }
    };

    const intervalId = setInterval(checkReminders, 60000); // Check every minute
    return () => clearInterval(intervalId);
  }, [deadlinePlans]);

  // Schedule management handlers
  const handleAddSchedule = () => {
    if (!scheduleForm.title || scheduleForm.dayOfWeek.length === 0) return;
    const newSchedule: ScheduleTask = {
      id: Date.now(),
      ...scheduleForm,
      estimatedDuration: parseInt(scheduleForm.estimatedDuration) || 30,
      createdAt: new Date().toISOString()
    };
    const updated = [...scheduleTasks, newSchedule];
    setScheduleTasks(updated);
    saveData('scheduleTasks', updated);
    setScheduleForm({ title: '', description: '', time: '', dayOfWeek: [], priority: 'medium', category: 'general', estimatedDuration: '30' });
    setShowScheduleForm(false);
  };

  const handleEditSchedule = (schedule: ScheduleTask) => {
    setEditingSchedule(schedule.id);
    setScheduleForm({
      title: schedule.title,
      description: schedule.description,
      time: schedule.time,
      dayOfWeek: schedule.dayOfWeek,
      priority: schedule.priority,
      category: schedule.category,
      estimatedDuration: schedule.estimatedDuration.toString()
    });
    setShowScheduleForm(true);
  };

  const handleUpdateSchedule = () => {
    const updated = scheduleTasks.map(s =>
      s.id === editingSchedule
        ? { ...s, ...scheduleForm, estimatedDuration: parseInt(scheduleForm.estimatedDuration) || 30 }
        : s
    );
    setScheduleTasks(updated);
    saveData('scheduleTasks', updated);
    setEditingSchedule(null);
    setScheduleForm({ title: '', description: '', time: '', dayOfWeek: [], priority: 'medium', category: 'general', estimatedDuration: '30' });
    setShowScheduleForm(false);
  };

  const handleDeleteSchedule = (id: number) => {
    const updated = scheduleTasks.filter(s => s.id !== id);
    setScheduleTasks(updated);
    saveData('scheduleTasks', updated);
    // Also remove related daily tasks
    const updatedDailyTasks = dailyTasks.filter(dt => dt.scheduleTaskId !== id);
    setDailyTasks(updatedDailyTasks);
    saveData('dailyTasks', updatedDailyTasks);
  };

  // Task completion handler
  const handleToggleTask = (taskId: number) => {
    const updated = dailyTasks.map(task => {
      if (task.id === taskId) {
        return {
          ...task,
          completed: !task.completed,
          completedAt: !task.completed ? new Date().toISOString() : undefined,
          missed: false
        };
      }
      return task;
    });
    setDailyTasks(updated);
    saveData('dailyTasks', updated);

    // Check if all tasks for today are completed
    const today = getTodayDate();
    const todayTasks = updated.filter(task => task.date === today);
    const allCompleted = todayTasks.length > 0 && todayTasks.every(task => task.completed);

    // Only celebrate if a task was just completed (not uncompleted)
    const completedTask = updated.find(task => task.id === taskId);
    if (allCompleted && completedTask?.completed) {
      // Dedup guard: only fire once per calendar day
      if (celebratedDateRef.current === today) return;
      celebratedDateRef.current = today;

      const completedCount = todayTasks.filter(t => t.completed).length;
      const totalCount = todayTasks.length;
      const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      // First task ever = no previously completed tasks in any date
      const allPreviouslyPending = dailyTasks.every(t => !t.completed || t.id === taskId);
      const scenario = allPreviouslyPending ? 'first_ever_task' : 'all_tasks_complete';

      setCelebrationScenario(scenario);
      setCelebrationStats({
        completedCount,
        totalCount,
        completionPct,
        streakDays: streak.currentStreak,
      });
      setCelebrationAnimKey(k => k + 1);
      setShowCelebration(true);
    } else if (completedTask?.completed) {
      // Single task micro-toast
      if (microCheckTimerRef.current) clearTimeout(microCheckTimerRef.current);
      setShowMicroCheck(true);
      microCheckTimerRef.current = setTimeout(() => setShowMicroCheck(false), 2200);
    }
  };



  // Manual Notes handlers
  const handleAddNote = () => {
    if (!noteForm.title) return;
    const tags = noteForm.tags.split(',').map(t => t.trim()).filter(t => t);
    const newNote: ManualNote = {
      id: Date.now(),
      ...noteForm,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [...manualNotes, newNote];
    setManualNotes(updated);
    saveData('manualNotes', updated);
    setNoteForm({ title: '', content: '', category: 'general', tags: '' });
    setShowNoteForm(false);
  };

  const handleEditNote = (note: ManualNote) => {
    setEditingNote(note.id);
    setNoteForm({ ...note, tags: note.tags.join(', ') });
    setShowNoteForm(true);
  };

  const handleUpdateNote = () => {
    const tags = noteForm.tags.split(',').map(t => t.trim()).filter(t => t);
    const updated = manualNotes.map(n =>
      n.id === editingNote ? { ...n, ...noteForm, tags, updatedAt: new Date().toISOString() } : n
    );
    setManualNotes(updated);
    saveData('manualNotes', updated);
    setEditingNote(null);
    setNoteForm({ title: '', content: '', category: 'general', tags: '' });
    setShowNoteForm(false);
  };

  const handleDeleteNote = (id: number) => {
    const updated = manualNotes.filter(n => n.id !== id);
    setManualNotes(updated);
    saveData('manualNotes', updated);
  };

  // Get user context for chatbot understanding
  const getUserContext = (): UserContext => {
    const todayTasks = getTodayTasks();
    const completedGoalsCount = (goals || []).filter(g => g.status === 'completed').length;
    const activeGoalsCount = (goals || []).filter(g => g.status === 'in-progress').length;
    const totalHours = (skills || []).reduce((sum, skill) => sum + skill.hoursInvested, 0);
    const recentNotes = manualNotes.slice(-5);

    return {
      user: user?.name || 'User',
      streak: streak.currentStreak,
      todayTasksCompleted: todayTasks.filter(t => t.completed).length,
      todayTasksTotal: todayTasks.length,
      completionRate: calculatePerfection(),
      completedGoals: completedGoalsCount,
      activeGoals: activeGoalsCount,
      totalSkills: (skills || []).length,
      totalHours,
      recentNotes: (recentNotes || []).map(n => ({ title: n.title, content: n.content.substring(0, 100) })),
      topSkills: (skills || []).slice().sort((a, b) => b.hoursInvested - a.hoursInvested).slice(0, 3)
    };
  };

  // Generate intelligent chatbot response
  const generateChatResponse = (userMessage: string): string => {
    const context = getUserContext();
    const message = userMessage.toLowerCase().trim();

    // Greeting patterns
    if (message.match(/^(hi|hello|hey|greetings|what's up)/)) {
      return `Hello ${context.user}! 👋 I'm your personal assistant. I can help you with:\n\n• Your daily tasks and schedule\n• Goal progress and achievements\n• Skills and learning insights\n• Reflections and notes\n• Performance analysis\n\nWhat would you like to know?`;
    }

    // Task-related queries
    if (message.match(/(task|todo|schedule|what.*do|what.*need)/)) {
      if (context.todayTasksTotal === 0) {
        return `You don't have any tasks scheduled for today. Would you like to add some? You can go to the "Daily Schedule" tab to create recurring tasks. 📋`;
      }
      const remaining = context.todayTasksTotal - context.todayTasksCompleted;
      if (remaining === 0) {
        return `🎉 Great job! You've completed all ${context.todayTasksTotal} tasks for today! Your completion rate is ${context.completionRate}%. Keep up the excellent work!`;
      }
      return `You have ${remaining} task${remaining > 1 ? 's' : ''} remaining out of ${context.todayTasksTotal} today. You've completed ${context.todayTasksCompleted} so far. Your completion rate is ${context.completionRate}%. Would you like me to show your remaining tasks? ✅`;
    }

    // Goal-related queries
    if (message.match(/(goal|progress|achievement|target)/)) {
      if (context.activeGoals === 0 && context.completedGoals === 0) {
        return `You don't have any goals set yet. Setting goals can help you stay focused and motivated! You can add goals in the "Goals" section. 🎯`;
      }
      return `You have ${context.activeGoals} active goal${context.activeGoals !== 1 ? 's' : ''} and ${context.completedGoals} completed goal${context.completedGoals !== 1 ? 's' : ''}. Keep pushing forward! 🏆`;
    }

    // Skills-related queries
    if (message.match(/(skill|learning|study|improve|develop)/)) {
      if (context.totalSkills === 0) {
        return `You haven't added any skills yet. Start tracking your skills development in the "Skills" section! 📚`;
      }
      const topSkill = context.topSkills[0];
      return `You're tracking ${context.totalSkills} skill${context.totalSkills !== 1 ? 's' : ''} and have invested ${context.totalHours.toFixed(1)} hours in learning. Your top skill is ${topSkill.name} (${topSkill.level}) with ${topSkill.hoursInvested} hours. Keep learning! 💪`;
    }

    // Streak-related queries
    if (message.match(/(streak|consistent|daily|habit)/)) {
      if (context.streak === 0) {
        return `Start building your daily streak by visiting MyMate every day! 🔥 Your longest streak so far is ${streak.longestStreak} day${streak.longestStreak !== 1 ? 's' : ''}.`;
      }
      return `You're on a ${context.streak}-day streak! 🔥 That's amazing consistency! Your longest streak is ${streak.longestStreak} day${streak.longestStreak !== 1 ? 's' : ''}. Keep it up!`;
    }



    // Performance/completion queries
    if (message.match(/(performance|progress|how.*doing|completion|perfect)/)) {
      const rate = context.completionRate;
      if (rate >= 90) {
        return `🌟 Outstanding! Your completion rate is ${rate}%! You're doing exceptionally well. Keep maintaining this high performance!`;
      } else if (rate >= 70) {
        return `Great job! Your completion rate is ${rate}%. You're on the right track. A bit more consistency and you'll reach 90%+! 💪`;
      } else if (rate >= 50) {
        return `Your completion rate is ${rate}%. There's room for improvement. Try to focus on completing your daily tasks consistently. You've got this! 📈`;
      } else {
        return `Your completion rate is ${rate}%. Let's work on improving this together! Start by focusing on completing at least one task each day, then gradually increase. Every step counts! 🚀`;
      }
    }

    // Help/What can you do
    if (message.match(/(help|what.*can|what.*do|how.*help|assist)/)) {
      return `I can help you with:\n\n📋 **Tasks & Schedule**: Ask about your daily tasks or schedule\n🎯 **Goals**: Get updates on your goals and progress\n📚 **Skills**: Learn about your skills development\n🔥 **Streak**: Check your daily streak\n📊 **Performance**: Get insights on your completion rate\n\nJust ask me anything about your progress!`;
    }

    // Notes-related queries
    if (message.match(/(note|remember|idea|thought)/)) {
      if (context.recentNotes.length === 0) {
        return `You don't have any notes yet. Start capturing your ideas in the "Manual Notes" section! 💡`;
      }
      return `You have ${manualNotes.length} note${manualNotes.length !== 1 ? 's' : ''} saved. Recent notes:\n${context.recentNotes.map(n => `• ${n.title}`).join('\n')}\n\nCheck the "Manual Notes" tab to view all your notes! 📝`;
    }

    // Default response
    return `I understand you're asking about "${userMessage}". Based on your data:\n\n• ${context.todayTasksCompleted}/${context.todayTasksTotal} tasks completed today\n• ${context.completionRate}% completion rate\n• ${context.streak}-day streak\n• ${context.activeGoals} active goals\n\nHow can I help you improve or organize better? Ask me about your tasks, goals, or skills! 💬`;
  };

  // Handle chat message send
  const handleSendMessage = async () => {
    if (!chatInput.trim() || isLoadingResponse) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      text: chatInput.trim(),
      isUser: true,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMessage]);
    const messageText = chatInput.trim();
    setChatInput('');
    setIsLoadingResponse(true);

    // Add loading indicator
    const loadingMessageId = Date.now() + 1;
    const loadingMessage: ChatMessage = {
      id: loadingMessageId,
      text: 'Thinking...',
      isUser: false,
      timestamp: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, loadingMessage]);

    try {
      let botResponseText: string;
      if (ollamaAvailable) {
        try {
          botResponseText = await generateOllamaResponse(messageText, getUserContext());
        } catch (ollamaError) {
          console.error('Ollama error, falling back to rule-based:', ollamaError);
          botResponseText = generateChatResponse(messageText);
        }
      } else {
        botResponseText = generateChatResponse(messageText);
      }

      // Remove loading message and add actual response
      setChatMessages(prev => {
        const withoutLoading = prev.filter(msg => msg.id !== loadingMessageId);
        return [...withoutLoading, {
          id: Date.now() + 2,
          text: botResponseText,
          isUser: false,
          timestamp: new Date().toISOString()
        }];
      });
    } catch (error) {
      console.error('Error generating response:', error);
      // Remove loading message and add error response
      setChatMessages(prev => {
        const withoutLoading = prev.filter(msg => msg.id !== loadingMessageId);
        return [...withoutLoading, {
          id: Date.now() + 2,
          text: 'Sorry, I encountered an error. Please try again or use the rule-based responses.',
          isUser: false,
          timestamp: new Date().toISOString()
        }];
      });
    } finally {
      setIsLoadingResponse(false);
    }
  };

  // Check Ollama connection when chatbot opens
  useEffect(() => {
    if (chatbotOpen && user) {
      checkOllamaConnection().then(available => {
        setOllamaAvailable(available);
      });
    }
  }, [chatbotOpen, user]);

  // Initialize chat with welcome message
  useEffect(() => {
    if (chatbotOpen && chatMessages.length === 0 && user) {
      const aiMode = ollamaAvailable ? 'I\'m powered by AI (Ollama) to provide intelligent, personalized responses based on all your data.' : 'I\'m in basic mode. To enable AI-powered responses, make sure Ollama is running on your machine.';

      const welcomeMessage: ChatMessage = {
        id: Date.now(),
        text: `Hello ${user.name}! 👋 I'm your personal MyMate assistant. ${aiMode}\n\nI understand your:\n• Goals\n• Skills & Learning Progress\n• Notes & Journal Entries\n• Habits & Performance\n\nI can help you:\n• Track your daily progress\n• Understand your performance patterns\n• Get personalized insights\n• Set and achieve goals\n\nWhat would you like to know?`,
        isUser: false,
        timestamp: new Date().toISOString()
      };
      setChatMessages([welcomeMessage]);
    }
  }, [chatbotOpen, user, ollamaAvailable]);

  const saveData = async (key: string, data: Goal[] | Skill[] | SkillTopic[] | DeadlinePlan[] | Content[] | ScheduleTask[] | DailyTask[] | ManualNote[]) => {
    if (!user) return;
    try {
      // Save to Firestore
      await saveToFirestore(user.id, key as any, data);
      // Also keep in localStorage as backup for offline use
      localStorage.setItem(`${key}-${user.id}`, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving data:', error);
      // If Firestore fails, at least save to localStorage
      try {
        localStorage.setItem(`${key}-${user.id}`, JSON.stringify(data));
      } catch (localError) {
        console.error('Error saving to localStorage:', localError);
      }
    }
  };

  // Generate / sync daily tasks from schedule for a specific date
  const generateDailyTasks = (date: string) => {
    setDailyTasks(prevTasks => {
      const dayOfWeek = new Date(date).getDay();

      // Start from existing tasks so we can update them in place
      let updatedTasks: DailyTask[] = [...prevTasks];
      let hasChanges = false;

      scheduleTasks.forEach(scheduleTask => {
        // Check if this task should occur on this day of week
        if (scheduleTask.dayOfWeek.includes(dayOfWeek)) {
          // Try to find an existing daily task for this schedule + date
          const existingIndex = updatedTasks.findIndex(
            dt => dt.scheduleTaskId === scheduleTask.id && dt.date === date
          );

          if (existingIndex === -1) {
            // Create a new daily task if it doesn't exist yet
            hasChanges = true;
            updatedTasks.push({
              id: Date.now() + Math.random(),
              scheduleTaskId: scheduleTask.id,
              title: scheduleTask.title,
              description: scheduleTask.description,
              time: scheduleTask.time,
              date: date,
              completed: false,
              missed: false,
              priority: scheduleTask.priority,
              category: scheduleTask.category
            });
          } else {
            // Sync existing daily task with the latest schedule details
            const existingTask = updatedTasks[existingIndex];
            const updatedTask = {
              ...existingTask,
              title: scheduleTask.title,
              description: scheduleTask.description,
              time: scheduleTask.time,
              priority: scheduleTask.priority,
              category: scheduleTask.category
            };
            if (JSON.stringify(existingTask) !== JSON.stringify(updatedTask)) {
              hasChanges = true;
              updatedTasks[existingIndex] = updatedTask;
            }
          }
        }
      });

      // Persist only if something actually changed
      if (hasChanges) {
        saveData('dailyTasks', updatedTasks);
        return updatedTasks;
      }
      return prevTasks;
    });
  };

  // Check and mark missed tasks for past dates
  const checkMissedTasks = () => {
    const today = getTodayDate();
    setDailyTasks(prevTasks => {
      const updatedTasks = prevTasks.map(task => {
        if (!task.completed && task.date < today && !task.missed) {
          return { ...task, missed: true };
        }
        return task;
      });

      if (JSON.stringify(updatedTasks) !== JSON.stringify(prevTasks)) {
        saveData('dailyTasks', updatedTasks);
        return updatedTasks;
      }
      return prevTasks;
    });
  };

  // Adjust schedule based on missed tasks
  const adjustScheduleForMissedTasks = () => {
    const today = getTodayDate();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    setDailyTasks(prevTasks => {
      // Find missed tasks from yesterday
      const missedTasks = prevTasks.filter(
        task => task.date === yesterdayStr && task.missed && !task.completed
      );

      if (missedTasks.length > 0) {
        // For each missed task, add it to today's schedule
        const newTasks: DailyTask[] = [];
        missedTasks.forEach(missedTask => {
          const scheduleTask = scheduleTasks.find(st => st.id === missedTask.scheduleTaskId);
          if (scheduleTask) {
            // Check if task already exists for today
            const existingToday = prevTasks.find(
              dt => dt.scheduleTaskId === scheduleTask.id && dt.date === today
            );

            if (!existingToday) {
              newTasks.push({
                id: Date.now() + Math.random(),
                scheduleTaskId: scheduleTask.id,
                title: scheduleTask.title,
                description: scheduleTask.description,
                time: scheduleTask.time,
                date: today,
                completed: false,
                missed: false,
                priority: scheduleTask.priority,
                category: scheduleTask.category
              });
            }
          }
        });

        if (newTasks.length > 0) {
          const updatedTasks = [...prevTasks, ...newTasks];
          saveData('dailyTasks', updatedTasks);
          return updatedTasks;
        }
      }
      return prevTasks;
    });
  };

  // Calculate perfection percentage
  const calculatePerfection = (): number => {
    const today = getTodayDate();
    const last7Days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().split('T')[0]);
    }

    const tasksInPeriod = dailyTasks.filter(task => last7Days.includes(task.date));
    if (tasksInPeriod.length === 0) return 100;

    const completed = tasksInPeriod.filter(task => task.completed).length;
    return Math.round((completed / tasksInPeriod.length) * 100);
  };

  // Calculate today's completion % for all tasks of the day
  const calculateTodayCompletion = (): number => {
    const todayTasks = getTodayTasks();
    if (todayTasks.length === 0) return 0;
    const completed = todayTasks.filter(task => task.completed).length;
    return Math.round((completed / todayTasks.length) * 100);
  };

  // Get today's completion stats (completed count, total count)
  const getTodayCompletionStats = () => {
    const todayTasks = getTodayTasks();
    const completed = todayTasks.filter(task => task.completed).length;
    const total = todayTasks.length;
    return { completed, total };
  };

  // Get today's tasks
  const getTodayTasks = (): DailyTask[] => {
    const today = currentDate || getTodayDate();
    return dailyTasks
      .filter(task => task.date === today)
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const email = authForm.email.trim();
      const credential = authMode === 'signup'
        ? await createUserWithEmailAndPassword(auth, email, authForm.password)
        : await signInWithEmailAndPassword(auth, email, authForm.password);

      if (authMode === 'signup' && authForm.name.trim()) {
        await updateProfile(credential.user, { displayName: authForm.name.trim() });
      }

      setUser({
        id: credential.user.uid,
        email: credential.user.email || email,
        name: credential.user.displayName || authForm.name.trim() || email.split('@')[0],
      });
      setShowAuth(false);
    } catch (error) {
      const code = (error as { code?: string }).code;
      const messages: Record<string, string> = {
        'auth/operation-not-allowed': 'Enable Email/Password sign-in in Firebase Authentication settings, then try again.',
        'auth/email-already-in-use': 'An account already exists for this email. Log in instead.',
        'auth/invalid-credential': 'Email or password is incorrect.',
        'auth/weak-password': 'Choose a password with at least 6 characters.',
        'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
      };
      setAuthError(messages[code || ''] || 'Authentication failed. Check your connection and try again.');
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setAuthError(null);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;

      const appUser: User = {
        id: fbUser.uid,
        email: fbUser.email || '',
        name: fbUser.displayName || 'Career Tracker',
      };

      setUser(appUser);
      setShowAuth(false);
    } catch (error) {
      console.error('Google sign-in error:', error);
      setAuthError(error instanceof Error ? error.message : 'Failed to sign in with Google. Please try again.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('currentUser');
    setUser(null);
    setShowAuth(true);
    setAuthForm({ email: '', password: '', name: '' });
    // Clear all data state
    clearAllData();
  };

  const handleAddGoal = () => {
    if (!goalForm.title) return;
    const newGoal: Goal = { id: Date.now(), ...goalForm, createdAt: new Date().toISOString(), progress: 0 };
    const updatedGoals = [...goals, newGoal];
    setGoals(updatedGoals);
    saveData('goals', updatedGoals);
    setGoalForm({ title: '', description: '', category: 'career', targetDate: '', status: 'in-progress' });
    setShowGoalForm(false);
  };

  const handleEditGoal = (goal: Goal) => {
    setEditingGoal(goal.id);
    setGoalForm(goal);
    setShowGoalForm(true);
  };

  const handleUpdateGoal = () => {
    const updatedGoals = goals.map(g => g.id === editingGoal ? { ...goalForm, id: g.id, createdAt: g.createdAt } : g);
    setGoals(updatedGoals);
    saveData('goals', updatedGoals);
    setEditingGoal(null);
    setGoalForm({ title: '', description: '', category: 'career', targetDate: '', status: 'in-progress' });
    setShowGoalForm(false);
  };

  const handleDeleteGoal = (id: number) => {
    const updatedGoals = goals.filter(g => g.id !== id);
    setGoals(updatedGoals);
    saveData('goals', updatedGoals);
  };

  const toggleGoalStatus = (id: number) => {
    const updatedGoals = goals.map(g => g.id === id ? { ...g, status: g.status === 'completed' ? 'in-progress' : 'completed' } : g);
    setGoals(updatedGoals);
    saveData('goals', updatedGoals);
  };

  const handleAddPlan = () => {
    if (!planForm.title || !planForm.deadline) return;

    // Calculate reminder time
    const deadlineDate = new Date(planForm.deadline);
    const reminderDate = new Date(deadlineDate.getTime() - parseInt(planForm.reminderOffset) * 60000);

    const newPlan: DeadlinePlan = {
      id: Date.now(),
      title: planForm.title,
      description: planForm.description,
      deadline: planForm.deadline,
      priority: planForm.priority,
      status: 'pending',
      reminderTime: reminderDate.toISOString(),
      notificationSent: false
    };

    const updated = [...deadlinePlans, newPlan];
    setDeadlinePlans(updated);
    saveData('deadlinePlans', updated);
    setPlanForm({ title: '', description: '', deadline: '', priority: 'medium', reminderOffset: '15' });
    setShowPlanForm(false);
  };

  const handleDeletePlan = (id: number) => {
    const updated = deadlinePlans.filter(p => p.id !== id);
    setDeadlinePlans(updated);
    saveData('deadlinePlans', updated);
  };

  const handleTogglePlan = (id: number) => {
    const updated = deadlinePlans.map(p =>
      p.id === id ? { ...p, status: p.status === 'completed' ? 'pending' : 'completed' as 'pending' | 'completed' | 'overdue' } : p
    );
    setDeadlinePlans(updated);
    saveData('deadlinePlans', updated);
  };

  const handleEditPlan = (plan: DeadlinePlan) => {
    setEditingPlan(plan.id);
    let reminderOffset = '15';
    if (plan.reminderTime && plan.deadline) {
      const diffMs = new Date(plan.deadline).getTime() - new Date(plan.reminderTime).getTime();
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins === 60 || diffMins === 1440 || diffMins === 15) {
        reminderOffset = diffMins.toString();
      }
    }
    let formattedDeadline = plan.deadline;
    try {
      const d = new Date(plan.deadline);
      if (!isNaN(d.getTime())) {
        const offset = d.getTimezoneOffset() * 60000;
        formattedDeadline = new Date(d.getTime() - offset).toISOString().slice(0, 16);
      }
    } catch (e) { }

    setPlanForm({
      title: plan.title,
      description: plan.description || '',
      deadline: formattedDeadline,
      priority: plan.priority,
      reminderOffset
    });
    setShowPlanForm(true);
  };

  const handleUpdatePlan = () => {
    if (!planForm.title || !planForm.deadline || editingPlan === null) return;
    const deadlineDate = new Date(planForm.deadline);
    const reminderDate = new Date(deadlineDate.getTime() - parseInt(planForm.reminderOffset) * 60000);

    const updated = deadlinePlans.map(p => {
      if (p.id === editingPlan) {
        return {
          ...p,
          title: planForm.title,
          description: planForm.description,
          deadline: planForm.deadline,
          priority: planForm.priority,
          reminderTime: reminderDate.toISOString(),
          notificationSent: false
        };
      }
      return p;
    });

    setDeadlinePlans(updated);
    saveData('deadlinePlans', updated);
    setEditingPlan(null);
    setPlanForm({ title: '', description: '', deadline: '', priority: 'medium', reminderOffset: '15' });
    setShowPlanForm(false);
  };



  const handleAddContent = () => {
    if (!contentForm.title) return;
    const tags = contentForm.tags.split(',').map(t => t.trim()).filter(t => t);
    const newContent: Content = {
      id: Date.now(),
      ...contentForm,
      tags,
      platform: contentForm.type === 'youtube' ? 'youtube' : contentForm.type === 'instagram' ? 'instagram' : 'general',
      createdAt: new Date().toISOString()
    };
    const updatedContents = [...contents, newContent];
    setContents(updatedContents);
    saveData('contents', updatedContents);
    setContentForm({ title: '', type: 'youtube', platform: 'youtube', script: '', status: 'draft', publishDate: '', targetDate: '', tags: '', notes: '' });
    setShowContentForm(false);
  };

  const handleEditContent = (content: Content) => {
    setEditingContent(content.id);
    setContentForm({ ...content, tags: content.tags.join(', ') });
    setShowContentForm(true);
  };

  const handleUpdateContent = () => {
    const tags = contentForm.tags.split(',').map(t => t.trim()).filter(t => t);
    const updatedContents = contents.map(c =>
      c.id === editingContent
        ? { ...contentForm, id: c.id, tags, createdAt: c.createdAt }
        : c
    );
    setContents(updatedContents);
    saveData('contents', updatedContents);
    setEditingContent(null);
    setContentForm({ title: '', type: 'youtube', platform: 'youtube', script: '', status: 'draft', publishDate: '', targetDate: '', tags: '', notes: '' });
    setShowContentForm(false);
  };

  const handleDeleteContent = (id: number) => {
    const updatedContents = contents.filter(c => c.id !== id);
    setContents(updatedContents);
    saveData('contents', updatedContents);
  };

  const handleExport = () => {
    const data = { goals, skills, deadlinePlans, contents, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mymate-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const getDaysRemainingInYear = () => {
    const now = new Date();
    const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    const diff = endOfYear.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  const getTimeRemainingInDay = () => {
    const now = currentTime;
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const diff = endOfDay.getTime() - now.getTime();

    if (diff <= 0) {
      return { hours: 0, minutes: 0, seconds: 0 };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { hours, minutes, seconds };
  };

  useEffect(() => {
    // Initialize currentDate on mount
    setCurrentDate(getTodayDate());

    // Realtime clock updater and date change detector
    const intervalId = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      // Check if date has changed
      const today = getTodayDate();
      setCurrentDate(prevDate => {
        if (today !== prevDate) {
          // Date has changed - this will trigger the date change useEffect
          return today;
        }
        return prevDate;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  // Regenerate tasks and update when date changes
  useEffect(() => {
    if (user && currentDate) {
      // When date changes, regenerate everything
      if (scheduleTasks.length > 0) {
        // Always generate tasks for the current date when it changes
        generateDailyTasks(currentDate);
        checkMissedTasks();
        adjustScheduleForMissedTasks();
      }
      updateStreak();
      // Reset celebration state when date changes
      setShowCelebration(false);
      setShowMicroCheck(false);
      celebratedDateRef.current = ''; // allow fresh celebration on new day
    }
  }, [currentDate, user]);

  const stats = {
    totalGoals: (goals || []).length,
    completedGoals: (goals || []).filter(g => g.status === 'completed').length,
    activeGoals: (goals || []).filter(g => g.status === 'in-progress').length,
    totalSkills: (skills || []).length,
    totalHours: (skills || []).reduce((sum, skill) => sum + skill.hoursInvested, 0)
  };

  if (showAuth) {
    return (
      <div
        className="light relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center bg-no-repeat p-4"
        style={{ colorScheme: 'light', backgroundImage: "url('/Login%20Page%20Background.png')" }}
      >
        {/* Soft overlay for contrast and text legibility */}
        <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] pointer-events-none" />
        {/* Subtle background glow */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#315EFB]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#EC4899]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-md bg-white/95 backdrop-blur-md p-8 sm:p-10 rounded-2xl shadow-2xl border border-white/60 transition-all text-[#17233C]">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] mb-4 shadow-sm">
              <div className="inline-flex items-center justify-center mb-4">
                <img
                  src="/mymate-logo.png"
                  alt="MyMate logo"
                  className="w-14 h-14 object-contain"
                  className="w-20 h-20 object-contain drop-shadow-md"
                />
              </div>
              <h1 className="text-2xl font-bold text-[#17233C] tracking-tight">Welcome to MyMate</h1>
              <p className="text-sm text-[#64748B] mt-1.5">
                {authMode === 'login' ? 'Sign in to your personal growth dashboard' : 'Start your journey to organized daily growth'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                    required={authMode === 'signup'}
                    placeholder="Alex Morgan"
                    aria-label="Full Name"
                  />
                </div>
              )}
              <div>
                <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] mb-1.5">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                  required
                  placeholder="name@example.com"
                  aria-label="Email Address"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                  required
                  placeholder="••••••••"
                  aria-label="Password"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-[#315EFB] hover:bg-[#274cd0] text-white font-medium text-sm transition shadow-sm hover:shadow active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <span>{authMode === 'login' ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight size={16} />
              </button>
            </form>

            {/* Auth error message */}
            {authError && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 text-center font-medium">
                {authError}
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center my-6">
              <div className="flex-grow border-t border-[#E2E8F0]" />
              <span className="mx-3 text-[#94A3B8] text-xs font-medium uppercase tracking-wider">or</span>
              <div className="flex-grow border-t border-[#E2E8F0]" />
            </div>

            {/* Google Sign-In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-2.5 border border-[#E2E8F0] py-2.5 px-4 rounded-xl hover:bg-[#F8FAFC] text-sm font-medium text-[#17233C] transition shadow-sm"
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="Google logo"
                className="w-4 h-4"
              />
              <span>Continue with Google</span>
            </button>

            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="text-[#315EFB] hover:underline text-sm font-medium transition"
              >
                {authMode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
        );
  }

        // Celebration component is now imported from ./components/CelebrationOverlay

        return (
        <>
          {/* Global Theme Styles */}
          <style>{`
        /* Productive/Scifi Theme Styles */
        html.productive {
          --bg-primary: #0a0e27;
          --bg-secondary: #0f1428;
          --bg-card: #121830;
          --text-primary: #00f0ff;
          --text-secondary: #a0aec0;
          --accent-cyan: #00f0ff;
          --accent-purple: #8b5cf6;
          --accent-pink: #f43f72;
          --accent-green: #10b981;
          --border-glow: 0 0 10px rgba(0, 240, 255, 0.3);
        }

        html.productive body {
          background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0a0e27 100%) !important;
          color: #00f0ff !important;
        }

        html.productive .min-h-screen {
          background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0a0e27 100%) !important;
          position: relative;
        }

        html.productive .min-h-screen::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            linear-gradient(rgba(0, 240, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 240, 255, 0.03) 1px, transparent 1px);
          background-size: 50px 50px;
          pointer-events: none;
          z-index: 0;
        }

        html.productive .bg-white {
          background: rgba(18, 24, 48, 0.95) !important;
          border: 1px solid rgba(0, 240, 255, 0.2);
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.1);
        }

        html.productive .bg-gray-50 {
          background: rgba(15, 20, 40, 0.9) !important;
          border: 1px solid rgba(0, 240, 255, 0.15);
        }

        html.productive .bg-gray-100 {
          background: rgba(18, 24, 48, 0.8) !important;
          border: 1px solid rgba(0, 240, 255, 0.2);
        }

        html.productive .bg-gray-200 {
          background: rgba(0, 240, 255, 0.1) !important;
        }

        html.productive .bg-gray-800 {
          background: rgba(18, 24, 48, 0.95) !important;
          border: 1px solid rgba(0, 240, 255, 0.2);
        }

        html.productive .bg-gray-900 {
          background: rgba(10, 14, 39, 0.98) !important;
        }

        html.productive .bg-gray-700 {
          background: rgba(26, 31, 58, 0.9) !important;
          border: 1px solid rgba(0, 240, 255, 0.15);
        }

        html.productive .text-gray-800,
        html.productive .text-gray-700,
        html.productive .text-gray-900,
        html.productive .text-[#172554] {
          color: #00f0ff !important;
          text-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
        }

        html.productive .text-gray-600,
        html.productive .text-gray-500 {
          color: #a0aec0 !important;
        }

        html.productive .text-gray-400,
        html.productive .text-gray-300 {
          color: #718096 !important;
        }

        html.productive .border-gray-200,
        html.productive .border-gray-300 {
          border-color: rgba(0, 240, 255, 0.3) !important;
        }

        html.productive .border-gray-600,
        html.productive .border-gray-700 {
          border-color: rgba(0, 240, 255, 0.2) !important;
        }

        html.productive .shadow-md,
        html.productive .shadow-lg,
        html.productive .shadow-xl {
          box-shadow: 0 0 30px rgba(0, 240, 255, 0.2), 0 0 60px rgba(139, 92, 246, 0.1) !important;
        }

        html.productive .shadow {
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.15) !important;
        }

        html.productive button {
          transition: all 0.3s ease;
        }

        html.productive button:hover {
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.5);
        }

        html.productive input,
        html.productive textarea,
        html.productive select {
          background: rgba(18, 24, 48, 0.9) !important;
          border: 1px solid rgba(0, 240, 255, 0.3) !important;
          color: #00f0ff !important;
        }

        html.productive input:focus,
        html.productive textarea:focus,
        html.productive select:focus {
          border-color: #00f0ff !important;
          box-shadow: 0 0 15px rgba(0, 240, 255, 0.5) !important;
        }

        html.~ .bg-gradient-to-r {
          background: linear-gradient(90deg, rgba(0, 240, 255, 0.2), rgba(139, 92, 246, 0.2), rgba(244, 63, 114, 0.2)) !important;
        }

        html.productive .bg-gradient-to-br {
          background: linear-gradient(135deg, rgba(0, 240, 255, 0.15), rgba(139, 92, 246, 0.15)) !important;
        }

        /* Neon glow effects for specific elements */
        html.productive .bg-[#6C2BEF] {
          background: linear-gradient(135deg, #00f0ff, #8b5cf6) !important;
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.5), 0 0 40px rgba(139, 92, 246, 0.3) !important;
        }

        html.productive .bg-[#5A1FD8] {
          background: linear-gradient(135deg, #8b5cf6, #6C2BEF) !important;
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.5) !important;
        }

        html.productive .bg-[#4816C7] {
          background: linear-gradient(135deg, #6C2BEF, #4816C7) !important;
        }

        html.productive .bg-[#3610B6] {
          background: linear-gradient(180deg, #0a0e27, #1a1f3a) !important;
          border: 1px solid rgba(0, 240, 255, 0.3);
        }

        /* Sidebar in productive mode */
        html.productive .bg-\[\#3610B6\] {
          background: linear-gradient(180deg, rgba(10, 14, 39, 0.98), rgba(26, 31, 58, 0.95)) !important;
          border-right: 1px solid rgba(0, 240, 255, 0.3);
          box-shadow: 0 0 30px rgba(0, 240, 255, 0.1);
        }

        /* Header in productive mode */
        html.productive header {
          background: rgba(10, 14, 39, 0.95) !important;
          border-bottom: 1px solid rgba(0, 240, 255, 0.3) !important;
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.1);
        }

        /* Progress bars in productive mode */
        html.productive .bg-green-500 {
          background: linear-gradient(90deg, #00f0ff, #10b981) !important;
          box-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
        }

        html.productive .bg-yellow-500 {
          background: linear-gradient(90deg, #f59e0b, #f43f72) !important;
          box-shadow: 0 0 10px rgba(245, 158,  11, 0.5);
        }

        html.productive .bg-red-500 {
          background: linear-gradient(90deg, #f43f72, #ef4444) !important;
          box-shadow: 0 0 10px rgba(244, 63, 114, 0.5);
        }

        /* Scrollbar styling for productive theme */
        html.productive ::-webkit-scrollbar {
          width: 8px;
        }

        html.productive ::-webkit-scrollbar-track {
          background: rgba(10, 14, 39, 0.5);
        }

        html.productive ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #00f0ff, #8b5cf6);
          border-radius: 4px;
        }

        html.productive ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #8b5cf6, #f43f72);
        }
      `}</style>

          <div className="flex h-screen min-h-0 w-full overflow-hidden bg-[#F8FAFC] dark:bg-[#0B1120] text-[#17233C] dark:text-[#F8FAFC]">
            <CelebrationOverlay
              show={showCelebration}
              scenario={celebrationScenario}
              stats={celebrationStats}
              userName={user?.name}
              onDismiss={() => setShowCelebration(false)}
              animKey={celebrationAnimKey}
            />
            <MicroCheck show={showMicroCheck} />
            {sidebarOpen && <button type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm md:hidden" />}

            {/* Modern Collapsible Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden bg-white dark:bg-[#151F32] border-r border-[#E2E8F0] dark:border-[#22324F] transition-all duration-300 ease-in-out md:relative md:inset-auto md:h-full md:flex-shrink-0 ${sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full md:w-20 md:translate-x-0'}`}>
              {/* Brand Header */}
              <div className={`h-16 flex items-center border-b border-[#E2E8F0] dark:border-[#22324F] px-4 ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
                <div className="flex items-center gap-3 overflow-hidden cursor-pointer" onClick={() => { setActiveTab('dashboard'); if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false); }}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#315EFB] to-[#7857E8] p-0.5 flex-shrink-0 shadow-sm flex items-center justify-center">
                    <img
                      src="/mymate-logo.png"
                      alt="MyMate logo"
                      className="w-full h-full rounded-[10px] bg-white object-contain p-1"
                    />
                  </div>
                  {sidebarOpen && (
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-base tracking-tight text-[#17233C] dark:text-[#F8FAFC]">MyMate</span>
                      <span className="text-[10px] font-medium text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider"></span>
                    </div>
                  )}
                </div>
                {sidebarOpen && (
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    aria-label="Close navigation"
                    className="rounded-lg p-1.5 text-[#64748B] hover:text-[#17233C] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] dark:hover:text-[#F8FAFC] transition md:hidden"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* Grouped Navigation Links with Shared Sliding Indicator */}
              <div
                ref={sidebarNavContainerRef}
                onScroll={updateNavIndicator}
                className="relative flex-1 overflow-y-auto px-3 py-4 space-y-6"
              >
                {/* Single Shared Animated Active Indicator */}
                <div
                  className="nav-sliding-indicator bg-slate-900 dark:bg-slate-800 shadow-md"
                  style={{
                    transform: `translate3d(${navIndicator.left}px, ${navIndicator.top}px, 0)`,
                    width: `${navIndicator.width}px`,
                    height: `${navIndicator.height}px`,
                    opacity: navIndicator.opacity,
                    top: 0,
                    left: 0,
                  }}
                  aria-hidden="true"
                />

                {/* Home Section */}
                <div>
                  {sidebarOpen && (
                    <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] dark:text-[#64748B]">
                      Overview
                    </div>
                  )}
                  <button
                    ref={el => { tabButtonRefs.current['dashboard'] = el; }}
                    type="button"
                    title="Dashboard"
                    aria-current={activeTab === 'dashboard' ? 'page' : undefined}
                    onClick={() => { setActiveTab('dashboard'); if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false); }}
                    className={`nav-tab-item flex w-full items-center gap-3 py-2.5 text-sm font-medium ${sidebarOpen ? 'px-3 justify-start' : 'px-0 justify-center'
                      } ${activeTab === 'dashboard'
                        ? 'text-white'
                        : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#17233C] dark:hover:text-[#F8FAFC]'
                      }`}
                  >
                    <TrendingUp size={18} className={`nav-icon flex-shrink-0 ${activeTab === 'dashboard' ? 'text-white' : 'text-[#315EFB]'}`} />
                    {sidebarOpen && <span className="nav-label">Dashboard</span>}
                  </button>
                </div>

                {/* My Day Section */}
                <div>
                  {sidebarOpen && (
                    <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] dark:text-[#64748B]">
                      My Day
                    </div>
                  )}
                  <div className="space-y-1">
                    {[
                      { id: 'schedule', icon: ListTodo, label: 'Daily Schedule' },
                      { id: 'planner', icon: Calendar, label: 'Planner' },
                    ].map(item => (
                      <button
                        key={item.id}
                        ref={el => { tabButtonRefs.current[item.id] = el; }}
                        type="button"
                        title={item.label}
                        aria-current={activeTab === item.id ? 'page' : undefined}
                        onClick={() => { setActiveTab(item.id); if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false); }}
                        className={`nav-tab-item flex w-full items-center gap-3 py-2.5 text-sm font-medium ${sidebarOpen ? 'px-3 justify-start' : 'px-0 justify-center'
                          } ${activeTab === item.id
                            ? 'text-white'
                            : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#17233C] dark:hover:text-[#F8FAFC]'
                          }`}
                      >
                        <item.icon size={18} className={`nav-icon flex-shrink-0 ${activeTab === item.id ? 'text-white' : ''}`} />
                        {sidebarOpen && <span className="nav-label">{item.label}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Goals & Growth Section */}
                <div>
                  {sidebarOpen && (
                    <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] dark:text-[#64748B]">
                      Goals & Growth
                    </div>
                  )}
                  <div className="space-y-1">
                    {[
                      { id: 'goals', icon: Target, label: 'Goals' },
                      { id: 'skills', icon: BookOpen, label: 'Track Sheet' },
                    ].map(item => (
                      <button
                        key={item.id}
                        ref={el => { tabButtonRefs.current[item.id] = el; }}
                        type="button"
                        title={item.label}
                        aria-current={activeTab === item.id ? 'page' : undefined}
                        onClick={() => { setActiveTab(item.id); if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false); }}
                        className={`nav-tab-item flex w-full items-center gap-3 py-2.5 text-sm font-medium ${sidebarOpen ? 'px-3 justify-start' : 'px-0 justify-center'
                          } ${activeTab === item.id
                            ? 'text-white'
                            : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#17233C] dark:hover:text-[#F8FAFC]'
                          }`}
                      >
                        <item.icon size={18} className={`nav-icon flex-shrink-0 ${activeTab === item.id ? 'text-white' : ''}`} />
                        {sidebarOpen && <span className="nav-label">{item.label}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Insights & Money Section */}
                <div>
                  {sidebarOpen && (
                    <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] dark:text-[#64748B]">
                      Insights & Money
                    </div>
                  )}
                  <div className="space-y-1">
                    {[
                      { id: 'analysis', icon: BarChart3, label: 'Insights & Analysis' },
                      { id: 'budget', icon: Wallet, label: 'Budget Planner' },
                    ].map(item => (
                      <button
                        key={item.id}
                        ref={el => { tabButtonRefs.current[item.id] = el; }}
                        type="button"
                        title={item.label}
                        aria-current={activeTab === item.id ? 'page' : undefined}
                        onClick={() => { setActiveTab(item.id); if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false); }}
                        className={`nav-tab-item flex w-full items-center gap-3 py-2.5 text-sm font-medium ${sidebarOpen ? 'px-3 justify-start' : 'px-0 justify-center'
                          } ${activeTab === item.id
                            ? 'text-white'
                            : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#17233C] dark:hover:text-[#F8FAFC]'
                          }`}
                      >
                        <item.icon size={18} className={`nav-icon flex-shrink-0 ${activeTab === item.id ? 'text-white' : ''}`} />
                        {sidebarOpen && <span className="nav-label">{item.label}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* My Space Section */}
                <div>
                  {sidebarOpen && (
                    <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] dark:text-[#64748B]">
                      My Space
                    </div>
                  )}
                  <div className="space-y-1">
                    {[
                      { id: 'notes', icon: StickyNote, label: 'Manual Notes' },
                      { id: 'content', icon: Video, label: 'Content Creation' },
                    ].map(item => (
                      <button
                        key={item.id}
                        ref={el => { tabButtonRefs.current[item.id] = el; }}
                        type="button"
                        title={item.label}
                        aria-current={activeTab === item.id ? 'page' : undefined}
                        onClick={() => { setActiveTab(item.id); if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false); }}
                        className={`nav-tab-item flex w-full items-center gap-3 py-2.5 text-sm font-medium ${sidebarOpen ? 'px-3 justify-start' : 'px-0 justify-center'
                          } ${activeTab === item.id
                            ? 'text-white'
                            : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#17233C] dark:hover:text-[#F8FAFC]'
                          }`}
                      >
                        <item.icon size={18} className={`nav-icon flex-shrink-0 ${activeTab === item.id ? 'text-white' : ''}`} />
                        {sidebarOpen && <span className="nav-label">{item.label}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sidebar Footer Quick Profile */}
              <div className="p-3 border-t border-[#E2E8F0] dark:border-[#22324F] bg-white dark:bg-[#151F32]">
                <button
                  ref={el => { tabButtonRefs.current['profile'] = el; }}
                  type="button"
                  title="Profile"
                  aria-current={activeTab === 'profile' ? 'page' : undefined}
                  onClick={() => { setActiveTab('profile'); if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false); }}
                  className={`flex w-full items-center gap-3 p-2 transition-all ${activeTab === 'profile' ? 'bg-slate-900 dark:bg-slate-800 text-white shadow-sm' : 'hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60'
                    }`}
                >
                  <div className="w-8 h-8 bg-gradient-to-tr from-[#315EFB] to-[#7857E8] text-white flex items-center justify-center font-semibold text-xs flex-shrink-0 shadow-sm">
                    {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  {sidebarOpen && (
                    <div className="flex flex-col text-left overflow-hidden min-w-0">
                      <span className={`text-xs font-semibold truncate ${activeTab === 'profile' ? 'text-white' : 'text-[#17233C] dark:text-[#F8FAFC]'}`}>{user?.name || 'User'}</span>
                      <span className={`text-[11px] truncate ${activeTab === 'profile' ? 'text-slate-300' : 'text-[#64748B] dark:text-[#94A3B8]'}`}>{user?.email || 'Settings'}</span>
                    </div>
                  )}
                </button>
              </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {/* Modern Top Header */}
              <header className="h-16 bg-white dark:bg-[#151F32] border-b border-[#E2E8F0] dark:border-[#22324F] px-4 sm:px-6 flex items-center justify-between flex-shrink-0 z-20">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="rounded-xl p-2 text-[#64748B] dark:text-[#94A3B8] hover:text-[#17233C] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition"
                    aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand navigation'}
                    title={sidebarOpen ? 'Collapse sidebar' : 'Expand navigation'}
                  >
                    <Menu size={20} />
                  </button>
                  <div className="hidden sm:flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                    <span>MyMate</span>
                    <ChevronRight size={14} className="text-[#94A3B8]" />
                    <span className="capitalize font-medium text-[#17233C] dark:text-[#F8FAFC]">
                      {activeTab === 'skills' ? 'Track Sheet' : activeTab === 'analysis' ? 'Insights' : activeTab}
                    </span>
                  </div>
                </div>

                {/* Center Remaining Time in Day Pill */}
                <div className="flex items-center">
                  {(() => {
                    const timeRemaining = getTimeRemainingInDay();
                    return (
                      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F1F5F9] dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#22324F] text-[#17233C] dark:text-[#F8FAFC] text-xs font-medium shadow-xs">
                        <Clock size={14} className="text-[#315EFB]" />
                        <span className="hidden sm:inline text-[#64748B] dark:text-[#94A3B8]">Today left:</span>
                        <span className="tabular-nums font-mono font-semibold text-[#17233C] dark:text-[#F8FAFC]">
                          {String(timeRemaining.hours).padStart(2, '0')}:
                          {String(timeRemaining.minutes).padStart(2, '0')}:
                          {String(timeRemaining.seconds).padStart(2, '0')}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Right Header Actions */}
                <div className="flex items-center gap-3">
                  {/* Streak Pill */}
                  {user && streak.currentStreak > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 text-xs font-semibold text-[#F97316]">
                      <Flame size={15} fill="currentColor" className="text-[#F97316]" />
                      <span>{streak.currentStreak}d</span>
                    </div>
                  )}

                  {/* Theme Toggle */}
                  <button
                    type="button"
                    onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}
                    className="rounded-xl p-2 text-[#64748B] dark:text-[#94A3B8] hover:text-[#17233C] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition"
                    aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                    title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                  >
                    {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                  </button>

                  {/* User Profile Menu */}
                  {user && (
                    <div className="relative">
                      <button
                        onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                        className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#315EFB] to-[#7857E8] text-white flex items-center justify-center font-semibold text-xs shadow-sm hover:opacity-95 transition"
                        aria-label="Profile menu"
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </button>

                      {profileMenuOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setProfileMenuOpen(false)}
                          />
                          <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#151F32] rounded-2xl shadow-xl border border-[#E2E8F0] dark:border-[#22324F] z-20 py-1 overflow-hidden">
                            <div className="p-3.5 border-b border-[#E2E8F0] dark:border-[#22324F]">
                              <p className="font-semibold text-sm text-[#17233C] dark:text-[#F8FAFC] truncate">{user.name}</p>
                              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] truncate">{user.email}</p>
                            </div>
                            <div className="p-1">
                              <button
                                type="button"
                                onClick={() => { setActiveTab('profile'); setProfileMenuOpen(false); }}
                                className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#17233C] dark:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition"
                              >
                                <User size={15} className="text-[#315EFB]" />
                                <span>View Profile & Growth</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleExport();
                                  setProfileMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#17233C] dark:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition"
                                aria-label="Export data"
                              >
                                <Download size={15} className="text-[#64748B] dark:text-[#94A3B8]" />
                                <span>Export Backup (JSON)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleLogout();
                                  setProfileMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                                aria-label="Logout"
                              >
                                <X size={15} className="text-red-600 dark:text-red-400" />
                                <span>Sign Out</span>
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </header>

              <main key={activeTab} className="animate-section-float min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6 bg-gray-50 dark:bg-gray-900">
                {activeTab === 'dashboard' && (
                  <div className="space-y-6 max-w-7xl mx-auto pb-10">
                    {/* A. Header: Personalized greeting based on actual user profile */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xl sm:text-2xl font-bold tracking-tight text-[#17233C] dark:text-[#F8FAFC]">
                            {(() => {
                              const hour = currentTime.getHours();
                              if (hour < 12) return 'Good morning';
                              if (hour < 18) return 'Good afternoon';
                              return 'Good evening';
                            })()}, {user?.name || 'Explorer'}
                          </span>
                          <span className="inline-flex items-center justify-center text-lg animate-pulse-subtle">✨</span>
                        </div>
                        <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
                          {streak.currentStreak > 0
                            ? `You are on an active ${streak.currentStreak}-day streak. Keep your momentum strong today!`
                            : "Ready to make today count? Review your focus tasks and take action."}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 self-start sm:self-auto">
                        <button
                          onClick={() => setActiveTab('schedule')}
                          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#315EFB] text-white hover:bg-[#274cd0] transition shadow-xs"
                        >
                          <Plus size={15} />
                          <span>Plan Task</span>
                        </button>
                        <button
                          onClick={() => setActiveTab('goals')}
                          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#F1F5F9] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] hover:bg-[#E2E8F0] dark:hover:bg-[#22324F] transition"
                        >
                          <Target size={15} className="text-[#7857E8]" />
                          <span>New Goal</span>
                        </button>
                      </div>
                    </div>

                    {/* B. Weekly Progress Section & Year Countdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* 7-Day Performance & Progress Ring */}
                      <div className="lg:col-span-2 bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] flex items-center gap-2">
                              <TrendingUp size={18} className="text-[#315EFB]" />
                              <span>7-Day Productivity & Completion</span>
                            </h3>
                            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                              Performance calculated across your actual completed schedule tasks
                            </p>
                          </div>
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#315EFB] border border-blue-200 dark:border-blue-900/50">
                            Rolling 7 Days
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-6 py-2">
                          {/* Ring Meter */}
                          <div className="flex items-center justify-center">
                            <div className="relative w-32 h-32">
                              <svg className="w-32 h-32 transform -rotate-90">
                                <circle
                                  cx="64"
                                  cy="64"
                                  r="52"
                                  stroke="currentColor"
                                  strokeWidth="10"
                                  fill="transparent"
                                  className="text-[#E2E8F0] dark:text-[#1E293B]"
                                />
                                <circle
                                  cx="64"
                                  cy="64"
                                  r="52"
                                  stroke="url(#bluePurpleGradient)"
                                  strokeWidth="10"
                                  strokeLinecap="round"
                                  fill="transparent"
                                  strokeDasharray={`${(calculatePerfection() / 100) * 326.7} 326.7`}
                                  className="transition-all duration-700 ease-out"
                                />
                                <defs>
                                  <linearGradient id="bluePurpleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#315EFB" />
                                    <stop offset="100%" stopColor="#7857E8" />
                                  </linearGradient>
                                </defs>
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                <span className="text-2xl font-bold tracking-tight text-[#17233C] dark:text-[#F8FAFC]">
                                  {calculatePerfection()}%
                                </span>
                                <span className="text-[10px] uppercase font-semibold tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                                  Consistency
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Stats Grid */}
                          <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#22324F]/60">
                              <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">Today's Completed</span>
                              <div className="text-xl font-bold text-[#17233C] dark:text-[#F8FAFC] mt-0.5">
                                {getTodayCompletionStats().completed} / {getTodayCompletionStats().total}
                              </div>
                              <span className="text-[11px] text-[#16A34A] font-medium mt-1 inline-block">
                                {calculateTodayCompletion()}% achieved today
                              </span>
                            </div>
                            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#22324F]/60">
                              <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">7-Day Total Done</span>
                              <div className="text-xl font-bold text-[#17233C] dark:text-[#F8FAFC] mt-0.5">
                                {(() => {
                                  const today = getTodayDate();
                                  const last7Days: string[] = [];
                                  for (let i = 0; i < 7; i++) {
                                    const date = new Date(today);
                                    date.setDate(date.getDate() - i);
                                    last7Days.push(date.toISOString().split('T')[0]);
                                  }
                                  return dailyTasks.filter(t => last7Days.includes(t.date) && t.completed).length;
                                })()} tasks
                              </div>
                              <span className="text-[11px] text-[#7857E8] font-medium mt-1 inline-block">
                                Verified application data
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Days remaining in year card */}
                      <div className="bg-gradient-to-br from-[#315EFB] via-[#7857E8] to-[#EC4899] p-6 rounded-2xl text-white shadow-md flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-white/80">Year Momentum</span>
                          <Calendar size={18} className="text-white/80" />
                        </div>
                        <div className="my-4">
                          <div className="text-5xl font-extrabold tracking-tight tabular-nums">
                            {getDaysRemainingInYear()}
                          </div>
                          <p className="text-sm font-medium text-white/90 mt-1">Days left in {new Date().getFullYear()}</p>
                        </div>
                        <div className="pt-3 border-t border-white/20 flex items-center justify-between text-xs text-white/90">
                          <span>Make every single day matter</span>
                          <button
                            onClick={() => setActiveTab('planner')}
                            className="underline font-semibold hover:text-white"
                          >
                            View Planner →
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* C. Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* 1. Tasks Completed Today */}
                      <div className="bg-white dark:bg-[#151F32] p-5 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm hover:border-[#315EFB]/40 transition group">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">
                            Tasks Completed
                          </span>
                          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#315EFB] flex items-center justify-center">
                            <CheckCircle size={18} />
                          </div>
                        </div>
                        <div className="text-3xl font-bold text-[#17233C] dark:text-[#F8FAFC] tracking-tight">
                          {getTodayCompletionStats().completed}
                        </div>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1.5">
                          {getTodayCompletionStats().total > 0
                            ? `Out of ${getTodayCompletionStats().total} scheduled for today`
                            : 'No scheduled tasks today'}
                        </p>
                      </div>

                      {/* 2. Active Goals */}
                      <div className="bg-white dark:bg-[#151F32] p-5 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm hover:border-[#7857E8]/40 transition group">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">
                            Active Goals
                          </span>
                          <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-[#7857E8] flex items-center justify-center">
                            <Target size={18} />
                          </div>
                        </div>
                        <div className="text-3xl font-bold text-[#17233C] dark:text-[#F8FAFC] tracking-tight">
                          {stats.activeGoals}
                        </div>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1.5">
                          {stats.completedGoals} accomplished goals so far
                        </p>
                      </div>

                      {/* 3. Skills Tracked */}
                      <div className="bg-white dark:bg-[#151F32] p-5 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm hover:border-[#EC4899]/40 transition group">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">
                            Track Sheet Topics
                          </span>
                          <div className="w-8 h-8 rounded-xl bg-pink-50 dark:bg-pink-950/40 text-[#EC4899] flex items-center justify-center">
                            <BookOpen size={18} />
                          </div>
                        </div>
                        <div className="text-3xl font-bold text-[#17233C] dark:text-[#F8FAFC] tracking-tight">
                          {skillTopics.length > 0 ? skillTopics.length : stats.totalSkills}
                        </div>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1.5">
                          {skillTopics.length > 0
                            ? `${skillTopics.filter(t => t.status === 'Completed').length} topics mastered`
                            : `${stats.totalHours.toFixed(1)} verified hours`}
                        </p>
                      </div>

                      {/* 4. Current Streak */}
                      <div className="bg-white dark:bg-[#151F32] p-5 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm hover:border-[#F97316]/40 transition group">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">
                            Current Streak
                          </span>
                          <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#F97316] flex items-center justify-center">
                            <Flame size={18} fill="currentColor" />
                          </div>
                        </div>
                        <div className="text-3xl font-bold text-[#F97316] tracking-tight">
                          {streak.currentStreak} <span className="text-base font-normal text-[#64748B]">days</span>
                        </div>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1.5">
                          {streak.longestStreak > 0 ? `Best record: ${streak.longestStreak} days` : 'Begin your journey today'}
                        </p>
                      </div>
                    </div>

                    {/* D. Today's Focus Section */}
                    <div className="bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#315EFB]" />
                          <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC]">
                            Today's Focus
                          </h3>
                          <span className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                            ({formatDateDDMMYYYY(currentDate)})
                          </span>
                        </div>
                        <button
                          onClick={() => setActiveTab('schedule')}
                          className="text-xs font-semibold text-[#315EFB] dark:text-[#7857E8] hover:underline"
                        >
                          Manage Schedule →
                        </button>
                      </div>

                      <div className="divide-y divide-[#E2E8F0] dark:divide-[#22324F]">
                        {getTodayTasks().length > 0 ? (
                          getTodayTasks().map(task => (
                            <div
                              key={task.id}
                              className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4 transition hover:bg-[#F8FAFC]/60 dark:hover:bg-[#1E293B]/40 px-2 rounded-xl"
                            >
                              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleTask(task.id)}
                                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition border ${task.completed
                                    ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-xs'
                                    : 'border-[#CBD5E1] dark:border-[#475569] text-transparent hover:border-[#315EFB]'
                                    }`}
                                  aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'}
                                >
                                  <Check size={14} className={task.completed ? 'stroke-[3]' : 'opacity-0'} />
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className={`text-sm font-medium truncate ${task.completed
                                        ? 'line-through text-[#94A3B8] dark:text-[#64748B]'
                                        : 'text-[#17233C] dark:text-[#F8FAFC]'
                                        }`}
                                    >
                                      {task.title}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${task.priority === 'high'
                                        ? 'bg-red-50 dark:bg-red-950/40 text-[#DC2626] border border-red-200 dark:border-red-900/60'
                                        : task.priority === 'medium'
                                          ? 'bg-amber-50 dark:bg-amber-950/40 text-[#D97706] border border-amber-200 dark:border-amber-900/60'
                                          : 'bg-blue-50 dark:bg-blue-950/40 text-[#315EFB] border border-blue-200 dark:border-blue-900/60'
                                        }`}
                                    >
                                      {task.priority}
                                    </span>
                                    {task.category && (
                                      <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] px-2 py-0.5 rounded-md bg-[#F1F5F9] dark:bg-[#1E293B]">
                                        {task.category}
                                      </span>
                                    )}
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5 truncate">
                                      {task.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-xs font-mono font-medium text-[#64748B] dark:text-[#94A3B8] flex-shrink-0">
                                {formatTime12Hour(task.time)}
                              </div>
                            </div>
                          ))
                        ) : (
                          /* Meaningful Empty State */
                          <div className="py-12 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] dark:bg-[#1E293B] text-[#94A3B8] flex items-center justify-center mx-auto mb-3">
                              <ListTodo size={24} />
                            </div>
                            <h4 className="text-sm font-semibold text-[#17233C] dark:text-[#F8FAFC]">No tasks scheduled for today</h4>
                            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto mt-1 mb-4">
                              Build your regular schedule routines or add quick daily tasks to keep your growth on track.
                            </p>
                            <button
                              onClick={() => setActiveTab('schedule')}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#315EFB] text-white hover:bg-[#274cd0] transition shadow-xs"
                            >
                              <Plus size={15} />
                              <span>Add Task to Daily Schedule</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* E. Additional Dashboard Content: Active Goals & Upcoming Deadlines */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Active Goals Preview */}
                      <div className="bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] flex items-center gap-2">
                              <Target size={18} className="text-[#7857E8]" />
                              <span>Active Growth Goals</span>
                            </h3>
                            <button
                              onClick={() => setActiveTab('goals')}
                              className="text-xs font-semibold text-[#315EFB] dark:text-[#7857E8] hover:underline"
                            >
                              All Goals ({goals.length}) →
                            </button>
                          </div>

                          <div className="space-y-3">
                            {goals.filter(g => g.status === 'in-progress').slice(0, 3).map(goal => (
                              <div
                                key={goal.id}
                                className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#22324F]/70 flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="text-sm font-semibold text-[#17233C] dark:text-[#F8FAFC] truncate block">
                                    {goal.title}
                                  </span>
                                  <div className="flex items-center gap-2 mt-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                                    <span className="capitalize">{goal.category}</span>
                                    {goal.targetDate && (
                                      <>
                                        <span>•</span>
                                        <span>Target: {goal.targetDate}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-purple-50 dark:bg-purple-950/40 text-[#7857E8] border border-purple-200 dark:border-purple-900/50 flex-shrink-0">
                                  In Progress
                                </span>
                              </div>
                            ))}

                            {goals.filter(g => g.status === 'in-progress').length === 0 && (
                              <div className="text-center py-6 text-xs text-[#64748B] dark:text-[#94A3B8]">
                                <p>No active goals currently in progress.</p>
                                <button
                                  onClick={() => setActiveTab('goals')}
                                  className="mt-2 text-[#315EFB] font-semibold hover:underline"
                                >
                                  + Set your first career or life goal
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Upcoming Deadlines from Planner */}
                      <div className="bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] flex items-center gap-2">
                              <Calendar size={18} className="text-[#F97316]" />
                              <span>Upcoming Deadlines</span>
                            </h3>
                            <button
                              onClick={() => setActiveTab('planner')}
                              className="text-xs font-semibold text-[#315EFB] dark:text-[#7857E8] hover:underline"
                            >
                              All Plans ({deadlinePlans.length}) →
                            </button>
                          </div>

                          <div className="space-y-3">
                            {deadlinePlans
                              .filter(p => p.status === 'pending')
                              .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
                              .slice(0, 3)
                              .map(plan => (
                                <div
                                  key={plan.id}
                                  className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#22324F]/70 flex items-center justify-between gap-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <span className="text-sm font-semibold text-[#17233C] dark:text-[#F8FAFC] truncate block">
                                      {plan.title}
                                    </span>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                                      <Clock size={12} className="text-[#F97316]" />
                                      <span>{new Date(plan.deadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                                    </div>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider flex-shrink-0 ${plan.priority === 'high'
                                      ? 'bg-red-50 dark:bg-red-950/40 text-[#DC2626] border border-red-200 dark:border-red-900/50'
                                      : plan.priority === 'medium'
                                        ? 'bg-amber-50 dark:bg-amber-950/40 text-[#D97706] border border-amber-200 dark:border-amber-900/50'
                                        : 'bg-blue-50 dark:bg-blue-950/40 text-[#315EFB] border border-blue-200 dark:border-blue-900/50'
                                      }`}
                                  >
                                    {plan.priority}
                                  </span>
                                </div>
                              ))}

                            {deadlinePlans.filter(p => p.status === 'pending').length === 0 && (
                              <div className="text-center py-6 text-xs text-[#64748B] dark:text-[#94A3B8]">
                                <p>All deadlines completed! Great work.</p>
                                <button
                                  onClick={() => setActiveTab('planner')}
                                  className="mt-2 text-[#315EFB] font-semibold hover:underline"
                                >
                                  + Schedule a new deadline
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'goals' && (
                  <div className="space-y-6 max-w-7xl mx-auto pb-10">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-[#17233C] dark:text-[#F8FAFC]">Goals & Milestones</h2>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
                          Set clear objectives, track achievement status, and turn ambitions into measurable realities.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowGoalForm(!showGoalForm)}
                        className="inline-flex items-center gap-2 bg-[#315EFB] hover:bg-[#274cd0] text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs self-start sm:self-auto"
                      >
                        <Plus size={16} />
                        <span>{showGoalForm ? 'Close Form' : 'Add New Goal'}</span>
                      </button>
                    </div>

                    {showGoalForm && (
                      <div className="bg-white dark:bg-[#151F32] rounded-2xl p-6 border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                        <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] mb-4">
                          {editingGoal ? 'Edit Goal' : 'Create New Goal'}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label htmlFor="goal-title" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Title</label>
                            <input
                              id="goal-title"
                              type="text"
                              value={goalForm.title}
                              onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              placeholder="e.g., Master Full-Stack Architecture"
                            />
                          </div>
                          <div>
                            <label htmlFor="goal-description" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Description</label>
                            <textarea
                              id="goal-description"
                              value={goalForm.description}
                              onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              rows={3}
                              placeholder="Detail the exact outcomes you want to achieve"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="goal-category" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Category</label>
                              <select
                                id="goal-category"
                                value={goalForm.category}
                                onChange={(e) => setGoalForm({ ...goalForm, category: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm transition outline-none"
                                aria-label="Goal category"
                              >
                                <option value="career">Career</option>
                                <option value="learning">Learning</option>
                                <option value="project">Project</option>
                                <option value="networking">Networking</option>
                                <option value="health">Health & Wellness</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor="goal-date" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Target Date</label>
                              <input
                                id="goal-date"
                                type="date"
                                value={goalForm.targetDate}
                                onChange={(e) => setGoalForm({ ...goalForm, targetDate: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm transition outline-none"
                                aria-label="Target date"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-3 pt-2">
                            <button
                              onClick={editingGoal ? handleUpdateGoal : handleAddGoal}
                              className="inline-flex items-center gap-2 bg-[#315EFB] hover:bg-[#274cd0] text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs"
                            >
                              <Save size={16} />
                              <span>{editingGoal ? 'Update Goal' : 'Save Goal'}</span>
                            </button>
                            <button
                              onClick={() => { setShowGoalForm(false); setEditingGoal(null); setGoalForm({ title: '', description: '', category: 'career', targetDate: '', status: 'in-progress' }); }}
                              className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] text-xs font-semibold transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {goals.map(goal => (
                        <div
                          key={goal.id}
                          className="bg-white dark:bg-[#151F32] p-5 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm hover:border-[#315EFB]/30 transition flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <button
                                  onClick={() => toggleGoalStatus(goal.id)}
                                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition border mt-0.5 flex-shrink-0 ${goal.status === 'completed'
                                    ? 'bg-[#16A34A] border-[#16A34A] text-white'
                                    : 'border-[#CBD5E1] dark:border-[#475569] text-transparent hover:border-[#315EFB]'
                                    }`}
                                  aria-label={goal.status === 'completed' ? 'Mark as in progress' : 'Mark as completed'}
                                >
                                  <Check size={14} className={goal.status === 'completed' ? 'stroke-[3]' : 'opacity-0'} />
                                </button>
                                <div className="min-w-0 flex-1">
                                  <h3 className={`text-base font-bold truncate ${goal.status === 'completed' ? 'text-[#94A3B8] line-through' : 'text-[#17233C] dark:text-[#F8FAFC]'}`}>
                                    {goal.title}
                                  </h3>
                                  {goal.description && (
                                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 line-clamp-2">
                                      {goal.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => handleEditGoal(goal)}
                                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#17233C] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] dark:hover:text-[#F8FAFC] transition"
                                  aria-label="Edit goal"
                                >
                                  <Edit2 size={15} />
                                </button>
                                <button
                                  onClick={() => handleDeleteGoal(goal.id)}
                                  className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                                  aria-label="Delete goal"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-4 mt-3 border-t border-[#E2E8F0] dark:border-[#22324F] text-xs">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-[#F1F5F9] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8] capitalize font-medium">
                                {goal.category}
                              </span>
                              {goal.targetDate && (
                                <span className="text-[#64748B] dark:text-[#94A3B8]">
                                  Due: {goal.targetDate}
                                </span>
                              )}
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${goal.status === 'completed'
                                ? 'bg-green-50 dark:bg-green-950/40 text-[#16A34A] border border-green-200 dark:border-green-900/50'
                                : 'bg-purple-50 dark:bg-purple-950/40 text-[#7857E8] border border-purple-200 dark:border-purple-900/50'
                                }`}
                            >
                              {goal.status}
                            </span>
                          </div>
                        </div>
                      ))}

                      {goals.length === 0 && (
                        <div className="md:col-span-2 bg-white dark:bg-[#151F32] rounded-2xl p-12 text-center border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                          <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] dark:bg-[#1E293B] text-[#94A3B8] flex items-center justify-center mx-auto mb-3">
                            <Target size={24} />
                          </div>
                          <h4 className="text-sm font-semibold text-[#17233C] dark:text-[#F8FAFC]">No goals set yet</h4>
                          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto mt-1 mb-4">
                            Define career landmarks, fitness milestones, or skill learning checkpoints to focus your efforts.
                          </p>
                          <button
                            onClick={() => setShowGoalForm(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#315EFB] text-white hover:bg-[#274cd0] transition shadow-xs"
                          >
                            <Plus size={15} />
                            <span>Set Your First Goal</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'skills' && (
                  <SkillsTracker
                    topics={skillTopics}
                    onTopicsChange={async updatedTopics => {
                      await saveData('skillTopics', updatedTopics);
                      setSkillTopics(updatedTopics);
                    }}
                  />
                )}

                {activeTab === 'profile' && user && (
                  <ProfileDashboard user={user} />
                )}

                {activeTab === 'planner' && (
                  <div className="space-y-6 max-w-7xl mx-auto pb-10">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-[#17233C] dark:text-[#F8FAFC]">Deadline Planner</h2>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
                          Track critical project deadlines, setup reminders, and ensure key targets never slip through.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (showPlanForm) {
                            setShowPlanForm(false);
                            setEditingPlan(null);
                            setPlanForm({ title: '', description: '', deadline: '', priority: 'medium', reminderOffset: '15' });
                          } else {
                            setEditingPlan(null);
                            setPlanForm({ title: '', description: '', deadline: '', priority: 'medium', reminderOffset: '15' });
                            setShowPlanForm(true);
                          }
                        }}
                        className="inline-flex items-center gap-2 bg-[#315EFB] hover:bg-[#274cd0] text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs self-start sm:self-auto"
                      >
                        <Plus size={16} />
                        <span>{showPlanForm ? 'Close Form' : 'Add New Plan'}</span>
                      </button>
                    </div>

                    {showPlanForm && (
                      <div className="bg-white dark:bg-[#151F32] rounded-2xl p-6 border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                        <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] mb-4">
                          {editingPlan ? 'Edit Deadline Plan' : 'New Deadline Plan'}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label htmlFor="plan-title" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Title</label>
                            <input
                              id="plan-title"
                              type="text"
                              value={planForm.title}
                              onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              placeholder="e.g., Deliver Quarterly Portfolio Update"
                            />
                          </div>
                          <div>
                            <label htmlFor="plan-desc" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Description</label>
                            <textarea
                              id="plan-desc"
                              value={planForm.description}
                              onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              rows={2}
                              placeholder="Context or notes regarding this milestone"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                              <label htmlFor="plan-deadline" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Target Deadline</label>
                              <input
                                id="plan-deadline"
                                type="datetime-local"
                                value={planForm.deadline}
                                onChange={(e) => setPlanForm({ ...planForm, deadline: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm transition outline-none"
                              />
                            </div>
                            <div>
                              <label htmlFor="plan-priority" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Priority</label>
                              <select
                                id="plan-priority"
                                value={planForm.priority}
                                onChange={(e) => setPlanForm({ ...planForm, priority: e.target.value as 'low' | 'medium' | 'high' })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm transition outline-none"
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor="plan-reminder" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Notification Reminder</label>
                              <select
                                id="plan-reminder"
                                value={planForm.reminderOffset}
                                onChange={(e) => setPlanForm({ ...planForm, reminderOffset: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm transition outline-none"
                              >
                                <option value="15">15 minutes before</option>
                                <option value="60">1 hour before</option>
                                <option value="1440">1 day before</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 pt-2">
                            <button
                              onClick={editingPlan ? handleUpdatePlan : handleAddPlan}
                              className="inline-flex items-center gap-2 bg-[#315EFB] hover:bg-[#274cd0] text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs"
                            >
                              <Save size={16} />
                              <span>{editingPlan ? 'Update Plan' : 'Save Plan'}</span>
                            </button>
                            <button
                              onClick={() => { setShowPlanForm(false); setEditingPlan(null); setPlanForm({ title: '', description: '', deadline: '', priority: 'medium', reminderOffset: '15' }); }}
                              className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] text-xs font-semibold transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {(deadlinePlans || []).sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()).map(plan => (
                        <div
                          key={plan.id}
                          className="bg-white dark:bg-[#151F32] p-5 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm hover:border-[#315EFB]/30 transition flex items-start justify-between gap-4"
                        >
                          <div className="flex items-start gap-3.5 flex-1 min-w-0">
                            <button
                              onClick={() => handleTogglePlan(plan.id)}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center transition border mt-0.5 flex-shrink-0 ${plan.status === 'completed'
                                ? 'bg-[#16A34A] border-[#16A34A] text-white'
                                : 'border-[#CBD5E1] dark:border-[#475569] text-transparent hover:border-[#315EFB]'
                                }`}
                              aria-label={plan.status === 'completed' ? 'Mark plan pending' : 'Mark plan completed'}
                            >
                              <Check size={14} className={plan.status === 'completed' ? 'stroke-[3]' : 'opacity-0'} />
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className={`text-base font-bold truncate ${plan.status === 'completed' ? 'text-[#94A3B8] line-through' : 'text-[#17233C] dark:text-[#F8FAFC]'}`}>
                                  {plan.title}
                                </h3>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${plan.priority === 'high'
                                    ? 'bg-red-50 dark:bg-red-950/40 text-[#DC2626] border border-red-200 dark:border-red-900/60'
                                    : plan.priority === 'medium'
                                      ? 'bg-amber-50 dark:bg-amber-950/40 text-[#D97706] border border-amber-200 dark:border-amber-900/60'
                                      : 'bg-blue-50 dark:bg-blue-950/40 text-[#315EFB] border border-blue-200 dark:border-blue-900/60'
                                    }`}
                                >
                                  {plan.priority}
                                </span>
                                {plan.status === 'overdue' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                                    Overdue
                                  </span>
                                )}
                              </div>
                              {plan.description && (
                                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mb-2">
                                  {plan.description}
                                </p>
                              )}
                              <div className="flex items-center gap-3 text-xs text-[#64748B] dark:text-[#94A3B8]">
                                <span className="flex items-center gap-1.5 font-medium">
                                  <Clock size={13} className="text-[#F97316]" />
                                  {new Date(plan.deadline).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleEditPlan(plan)}
                              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#315EFB] hover:bg-blue-50 dark:hover:bg-blue-950/30 transition"
                              aria-label="Edit plan"
                              title="Edit plan"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeletePlan(plan.id)}
                              className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                              aria-label="Delete plan"
                              title="Delete plan"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {deadlinePlans.length === 0 && (
                        <div className="bg-white dark:bg-[#151F32] rounded-2xl p-12 text-center border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                          <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] dark:bg-[#1E293B] text-[#94A3B8] flex items-center justify-center mx-auto mb-3">
                            <Calendar size={24} />
                          </div>
                          <h4 className="text-sm font-semibold text-[#17233C] dark:text-[#F8FAFC]">No active plans scheduled</h4>
                          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto mt-1 mb-4">
                            Keep your commitments on time by scheduling target dates and notification triggers.
                          </p>
                          <button
                            onClick={() => setShowPlanForm(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#315EFB] text-white hover:bg-[#274cd0] transition shadow-xs"
                          >
                            <Plus size={15} />
                            <span>Add First Plan</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}



                {activeTab === 'content' && (
                  <div className="space-y-6 max-w-7xl mx-auto pb-10">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-[#17233C] dark:text-[#F8FAFC]">Content Creation & Scripts</h2>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
                          Draft, organize and execute video roadmaps, social posts, and creative outlines.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowContentForm(!showContentForm)}
                        className="inline-flex items-center gap-2 bg-[#315EFB] hover:bg-[#274cd0] text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs self-start sm:self-auto"
                      >
                        <Plus size={16} />
                        <span>{showContentForm ? 'Close Form' : 'New Content Item'}</span>
                      </button>
                    </div>

                    {showContentForm && (
                      <div className="bg-white dark:bg-[#151F32] rounded-2xl p-6 border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                        <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] mb-4">
                          {editingContent ? 'Edit Content Item' : 'New Content Item'}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label htmlFor="content-title" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Title</label>
                            <input
                              id="content-title"
                              type="text"
                              value={contentForm.title}
                              onChange={(e) => setContentForm({ ...contentForm, title: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              placeholder="e.g., Complete Guide to Modern Web Architecture"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="content-type" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Content Type</label>
                              <select
                                id="content-type"
                                value={contentForm.type}
                                onChange={(e) => setContentForm({ ...contentForm, type: e.target.value as 'youtube' | 'instagram' | 'script' | 'roadmap', platform: e.target.value === 'youtube' ? 'youtube' : e.target.value === 'instagram' ? 'instagram' : 'general' })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm transition outline-none"
                                aria-label="Content type"
                              >
                                <option value="youtube">YouTube Video</option>
                                <option value="instagram">Instagram Reel / Post</option>
                                <option value="script">Written Script</option>
                                <option value="roadmap">Strategic Roadmap</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor="content-status" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Status</label>
                              <select
                                id="content-status"
                                value={contentForm.status}
                                onChange={(e) => setContentForm({ ...contentForm, status: e.target.value as 'draft' | 'in-progress' | 'completed' | 'published' })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm transition outline-none"
                                aria-label="Content status"
                              >
                                <option value="draft">Draft</option>
                                <option value="in-progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="published">Published</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label htmlFor="content-script" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Script / Content Outline</label>
                            <textarea
                              id="content-script"
                              value={contentForm.script}
                              onChange={(e) => setContentForm({ ...contentForm, script: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              rows={6}
                              placeholder="Write your outline, talking points, key steps or full script..."
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="content-target-date" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Target Completion Date</label>
                              <input
                                id="content-target-date"
                                type="date"
                                value={contentForm.targetDate}
                                onChange={(e) => setContentForm({ ...contentForm, targetDate: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm transition outline-none"
                                aria-label="Target date"
                              />
                            </div>
                            <div>
                              <label htmlFor="content-publish-date" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Publish Date</label>
                              <input
                                id="content-publish-date"
                                type="date"
                                value={contentForm.publishDate}
                                onChange={(e) => setContentForm({ ...contentForm, publishDate: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm transition outline-none"
                                aria-label="Publish date"
                              />
                            </div>
                          </div>
                          <div>
                            <label htmlFor="content-tags" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Tags (comma separated)</label>
                            <input
                              id="content-tags"
                              type="text"
                              value={contentForm.tags}
                              onChange={(e) => setContentForm({ ...contentForm, tags: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              placeholder="e.g., productivity, tutorial, react"
                            />
                          </div>
                          <div>
                            <label htmlFor="content-notes" className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Production Notes</label>
                            <textarea
                              id="content-notes"
                              value={contentForm.notes}
                              onChange={(e) => setContentForm({ ...contentForm, notes: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              rows={2}
                              placeholder="Extra notes or gear checklist..."
                            />
                          </div>
                          <div className="flex items-center gap-3 pt-2">
                            <button
                              onClick={editingContent ? handleUpdateContent : handleAddContent}
                              className="inline-flex items-center gap-2 bg-[#315EFB] hover:bg-[#274cd0] text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs"
                            >
                              <Save size={16} />
                              <span>{editingContent ? 'Update Item' : 'Save Content'}</span>
                            </button>
                            <button
                              onClick={() => { setShowContentForm(false); setEditingContent(null); setContentForm({ title: '', type: 'youtube', platform: 'youtube', script: '', status: 'draft', publishDate: '', targetDate: '', tags: '', notes: '' }); }}
                              className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] text-xs font-semibold transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {contents.map(content => {
                        const typeIcons = {
                          youtube: Video,
                          instagram: Image,
                          script: FileText,
                          roadmap: Play
                        };
                        const IconComponent = typeIcons[content.type] || FileText;
                        return (
                          <div
                            key={content.id}
                            className="bg-white dark:bg-[#151F32] p-5 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm hover:border-[#315EFB]/30 transition flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <div className="w-8 h-8 rounded-xl bg-[#F8FAFC] dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#22324F] flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <IconComponent className={content.type === 'youtube' ? 'text-red-500' : content.type === 'instagram' ? 'text-[#EC4899]' : 'text-[#315EFB]'} size={16} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] truncate">
                                      {content.title}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                                      <span className="capitalize">{content.type}</span>
                                      {content.targetDate && (
                                        <>
                                          <span>•</span>
                                          <span>Target: {content.targetDate}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => handleEditContent(content)}
                                    className="p-1.5 rounded-lg text-[#64748B] hover:text-[#17233C] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] dark:hover:text-[#F8FAFC] transition"
                                    aria-label="Edit content"
                                  >
                                    <Edit2 size={15} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteContent(content.id)}
                                    className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                                    aria-label="Delete content"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </div>

                              {content.script && (
                                <div className="mt-3 p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#22324F]/60 text-xs text-[#17233C] dark:text-[#F8FAFC] max-h-32 overflow-y-auto whitespace-pre-wrap">
                                  {content.script}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#E2E8F0] dark:border-[#22324F] text-xs">
                              <div className="flex flex-wrap gap-1">
                                {content.tags.slice(0, 3).map((tag, idx) => (
                                  <span key={idx} className="px-2 py-0.5 rounded-md bg-[#F1F5F9] dark:bg-[#1E293B] text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/40 text-[#315EFB] border border-blue-200 dark:border-blue-900/50">
                                {content.status}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {contents.length === 0 && (
                        <div className="md:col-span-2 bg-white dark:bg-[#151F32] rounded-2xl p-12 text-center border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                          <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] dark:bg-[#1E293B] text-[#94A3B8] flex items-center justify-center mx-auto mb-3">
                            <Video size={24} />
                          </div>
                          <h4 className="text-sm font-semibold text-[#17233C] dark:text-[#F8FAFC]">No content projects yet</h4>
                          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto mt-1 mb-4">
                            Create scripts, plan video roadmaps, or draft social media posts to grow your audience.
                          </p>
                          <button
                            onClick={() => setShowContentForm(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#315EFB] text-white hover:bg-[#274cd0] transition shadow-xs"
                          >
                            <Plus size={15} />
                            <span>Start Content Item</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'schedule' && (
                  <div className="space-y-6 max-w-7xl mx-auto pb-10">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-[#17233C] dark:text-[#F8FAFC]">Daily Schedule & Routines</h2>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
                          Design recurring weekly habits, morning rituals, and focused work blocks.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowScheduleForm(!showScheduleForm)}
                        className="inline-flex items-center gap-2 bg-[#315EFB] hover:bg-[#274cd0] text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs self-start sm:self-auto"
                      >
                        <Plus size={16} />
                        <span>{showScheduleForm ? 'Close Form' : 'Add Routine Task'}</span>
                      </button>
                    </div>

                    {showScheduleForm && (
                      <div className="bg-white dark:bg-[#151F32] rounded-2xl p-6 border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                        <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] mb-4">
                          {editingSchedule ? 'Edit Schedule Task' : 'New Schedule Task'}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Task Title</label>
                            <input
                              type="text"
                              value={scheduleForm.title}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              placeholder="e.g., Morning Deep Work Session"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Description</label>
                            <textarea
                              value={scheduleForm.description}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, description: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              rows={2}
                              placeholder="What will you focus on during this block?"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Schedule Time</label>
                              <div className="flex items-center gap-2">
                                <select
                                  value={parseTime24To12(scheduleForm.time).hour}
                                  onChange={(e) => {
                                    const newHour = parseInt(e.target.value, 10);
                                    const { minute, period } = parseTime24To12(scheduleForm.time);
                                    setScheduleForm({ ...scheduleForm, time: convert12To24(newHour, minute, period) });
                                  }}
                                  className="px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm outline-none"
                                >
                                  {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                                    <option key={h} value={h}>{h}</option>
                                  ))}
                                </select>
                                <span className="text-[#64748B] dark:text-[#94A3B8] font-bold">:</span>
                                <select
                                  value={parseTime24To12(scheduleForm.time).minute}
                                  onChange={(e) => {
                                    const { hour, period } = parseTime24To12(scheduleForm.time);
                                    setScheduleForm({ ...scheduleForm, time: convert12To24(hour, e.target.value, period) });
                                  }}
                                  className="px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm outline-none"
                                >
                                  {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                                <select
                                  value={parseTime24To12(scheduleForm.time).period}
                                  onChange={(e) => {
                                    const { hour, minute } = parseTime24To12(scheduleForm.time);
                                    setScheduleForm({ ...scheduleForm, time: convert12To24(hour, minute, e.target.value as 'AM' | 'PM') });
                                  }}
                                  className="px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm outline-none"
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Duration (minutes)</label>
                              <input
                                type="number"
                                value={scheduleForm.estimatedDuration}
                                onChange={(e) => setScheduleForm({ ...scheduleForm, estimatedDuration: e.target.value })}
                                className="w-full px-3.5 py-2 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm outline-none"
                                min="1"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Priority</label>
                              <select
                                value={scheduleForm.priority}
                                onChange={(e) => setScheduleForm({ ...scheduleForm, priority: e.target.value as 'low' | 'medium' | 'high' })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm outline-none"
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Category</label>
                              <input
                                type="text"
                                value={scheduleForm.category}
                                onChange={(e) => setScheduleForm({ ...scheduleForm, category: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] placeholder-[#94A3B8] text-sm outline-none"
                                placeholder="e.g., Deep Work, Health, Reading"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-2">Repeats On Days</label>
                            <div className="flex flex-wrap gap-2">
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                                <button
                                  key={index}
                                  type="button"
                                  onClick={() => {
                                    const days = scheduleForm.dayOfWeek.includes(index)
                                      ? scheduleForm.dayOfWeek.filter(d => d !== index)
                                      : [...scheduleForm.dayOfWeek, index];
                                    setScheduleForm({ ...scheduleForm, dayOfWeek: days });
                                  }}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${scheduleForm.dayOfWeek.includes(index)
                                    ? 'bg-[#315EFB] text-white border-[#315EFB] shadow-xs'
                                    : 'bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] border-[#E2E8F0] dark:border-[#22324F] hover:border-[#315EFB]/40'
                                    }`}
                                >
                                  {day}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 pt-2">
                            <button
                              onClick={editingSchedule ? handleUpdateSchedule : handleAddSchedule}
                              className="inline-flex items-center gap-2 bg-[#315EFB] hover:bg-[#274cd0] text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs"
                            >
                              <Save size={16} />
                              <span>{editingSchedule ? 'Update Task' : 'Save Task'}</span>
                            </button>
                            <button
                              onClick={() => { setShowScheduleForm(false); setEditingSchedule(null); setScheduleForm({ title: '', description: '', time: '', dayOfWeek: [], priority: 'medium', category: 'general', estimatedDuration: '30' }); }}
                              className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] text-xs font-semibold transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {scheduleTasks.map(schedule => (
                        <div
                          key={schedule.id}
                          className="bg-white dark:bg-[#151F32] p-5 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm hover:border-[#315EFB]/30 transition flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] truncate">
                                    {schedule.title}
                                  </h3>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${schedule.priority === 'high'
                                      ? 'bg-red-50 dark:bg-red-950/40 text-[#DC2626] border border-red-200 dark:border-red-900/60'
                                      : schedule.priority === 'medium'
                                        ? 'bg-amber-50 dark:bg-amber-950/40 text-[#D97706] border border-amber-200 dark:border-amber-900/60'
                                        : 'bg-blue-50 dark:bg-blue-950/40 text-[#315EFB] border border-blue-200 dark:border-blue-900/60'
                                      }`}
                                  >
                                    {schedule.priority}
                                  </span>
                                </div>
                                {schedule.description && (
                                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mb-2">
                                    {schedule.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => handleEditSchedule(schedule)}
                                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#17233C] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] dark:hover:text-[#F8FAFC] transition"
                                  aria-label="Edit schedule"
                                >
                                  <Edit2 size={15} />
                                </button>
                                <button
                                  onClick={() => handleDeleteSchedule(schedule.id)}
                                  className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                                  aria-label="Delete schedule"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#22324F] flex flex-col gap-2">
                            <div className="flex items-center justify-between text-xs text-[#64748B] dark:text-[#94A3B8]">
                              <span className="font-semibold text-[#17233C] dark:text-[#F8FAFC]">
                                🕐 {formatTime12Hour(schedule.time)} ({schedule.estimatedDuration} min)
                              </span>
                              <span className="capitalize">{schedule.category}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                                schedule.dayOfWeek.includes(index) && (
                                  <span key={index} className="px-2 py-0.5 rounded-md bg-[#F1F5F9] dark:bg-[#1E293B] text-[10px] font-medium text-[#315EFB]">
                                    {day}
                                  </span>
                                )
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}

                      {scheduleTasks.length === 0 && (
                        <div className="md:col-span-2 bg-white dark:bg-[#151F32] rounded-2xl p-12 text-center border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                          <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] dark:bg-[#1E293B] text-[#94A3B8] flex items-center justify-center mx-auto mb-3">
                            <ListTodo size={24} />
                          </div>
                          <h4 className="text-sm font-semibold text-[#17233C] dark:text-[#F8FAFC]">No schedule routines defined</h4>
                          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto mt-1 mb-4">
                            Create scheduled routines that repeat on chosen days of the week to populate your daily focus automatically.
                          </p>
                          <button
                            onClick={() => setShowScheduleForm(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#315EFB] text-white hover:bg-[#274cd0] transition shadow-xs"
                          >
                            <Plus size={15} />
                            <span>Add First Scheduled Task</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'analysis' && (
                  <div className="space-y-6 max-w-7xl mx-auto pb-10">
                    <div className="bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                      <h2 className="text-xl font-bold tracking-tight text-[#17233C] dark:text-[#F8FAFC]">Insights & Performance Analysis</h2>
                      <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
                        Track completion accuracy, weekly adherence trends, and growth metrics.
                      </p>
                    </div>

                    {/* Perfection Meter Card */}
                    <div className="bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] flex items-center gap-2">
                          <BarChart3 size={18} className="text-[#315EFB]" />
                          <span>Perfection & Consistency Index</span>
                        </h3>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#315EFB] border border-blue-200 dark:border-blue-900/50">
                          Rolling 7-Day Window
                        </span>
                      </div>

                      <div className="flex items-center justify-center my-6">
                        <div className="relative w-44 h-44">
                          <svg className="w-44 h-44 transform -rotate-90">
                            <circle
                              cx="88"
                              cy="88"
                              r="72"
                              stroke="currentColor"
                              strokeWidth="12"
                              fill="transparent"
                              className="text-[#E2E8F0] dark:text-[#1E293B]"
                            />
                            <circle
                              cx="88"
                              cy="88"
                              r="72"
                              stroke="url(#analysisGradient)"
                              strokeWidth="12"
                              strokeLinecap="round"
                              fill="transparent"
                              strokeDasharray={`${(calculatePerfection() / 100) * 452.4} 452.4`}
                              className="transition-all duration-700 ease-out"
                            />
                            <defs>
                              <linearGradient id="analysisGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#315EFB" />
                                <stop offset="60%" stopColor="#7857E8" />
                                <stop offset="100%" stopColor="#EC4899" />
                              </linearGradient>
                            </defs>
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                            <div className="text-3xl font-extrabold tracking-tight text-[#17233C] dark:text-[#F8FAFC]">
                              {calculatePerfection()}%
                            </div>
                            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                              Adherence
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#E2E8F0] dark:border-[#22324F]">
                        <div className="p-4 rounded-xl bg-green-50/60 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 text-center">
                          <div className="text-2xl font-bold text-[#16A34A]">
                            {dailyTasks.filter(t => t.completed).length}
                          </div>
                          <div className="text-xs font-medium text-[#16A34A] mt-1">Completed Tasks</div>
                        </div>
                        <div className="p-4 rounded-xl bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-center">
                          <div className="text-2xl font-bold text-[#DC2626]">
                            {dailyTasks.filter(t => t.missed).length}
                          </div>
                          <div className="text-xs font-medium text-[#DC2626] mt-1">Missed Tasks</div>
                        </div>
                        <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-center">
                          <div className="text-2xl font-bold text-[#315EFB]">
                            {dailyTasks.length}
                          </div>
                          <div className="text-xs font-medium text-[#315EFB] mt-1">Total Tracked</div>
                        </div>
                      </div>
                    </div>

                    {/* 7-Day Performance Breakdown */}
                    <div className="bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                      <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] mb-4">
                        Past 7 Days History
                      </h3>
                      <div className="space-y-2.5">
                        {(() => {
                          const last7Days: string[] = [];
                          for (let i = 6; i >= 0; i--) {
                            const date = new Date();
                            date.setDate(date.getDate() - i);
                            last7Days.push(date.toISOString().split('T')[0]);
                          }
                          return last7Days.map(date => {
                            const dayTasks = dailyTasks.filter(t => t.date === date);
                            const completed = dayTasks.filter(t => t.completed).length;
                            const total = dayTasks.length;
                            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
                            const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
                            const dayDate = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                            return (
                              <div
                                key={date}
                                className="flex items-center justify-between p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#22324F]/60"
                              >
                                <div className="flex items-center gap-3 w-28">
                                  <span className="text-xs font-bold text-[#17233C] dark:text-[#F8FAFC]">{dayName}</span>
                                  <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">{dayDate}</span>
                                </div>
                                <div className="flex items-center gap-3 flex-1 max-w-sm">
                                  <div className="flex-1 bg-[#E2E8F0] dark:bg-[#22324F] h-2 rounded-full overflow-hidden">
                                    <div
                                      className={`h-2 rounded-full transition-all duration-300 ${percentage === 100 ? 'bg-[#16A34A]' : percentage >= 50 ? 'bg-[#F97316]' : 'bg-[#315EFB]'
                                        }`}
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-mono font-medium text-[#17233C] dark:text-[#F8FAFC] w-14 text-right">
                                    {completed}/{total}
                                  </span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className="space-y-6 max-w-7xl mx-auto pb-10">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-[#151F32] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-[#17233C] dark:text-[#F8FAFC]">Manual Notes & Ideas</h2>
                        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
                          Quickly jot reflections, meeting notes, project plans, and insights.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowNoteForm(!showNoteForm)}
                        className="inline-flex items-center gap-2 bg-[#315EFB] hover:bg-[#274cd0] text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs self-start sm:self-auto"
                      >
                        <Plus size={16} />
                        <span>{showNoteForm ? 'Close Form' : 'New Note'}</span>
                      </button>
                    </div>

                    {showNoteForm && (
                      <div className="bg-white dark:bg-[#151F32] rounded-2xl p-6 border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                        <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] mb-4">
                          {editingNote ? 'Edit Note' : 'Create New Note'}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Note Title</label>
                            <input
                              type="text"
                              value={noteForm.title}
                              onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              placeholder="e.g., Weekly Retrospective"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Content</label>
                            <textarea
                              value={noteForm.content}
                              onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] focus:border-[#315EFB] focus:ring-2 focus:ring-[#315EFB]/20 bg-[#F8FAFC] text-[#17233C] placeholder-[#94A3B8] text-sm transition outline-none"
                              rows={6}
                              placeholder="Write your thoughts or action points..."
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Category</label>
                              <input
                                type="text"
                                value={noteForm.category}
                                onChange={(e) => setNoteForm({ ...noteForm, category: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] text-sm outline-none"
                                placeholder="e.g., Ideas, Architecture, Personal"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-[#17233C] dark:text-[#F8FAFC] mb-1.5">Tags (comma separated)</label>
                              <input
                                type="text"
                                value={noteForm.tags}
                                onChange={(e) => setNoteForm({ ...noteForm, tags: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] focus:border-[#315EFB] bg-[#F8FAFC] dark:bg-[#1E293B] text-[#17233C] dark:text-[#F8FAFC] placeholder-[#94A3B8] text-sm outline-none"
                                placeholder="e.g., design, priorities"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-3 pt-2">
                            <button
                              onClick={editingNote ? handleUpdateNote : handleAddNote}
                              className="inline-flex items-center gap-2 bg-[#315EFB] hover:bg-[#274cd0] text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs"
                            >
                              <Save size={16} />
                              <span>{editingNote ? 'Update Note' : 'Save Note'}</span>
                            </button>
                            <button
                              onClick={() => { setShowNoteForm(false); setEditingNote(null); setNoteForm({ title: '', content: '', category: 'general', tags: '' }); }}
                              className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-[#22324F] text-[#64748B] dark:text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] text-xs font-semibold transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {manualNotes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map(note => (
                        <div
                          key={note.id}
                          className="bg-white dark:bg-[#151F32] p-5 rounded-2xl border border-[#E2E8F0] dark:border-[#22324F] shadow-sm hover:border-[#315EFB]/30 transition flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="min-w-0 flex-1">
                                <h3 className="text-base font-bold text-[#17233C] dark:text-[#F8FAFC] truncate">
                                  {note.title}
                                </h3>
                                <div className="flex items-center gap-2 mt-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                                  <span className="px-2 py-0.5 rounded-md bg-[#F1F5F9] dark:bg-[#1E293B] font-medium text-[11px]">
                                    {note.category}
                                  </span>
                                  <span>•</span>
                                  <span>{new Date(note.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => handleEditNote(note)}
                                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#17233C] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] dark:hover:text-[#F8FAFC] transition"
                                  aria-label="Edit note"
                                >
                                  <Edit2 size={15} />
                                </button>
                                <button
                                  onClick={() => handleDeleteNote(note.id)}
                                  className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                                  aria-label="Delete note"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] whitespace-pre-wrap mt-3 line-clamp-4">
                              {note.content}
                            </p>
                          </div>

                          {note.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-3 mt-3 border-t border-[#E2E8F0] dark:border-[#22324F]">
                              {note.tags.map((tag, idx) => (
                                <span key={idx} className="px-2 py-0.5 rounded-md bg-[#F1F5F9] dark:bg-[#1E293B] text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {manualNotes.length === 0 && (
                        <div className="md:col-span-2 bg-white dark:bg-[#151F32] rounded-2xl p-12 text-center border border-[#E2E8F0] dark:border-[#22324F] shadow-sm">
                          <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] dark:bg-[#1E293B] text-[#94A3B8] flex items-center justify-center mx-auto mb-3">
                            <StickyNote size={24} />
                          </div>
                          <h4 className="text-sm font-semibold text-[#17233C] dark:text-[#F8FAFC]">No notes saved</h4>
                          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto mt-1 mb-4">
                            Create flexible personal notes, ideas, meeting logs, or reminders.
                          </p>
                          <button
                            onClick={() => setShowNoteForm(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#315EFB] text-white hover:bg-[#274cd0] transition shadow-xs"
                          >
                            <Plus size={15} />
                            <span>Write First Note</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'budget' && (
                  <BudgetPlanner user={user} theme={theme} />
                )}
              </main>
            </div>

            {/* Chatbot Floating Button & Window */}
            <div className="fixed bottom-6 right-6 z-50">
              {chatbotOpen ? (
                <div className="bg-white dark:bg-gray-800  shadow-2xl w-96 h-[600px] flex flex-col border border-gray-200 dark:border-gray-700">
                  {/* Chat Header */}
                  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-700 dark:to-purple-700 text-white p-4  flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10  bg-white/20 flex items-center justify-center">
                        <Bot size={24} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">MyMate Assistant</h3>
                        <div className="flex items-center gap-2">
                          <p className="text-xs opacity-90">Your personal coach</p>
                          <div className="flex items-center gap-1">
                            {ollamaAvailable ? (
                              <>
                                <Wifi size={12} className="text-green-300" />
                                <span className="text-xs opacity-75">AI Powered</span>
                              </>
                            ) : (
                              <>
                                <WifiOff size={12} className="text-yellow-300" />
                                <span className="text-xs opacity-75">Basic Mode</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setChatbotOpen(false)}
                      className="p-2 hover:bg-white/20  transition-colors"
                      aria-label="Close chat"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Chat Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%]  p-3 ${message.isUser
                            ? 'bg-[#6C2BEF] dark:bg-[#5A1FD8] text-white'
                            : 'bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 border border-gray-200 dark:border-gray-600'
                            }`}
                        >
                          {!message.isUser && (
                            <div className="flex items-center gap-2 mb-1">
                              <Bot size={16} className="text-indigo-600" />
                              <span className="text-xs font-semibold text-indigo-600">Assistant</span>
                            </div>
                          )}
                          <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                          <span className={`text-xs mt-1 block ${message.isUser ? 'text-indigo-100' : 'text-gray-400'}`}>
                            {formatTime12Hour(new Date(message.timestamp).toTimeString().split(' ')[0])}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Chat Input */}
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-xl">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !isLoadingResponse) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder={isLoadingResponse ? "AI is thinking..." : "Type your message..."}
                        disabled={isLoadingResponse}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 disabled:bg-gray-100 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!chatInput.trim() || isLoadingResponse}
                        className="px-4 py-2 bg-[#6C2BEF] text-white  hover:bg-[#5A1FD8] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                        aria-label="Send message"
                      >
                        {isLoadingResponse ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent  animate-spin" />
                        ) : (
                          <Send size={20} />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                      Ask about your tasks, goals, skills, reflections, or performance
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setChatbotOpen(true)}
                  className="w-14 h-14 bg-gradient-to-r from-indigo-600 to-purple-600 text-white  shadow-lg hover:shadow-xl transition-all hover:scale-110 flex items-center justify-center"
                  aria-label="Open chatbot"
                >
                  <MessageCircle size={28} />
                </button>
              )}
            </div>
          </div>
        </>
        );
};


const MYMateWithErrorBoundary = () => (
        <ErrorBoundary>
          <MYMate />
        </ErrorBoundary>
        );

        export default MYMateWithErrorBoundary;
