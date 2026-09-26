import React, { useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';
import { generateOllamaResponse, checkOllamaConnection, type UserContext } from './ollama';
import { generateGroqResponse, checkGroqConnection, formatRAGContext } from './groq';
import { indexUserData, semanticSearch } from './vector-db';
import { saveToFirestore, loadFromFirestore, migrateLocalStorageToFirestore, hasUserMigrated } from './firestore-helpers';
import { Plus, Target, Clock, TrendingUp, BookOpen, Download, Menu, X, CheckCircle, Circle, Edit2, Trash2, Save, Calendar, Video, Image, FileText, Play, Flame, ListTodo, BarChart3, StickyNote, MessageCircle, Send, Bot, Wifi, WifiOff, User, Moon, Sun, Wallet } from 'lucide-react';
import BudgetPlanner from './components/BudgetPlanner';
import SkillsTracker from './components/skills/SkillsTracker';
import ProfileDashboard from './components/profile/ProfileDashboard';
import type { SkillTopic } from './types/skill';

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
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<number | null>(null);
  const [goalForm, setGoalForm] = useState({ title: '', description: '', category: 'career', targetDate: '', status: 'in-progress' });
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillTopics, setSkillTopics] = useState<SkillTopic[]>([]);

  const [deadlinePlans, setDeadlinePlans] = useState<DeadlinePlan[]>([]);
  const [showPlanForm, setShowPlanForm] = useState(false);
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
  const [groqAvailable, setGroqAvailable] = useState(false);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('mymate-theme');
    return savedTheme === 'dark' ? 'dark' : 'light';
  });
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [showCelebration, setShowCelebration] = useState(false);
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

  // Load user session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        setShowAuth(false);
      } catch (error) {
        console.error('Error loading saved user:', error);
      }
    }
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
      const [ollamaStatus, groqStatus] = await Promise.all([
        checkOllamaConnection(),
        user ? checkGroqConnection(user.id) : Promise.resolve(false),
      ]);
      if (!isCurrent) return;
      setOllamaAvailable(ollamaStatus);
      setGroqAvailable(groqStatus);
    };
    void checkAIServices();
    return () => { isCurrent = false; };
  }, [user]);

  // Index user data for RAG when data loads
  useEffect(() => {
    if (user && (goals.length > 0 || skills.length > 0 || manualNotes.length > 0 || dailyTasks.length > 0)) {
      indexUserData(user.id, {
        goals: goals.map(g => ({
          id: g.id,
          title: g.title,
          description: g.description,
          category: g.category,
          status: g.status,
          progress: g.progress
        })),
        tasks: dailyTasks.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description,
          category: t.category,
          completed: t.completed,
          priority: t.priority
        })),
        notes: manualNotes.map(n => ({
          id: n.id,
          title: n.title,
          content: n.content,
          category: n.category,
          tags: n.tags
        })),
        skills: skills.map(s => ({
          id: s.id,
          name: s.name,
          level: s.level,
          hoursInvested: s.hoursInvested,
          targetHours: s.targetHours
        }))
      }).catch(error => {
        console.error('Error indexing user data for RAG:', error);
      });
    }
  }, [user, goals, skills, manualNotes, dailyTasks]);

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
      setShowCelebration(true);
      // Auto-hide after 5 seconds
      setTimeout(() => {
        setShowCelebration(false);
      }, 5000);
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
      const conversationHistory = chatMessages.slice(-10).map(msg => ({
        role: msg.isUser ? 'user' as const : 'assistant' as const,
        content: msg.text
      }));

      // Try Groq with RAG first if available
      if (groqAvailable && user) {
        try {
          // Perform semantic search to get relevant context
          const relevantDocs = await semanticSearch(user.id, messageText, 5);
          const ragContext = formatRAGContext(relevantDocs, messageText);
          
          botResponseText = await generateGroqResponse(messageText, ragContext, conversationHistory);
        } catch (groqError) {
          console.error('Groq error, falling back to Ollama:', groqError);
          
          // Try Ollama as fallback
          if (ollamaAvailable) {
            try {
              const context = getUserContext();
              botResponseText = await generateOllamaResponse(messageText, context);
            } catch (ollamaError) {
              console.error('Ollama error, falling back to rule-based:', ollamaError);
              botResponseText = generateChatResponse(messageText);
            }
          } else {
            // Use rule-based response
            botResponseText = generateChatResponse(messageText);
          }
        }
      } else if (ollamaAvailable) {
        // Try Ollama if Groq is not available
        try {
          const context = getUserContext();
          botResponseText = await generateOllamaResponse(messageText, context);
        } catch (ollamaError) {
          console.error('Ollama error, falling back to rule-based:', ollamaError);
          botResponseText = generateChatResponse(messageText);
        }
      } else {
        // Use rule-based response
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

  // Generate unique user ID from email
  const generateUserId = (email: string): string => {
    // Create a unique ID by replacing special characters in email
    // This ensures each email gets its own data storage
    return email.toLowerCase().replace(/[^a-z0-9]/g, '_');
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const userId = generateUserId(authForm.email);
    const mockUser: User = { id: userId, email: authForm.email, name: authForm.name || 'Career Tracker' };
    setUser(mockUser);
    // Save user session to localStorage
    localStorage.setItem('currentUser', JSON.stringify(mockUser));
    setShowAuth(false);
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
      localStorage.setItem('currentUser', JSON.stringify(appUser));
      setShowAuth(false);
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      setAuthError(error.message || 'Failed to sign in with Google. Please try again.');
    }
  };

  const handleLogout = () => {
    // Clear user session from localStorage
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
      // Reset celebration when date changes
      setShowCelebration(false);
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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center bg-no-repeat p-4" style={{ backgroundImage: "linear-gradient(rgba(206, 206, 209, 0.48), rgba(237, 238, 243, 0.48)), url('/Login%20Page%20Background.png')" }}>
        <div className="absolute inset-0 bg-slate-950/20" aria-hidden="true" />
        <div className="relative z-10 w-full max-w-md bg-white/95 p-8 shadow-2xl backdrop-blur-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <img
                src="/mymate-logo.png"
                alt="MyMate logo"
                className="w-32 h-32 "
              />
            </div>
            <p className="text-gray-600 dark:text-gray-300">Your Personal Career Tracker</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'signup' && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Name</label>
                <input
                  id="name"
                  type="text"
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  required={authMode === 'signup'}
                  placeholder="Enter your name"
                  aria-label="Name"
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Email</label>
              <input
                id="email"
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                required
                placeholder="Enter your email"
                aria-label="Email"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Password</label>
              <input
                id="password"
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                required
                placeholder="Enter your password"
                aria-label="Password"
              />
            </div>
            <button type="submit" className="w-full bg-[#6C2BEF] dark:bg-[#5A1FD8] text-white py-2  hover:bg-[#5A1FD8] dark:hover:bg-[#6C2BEF] font-medium">{authMode === 'login' ? 'Login' : 'Sign Up'}</button>
          </form>

          {/* Auth error message */}
          {authError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400 text-center">{authError}</p>
          )}

          {/* Divider */}
          <div className="flex items-center my-4">
            <div className="flex-grow border-t border-gray-200 dark:border-gray-700" />
            <span className="mx-2 text-gray-400 dark:text-gray-500 text-xs uppercase">or</span>
            <div className="flex-grow border-t border-gray-200 dark:border-gray-700" />
          </div>

          {/* Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 py-2  hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium text-[#172554] dark:text-gray-300"
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google logo"
              className="w-5 h-5"
            />
            <span>Continue with Google</span>
          </button>

          <div className="text-center mt-4">
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-indigo-600 dark:text-[#6C2BEF] hover:text-indigo-700 dark:hover:text-indigo-300 text-sm">{authMode === 'login' ? 'Need an account? Sign up' : 'Have an account? Login'}</button>
          </div>
        </div>
      </div>
    );
  }

  // Celebration Component
  const CelebrationOverlay = () => {
    if (!showCelebration) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        {/* Confetti/Spray Effect */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(100)].map((_, i) => {
            const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const left = Math.random() * 100;
            const delay = Math.random() * 2;
            const duration = 2 + Math.random() * 2;
            const size = 8 + Math.random() * 12;

            return (
              <div
                key={i}
                className="absolute "
                style={{
                  left: `${left}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  backgroundColor: color,
                  animation: `confetti-fall ${duration}s ease-out ${delay}s forwards`,
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              />
            );
          })}
        </div>

        {/* Crackers/Sparkles Effect */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(50)].map((_, i) => {
            const left = Math.random() * 100;
            const top = Math.random() * 100;
            const delay = Math.random() * 1.5;
            const duration = 1 + Math.random() * 1.5;
            const size = 4 + Math.random() * 8;

            return (
              <div
                key={i}
                className="absolute "
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  backgroundColor: '#FFD700',
                  boxShadow: `0 0 ${size * 2}px #FFD700, 0 0 ${size * 3}px #FFD700`,
                  animation: `sparkle ${duration}s ease-out ${delay}s forwards`,
                }}
              />
            );
          })}
        </div>

        {/* Celebration Message */}
        <div className="relative z-10 text-center pointer-events-auto">
          <div className="bg-gradient-to-r from-[#FF9D24] via-[#F43F72] to-[#F43F72] text-white px-12 py-8  shadow-2xl transform animate-bounce">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-4xl font-bold mb-2">Congratulations!</h2>
            <p className="text-2xl">You've completed all tasks for today!</p>
            <p className="text-xl mt-2 opacity-90">Amazing work! 🚀</p>
          </div>
        </div>

        {/* CSS Animations and Theme Styles */}
        <style>{`
          @keyframes confetti-fall {
            0% {
              transform: translateY(-100vh) rotate(0deg);
              opacity: 1;
            }
            100% {
              transform: translateY(100vh) rotate(720deg);
              opacity: 0;
            }
          }
          
          @keyframes sparkle {
            0%, 100% {
              transform: scale(0) rotate(0deg);
              opacity: 1;
            }
            50% {
              transform: scale(1.5) rotate(180deg);
              opacity: 0.8;
            }
          }

          /* Productive/Scifi Theme Styles */
          .productive {
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

          .productive body {
            background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0a0e27 100%);
            color: #00f0ff;
          }

          .productive .min-h-screen {
            background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0a0e27 100%);
            position: relative;
          }

          .productive .min-h-screen::before {
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

          .productive .bg-white {
            background: rgba(18, 24, 48, 0.95) !important;
            border: 1px solid rgba(0, 240, 255, 0.2);
            box-shadow: 0 0 20px rgba(0, 240, 255, 0.1);
          }

          .productive .bg-gray-50 {
            background: rgba(15, 20, 40, 0.9) !important;
            border: 1px solid rgba(0, 240, 255, 0.15);
          }

          .productive .bg-gray-100 {
            background: rgba(18, 24, 48, 0.8) !important;
            border: 1px solid rgba(0, 240, 255, 0.2);
          }

          .productive .bg-gray-200 {
            background: rgba(0, 240, 255, 0.1) !important;
          }

          .productive .bg-gray-800 {
            background: rgba(18, 24, 48, 0.95) !important;
            border: 1px solid rgba(0, 240, 255, 0.2);
          }

          .productive .bg-gray-900 {
            background: rgba(10, 14, 39, 0.98) !important;
          }

          .productive .bg-gray-700 {
            background: rgba(26, 31, 58, 0.9) !important;
            border: 1px solid rgba(0, 240, 255, 0.15);
          }

          .productive .text-gray-800,
          .productive .text-gray-700,
          .productive .text-gray-900,
          .productive .text-[#172554] {
            color: #00f0ff !important;
            text-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
          }

          .productive .text-gray-600,
          .productive .text-gray-500 {
            color: #a0aec0 !important;
          }

          .productive .text-gray-400,
          .productive .text-gray-300 {
            color: #718096 !important;
          }

          .productive .border-gray-200,
          .productive .border-gray-300 {
            border-color: rgba(0, 240, 255, 0.3) !important;
          }

          .productive .border-gray-600,
          .productive .border-gray-700 {
            border-color: rgba(0, 240, 255, 0.2) !important;
          }

          .productive .shadow-md,
          .productive .shadow-lg,
          .productive .shadow-xl {
            box-shadow: 0 0 30px rgba(0, 240, 255, 0.2), 0 0 60px rgba(139, 92, 246, 0.1) !important;
          }

          .productive .shadow {
            box-shadow: 0 0 20px rgba(0, 240, 255, 0.15) !important;
          }

          .productive button {
            transition: all 0.3s ease;
          }

          .productive button:hover {
            box-shadow: 0 0 20px rgba(0, 240, 255, 0.5);
          }

          .productive input,
          .productive textarea,
          .productive select {
            background: rgba(18, 24, 48, 0.9) !important;
            border: 1px solid rgba(0, 240, 255, 0.3) !important;
            color: #00f0ff !important;
          }

          .productive input:focus,
          .productive textarea:focus,
          .productive select:focus {
            border-color: #00f0ff !important;
            box-shadow: 0 0 15px rgba(0, 240, 255, 0.5) !important;
          }

          .productive .bg-gradient-to-r {
            background: linear-gradient(90deg, rgba(0, 240, 255, 0.2), rgba(139, 92, 246, 0.2), rgba(244, 63, 114, 0.2)) !important;
          }

          .productive .bg-gradient-to-br {
            background: linear-gradient(135deg, rgba(0, 240, 255, 0.15), rgba(139, 92, 246, 0.15)) !important;
          }

          /* Neon glow effects for specific elements */
          .productive .bg-[#6C2BEF] {
            background: linear-gradient(135deg, #00f0ff, #8b5cf6) !important;
            box-shadow: 0 0 20px rgba(0, 240, 255, 0.5), 0 0 40px rgba(139, 92, 246, 0.3) !important;
          }

          .productive .bg-[#5A1FD8] {
            background: linear-gradient(135deg, #8b5cf6, #6C2BEF) !important;
            box-shadow: 0 0 20px rgba(139, 92, 246, 0.5) !important;
          }

          .productive .bg-[#4816C7] {
            background: linear-gradient(135deg, #6C2BEF, #4816C7) !important;
          }

          .productive .bg-[#3610B6] {
            background: linear-gradient(180deg, #0a0e27, #1a1f3a) !important;
            border: 1px solid rgba(0, 240, 255, 0.3);
          }

          /* Sidebar in productive mode */
          .productive .bg-\[\#3610B6\] {
            background: linear-gradient(180deg, rgba(10, 14, 39, 0.98), rgba(26, 31, 58, 0.95)) !important;
            border-right: 1px solid rgba(0, 240, 255, 0.3);
            box-shadow: 0 0 30px rgba(0, 240, 255, 0.1);
          }

          /* Header in productive mode */
          .productive header {
            background: rgba(10, 14, 39, 0.95) !important;
            border-bottom: 1px solid rgba(0, 240, 255, 0.3) !important;
            box-shadow: 0 0 20px rgba(0, 240, 255, 0.1);
          }

          /* Progress bars in productive mode */
          .productive .bg-green-500 {
            background: linear-gradient(90deg, #00f0ff, #10b981) !important;
            box-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
          }

          .productive .bg-yellow-500 {
            background: linear-gradient(90deg, #f59e0b, #f43f72) !important;
            box-shadow: 0 0 10px rgba(245, 158,  11, 0.5);
          }

          .productive .bg-red-500 {
            background: linear-gradient(90deg, #f43f72, #ef4444) !important;
            box-shadow: 0 0 10px rgba(244, 63, 114, 0.5);
          }

          /* Scrollbar styling for productive theme */
          .productive ::-webkit-scrollbar {
            width: 8px;
          }

          .productive ::-webkit-scrollbar-track {
            background: rgba(10, 14, 39, 0.5);
          }

          .productive ::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, #00f0ff, #8b5cf6);
            border-radius: 4px;
          }

          .productive ::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, #8b5cf6, #f43f72);
          }
        `}</style>
      </div>
    );
  };

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

      <div className="flex h-screen min-h-0 w-full overflow-hidden bg-gray-50 dark:bg-gray-900">
      <CelebrationOverlay />
      {sidebarOpen && <button type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-slate-950/45 md:hidden" />}
      <div className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-hidden bg-[#3610B6] text-white transition-[transform,width] duration-250 ease-in-out md:relative md:inset-auto md:h-full md:flex-shrink-0 ${sidebarOpen ? 'translate-x-0 md:w-64' : '-translate-x-full md:translate-x-0 md:w-16'}`}>
        <div className={`${sidebarOpen ? 'p-6' : 'p-3'} flex-1 overflow-y-auto`}>
          <div className={`mb-8 flex items-center ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="/mymate-logo.png"
                alt="MyMate logo"
                className="h-10 w-10 shrink-0 rounded bg-white object-contain p-1"
              />
              {sidebarOpen && <h1 className="text-2xl font-bold">MyMate</h1>}
            </div>
            {sidebarOpen && <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" title="Close navigation" className="rounded-md p-2 text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white md:hidden"><X size={19} /></button>}
          </div>
          <nav className="space-y-2">
            {[
              { id: 'dashboard', icon: TrendingUp, label: 'Dashboard' },
              { id: 'schedule', icon: ListTodo, label: 'Daily Schedule' },
              { id: 'goals', icon: Target, label: 'Goals' },
              { id: 'skills', icon: BookOpen, label: 'Track sheet' },
              { id: 'planner', icon: Calendar, label: 'Planner' },
              { id: 'budget', icon: Wallet, label: 'Budget Planner' },
              { id: 'content', icon: Video, label: 'Content Creation' },
              { id: 'notes', icon: StickyNote, label: 'Manual Notes' },
              { id: 'analysis', icon: BarChart3, label: 'Analysis' }
            ].map(item => (
              <button key={item.id} type="button" title={item.label} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => { setActiveTab(item.id); if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false); }} className={`flex w-full items-center gap-3 rounded-md py-3 transition-colors ${sidebarOpen ? 'justify-start px-4' : 'justify-center px-2'} ${activeTab === item.id ? 'bg-[#5A1FD8] text-white' : 'hover:bg-[#4816C7] hover:text-white'}`}>
                <item.icon size={20} />
                <span className={sidebarOpen ? '' : 'md:hidden'}>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className={`border-t border-white/20 ${sidebarOpen ? 'p-3' : 'p-2'}`}>
          <button type="button" title="Profile" aria-current={activeTab === 'profile' ? 'page' : undefined} onClick={() => { setActiveTab('profile'); if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false); }} className={`flex w-full items-center gap-3 rounded-md py-3 transition-colors ${sidebarOpen ? 'justify-start px-4' : 'justify-center px-2'} ${activeTab === 'profile' ? 'bg-[#5A1FD8] text-white' : 'hover:bg-[#4816C7] hover:text-white'}`}>
            <User size={20} />
            <span className={sidebarOpen ? '' : 'md:hidden'}>Profile</span>
          </button>
        </div>
      </div>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="bg-white dark:bg-gray-800 shadow-sm px-4 py-3 flex items-center justify-between flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-md p-2 text-[#172554] transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600 dark:text-gray-200 dark:hover:bg-gray-700"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Open navigation'}
              aria-expanded={sidebarOpen}
              title={sidebarOpen ? 'Collapse sidebar' : 'Open navigation'}
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Center Top Remaining Time in Day */}
          <div className="flex-1 flex justify-center pointer-events-none">
            {(() => {
              const timeRemaining = getTimeRemainingInDay();
              return (
                <div className="inline-flex items-baseline gap-2 px-5 py-2  bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md pointer-events-auto">
                  <Clock size={18} className="opacity-80" />
                  <span className="text-lg font-semibold tracking-wide tabular-nums font-mono">
                    {String(timeRemaining.hours).padStart(2, '0')}:
                    {String(timeRemaining.minutes).padStart(2, '0')}:
                    {String(timeRemaining.seconds).padStart(2, '0')}
                  </span>
                </div>
              );
            })()}
          </div>

          <div className="flex items-center gap-4">
            {/* Daily Streak Icon */}
            {user && streak.currentStreak > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30  border border-orange-200 dark:border-orange-800">
                <Flame className="text-[#FF9D24] dark:text-orange-400" size={24} fill="currentColor" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">{streak.currentStreak}</span>
                  <span className="text-xs text-[#FF9D24] dark:text-orange-400">Day Streak</span>
                </div>
              </div>
            )}
            <div className="text-gray-600 dark:text-gray-300">Welcome, {user && user.name}</div>

            <button
              type="button"
              onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}
              className="rounded-md p-2 text-[#172554] transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-gray-200 dark:hover:bg-gray-700"
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            {/* Profile Icon with Dropdown */}
            {user && (
              <div className="relative">
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700  transition-colors flex items-center justify-center"
                  aria-label="Profile menu"
                >
                  <div className="w-10 h-10  bg-[#6C2BEF] dark:bg-[#6C2BEF] text-white flex items-center justify-center font-semibold">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                </button>

                {/* Profile Dropdown Menu */}
                {profileMenuOpen && (
                  <>
                    {/* Backdrop to close menu on outside click */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setProfileMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800  shadow-xl border border-gray-200 dark:border-gray-700 z-20">
                      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <p className="font-semibold text-[#172554] dark:text-gray-200">{user.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                      </div>
                      <div className="py-2">
                        <button
                          type="button"
                          onClick={() => { setActiveTab('profile'); setProfileMenuOpen(false); }}
                          className="flex w-full items-center space-x-3 px-4 py-3 text-left transition-colors hover:bg-orange-50 dark:hover:bg-gray-700"
                        >
                          <User size={20} className="text-orange-700 dark:text-orange-300" />
                          <span className="text-[#172554] dark:text-gray-300">View profile</span>
                        </button>
                        <button
                          onClick={() => {
                            handleExport();
                            setProfileMenuOpen(false);
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                          aria-label="Export data"
                        >
                          <Download size={20} className="text-gray-600 dark:text-gray-400" />
                          <span className="text-[#172554] dark:text-gray-300">Export Data</span>
                        </button>
                        <button
                          onClick={() => {
                            handleLogout();
                            setProfileMenuOpen(false);
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          aria-label="Logout"
                        >
                          <X size={20} className="text-red-600 dark:text-red-400" />
                          <span className="text-red-600 dark:text-red-400">Logout</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6 bg-gray-50 dark:bg-gray-900">
          {activeTab === 'dashboard' && (
            <div>
              <h2 className="text-3xl font-bold text-[#172554] dark:text-gray-100 mb-6">Dashboard</h2>

              {/* Year End Banner */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-700 dark:to-purple-700  shadow-lg p-6 mb-8 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <Calendar className="text-white" size={32} />
                    <div>
                      <p className="text-lg font-medium opacity-90">Days Remaining in {new Date().getFullYear()}</p>
                      <p className="text-4xl font-bold mt-1">{getDaysRemainingInYear()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-90">Make every day count!</p>
                    <p className="text-xs opacity-75 mt-1">Keep pushing towards your goals</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                {/* Daily Streak Card */}
                <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30  shadow-lg p-6 border-2 border-orange-200 dark:border-orange-800 ring-2 ring-orange-100 dark:ring-orange-900/50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[#172554] dark:text-gray-300 font-medium">Daily Streak</h3>
                    <Flame className="text-[#FF9D24] dark:text-orange-400" size={28} fill="currentColor" />
                  </div>
                  <p className="text-3xl font-bold text-[#FF9D24] dark:text-orange-400">{streak.currentStreak}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {streak.currentStreak > 0
                      ? streak.currentStreak === streak.longestStreak
                        ? '🔥 Your longest streak!'
                        : `Best: ${streak.longestStreak} days`
                      : 'Start your streak today!'}
                  </p>
                </div>
                {/* Completion % Card */}
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30  shadow-lg p-6 border-2 border-indigo-200 dark:border-[#6C2BEF] ring-2 ring-indigo-100 dark:ring-indigo-900/50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[#172554] dark:text-gray-300 font-medium">Completion %</h3>
                    <BarChart3 className="text-indigo-600 dark:text-[#6C2BEF]" size={28} />
                  </div>
                  <p className="text-3xl font-bold text-indigo-600 dark:text-[#6C2BEF]">{calculateTodayCompletion()}%</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {(() => {
                      const { completed, total } = getTodayCompletionStats();
                      return total > 0 ? `${completed}/${total} of today's tasks completed` : 'No tasks for today';
                    })()}
                  </p>
                </div>
                {/* Total Goals Card */}
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:bg-[#5A1FD8]/30  shadow-lg p-6 border-2 border-purple-200 dark:border-purple-800 ring-2 ring-purple-100 dark:ring-purple-900/50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[#172554] dark:text-gray-300 font-medium">Total Goals</h3>
                    <Target className="text-purple-600 dark:text-purple-400" size={28} />
                  </div>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.totalGoals}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{stats.completedGoals} completed</p>
                </div>
                {/* Skills Tracked Card */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30  shadow-lg p-6 border-2 border-green-200 dark:border-green-800 ring-2 ring-green-100 dark:ring-green-900/50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[#172554] dark:text-gray-300 font-medium">Skills Tracked</h3>
                    <BookOpen className="text-green-600 dark:text-green-400" size={28} />
                  </div>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.totalSkills}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{stats.totalHours.toFixed(1)} hours</p>
                </div>
                {/* Achievements Card */}
                <div className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/30  shadow-lg p-6 border-2 border-yellow-200 dark:border-yellow-800 ring-2 ring-yellow-100 dark:ring-yellow-900/50">
                  <div className="text-3xl font-bold text-[#172554] dark:text-gray-100">{stats.totalHours}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Total Hours</div>
                </div>
              </div>

              {/* Daily Schedule Section */}
              <div className="bg-white dark:bg-gray-800  shadow p-6 mb-6 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100 flex items-center gap-2">
                    <ListTodo className="text-indigo-600 dark:text-[#6C2BEF]" size={24} />
                    Today's Schedule
                  </h3>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{formatDateDDMMYYYY(currentDate)}</span>
                </div>
                <div className="space-y-3">
                  {getTodayTasks().length > 0 ? (
                    getTodayTasks().map(task => (
                      <div key={task.id} className={`flex items-center justify-between p-4  border-2 ${task.completed ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : task.missed ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'}`}>
                        <div className="flex items-center gap-3 flex-1">
                          <button
                            onClick={() => handleToggleTask(task.id)}
                            className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                            aria-label={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
                          >
                            {task.completed ? <CheckCircle className="text-green-600 dark:text-green-400" size={24} /> : <Circle size={24} />}
                          </button>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#172554] dark:text-gray-100">{task.title}</span>
                              <span className={`px-2 py-1 rounded text-xs ${task.priority === 'high' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' : task.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' : 'bg-[#2878F0] dark:bg-blue-900/50 text-[#2878F0] dark:text-blue-300'}`}>
                                {task.priority}
                              </span>
                            </div>
                            {task.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{task.description}</p>}
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                              <span>🕐 {formatTime12Hour(task.time)}</span>
                              <span>📁 {task.category}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <ListTodo className="mx-auto text-gray-300 dark:text-gray-600 mb-2" size={48} />
                      <p>No tasks scheduled for today</p>
                      <p className="text-sm mt-1">Add tasks to your schedule to get started!</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="bg-white dark:bg-gray-800  shadow p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100 mb-4">Active Goals</h3>
                  <div className="space-y-3">
                    {goals.filter(g => g.status === 'in-progress').slice(0, 3).map(goal => (
                      <div key={goal.id} className={`flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 `}>
                        <span className="text-[#172554] dark:text-gray-300">{goal.title}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{goal.category}</span>
                      </div>
                    ))}
                    {goals.filter(g => g.status === 'in-progress').length === 0 && <p className="text-gray-500 dark:text-gray-400 text-center py-4">No active goals</p>}
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'goals' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-[#172554] dark:text-gray-100">Career Goals</h2>
                <button onClick={() => setShowGoalForm(!showGoalForm)} className="flex items-center space-x-2 bg-[#6C2BEF] dark:bg-[#5A1FD8] text-white px-4 py-2  hover:bg-[#5A1FD8] dark:hover:bg-[#6C2BEF]">
                  <Plus size={20} />
                  <span>Add Goal</span>
                </button>
              </div>

              {showGoalForm && (
                <div className="bg-white dark:bg-gray-800  shadow p-6 mb-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100 mb-4">{editingGoal ? 'Edit Goal' : 'New Goal'}</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="goal-title" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Title</label>
                      <input id="goal-title" type="text" value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="Enter goal title" />
                    </div>
                    <div>
                      <label htmlFor="goal-description" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Description</label>
                      <textarea id="goal-description" value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" rows={3} placeholder="Describe your goal" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="goal-category" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Category</label>
                        <select id="goal-category" value={goalForm.category} onChange={(e) => setGoalForm({ ...goalForm, category: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100" aria-label="Goal category">
                          <option value="career">Career</option>
                          <option value="learning">Learning</option>
                          <option value="project">Project</option>
                          <option value="networking">Networking</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="goal-date" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Target Date</label>
                        <input id="goal-date" type="date" value={goalForm.targetDate} onChange={(e) => setGoalForm({ ...goalForm, targetDate: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100" aria-label="Target date" />
                      </div>
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={editingGoal ? handleUpdateGoal : handleAddGoal} className="flex items-center space-x-2 bg-[#6C2BEF] dark:bg-[#5A1FD8] text-white px-4 py-2  hover:bg-[#5A1FD8] dark:hover:bg-[#6C2BEF]">
                        <Save size={18} />
                        <span>{editingGoal ? 'Update' : 'Save'}</span>
                      </button>
                      <button onClick={() => { setShowGoalForm(false); setEditingGoal(null); setGoalForm({ title: '', description: '', category: 'career', targetDate: '', status: 'in-progress' }); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600  hover:bg-gray-50 dark:hover:bg-gray-700 text-[#172554] dark:text-gray-300">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {goals.map(goal => (
                  <div key={goal.id} className="bg-white dark:bg-gray-800  shadow p-6 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <button onClick={() => toggleGoalStatus(goal.id)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400" aria-label={goal.status === 'completed' ? 'Mark as in progress' : 'Mark as completed'}>
                            {goal.status === 'completed' ? <CheckCircle className="text-green-600 dark:text-green-400" size={24} /> : <Circle size={24} />}
                          </button>
                          <h3 className={`text-xl font-bold ${goal.status === 'completed' ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-[#172554] dark:text-gray-100'}`}>{goal.title}</h3>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 ml-9 mb-3">{goal.description}</p>
                        <div className="flex items-center space-x-4 ml-9 text-sm">
                          <span className="px-3 py-1 bg-indigo-100 dark:bg-[#3610B6]/50 text-indigo-700 dark:text-[#5A1FD8] ">{goal.category}</span>
                          {goal.targetDate && <span className="text-gray-500 dark:text-gray-400">Target: {goal.targetDate}</span>}
                          <span className={`px-3 py-1  ${goal.status === 'completed' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'}`}>{goal.status}</span>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={() => handleEditGoal(goal)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 " aria-label="Edit goal">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDeleteGoal(goal.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 " aria-label="Delete goal">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {goals.length === 0 && (
                  <div className="bg-white dark:bg-gray-800  shadow p-12 text-center border border-gray-200 dark:border-gray-700">
                    <Target size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No goals yet. Add your first goal!</p>
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
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-[#172554] dark:text-gray-100">Deadline Planner</h2>
                <button onClick={() => setShowPlanForm(!showPlanForm)} className="flex items-center space-x-2 bg-[#6C2BEF] dark:bg-[#5A1FD8] text-white px-4 py-2  hover:bg-[#5A1FD8] dark:hover:bg-[#6C2BEF]">
                  <Plus size={20} />
                  <span>Add Plan</span>
                </button>
              </div>

              {showPlanForm && (
                <div className="bg-white dark:bg-gray-800  shadow p-6 mb-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100 mb-4">New Deadline Plan</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="plan-title" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Title</label>
                      <input id="plan-title" type="text" value={planForm.title} onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="What needs to be done?" />
                    </div>
                    <div>
                      <label htmlFor="plan-desc" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Description</label>
                      <textarea id="plan-desc" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100" rows={2} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="plan-deadline" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Deadline</label>
                        <input id="plan-deadline" type="datetime-local" value={planForm.deadline} onChange={(e) => setPlanForm({ ...planForm, deadline: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100" />
                      </div>
                      <div>
                        <label htmlFor="plan-priority" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Priority</label>
                        <select id="plan-priority" value={planForm.priority} onChange={(e) => setPlanForm({ ...planForm, priority: e.target.value as 'low' | 'medium' | 'high' })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100">
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="plan-reminder" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Remind Me</label>
                        <select id="plan-reminder" value={planForm.reminderOffset} onChange={(e) => setPlanForm({ ...planForm, reminderOffset: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100">
                          <option value="15">15 minutes before</option>
                          <option value="60">1 hour before</option>
                          <option value="1440">1 day before</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={handleAddPlan} className="flex items-center space-x-2 bg-[#6C2BEF] text-white px-4 py-2  hover:bg-[#5A1FD8]">
                        <Save size={18} />
                        <span>Save Plan</span>
                      </button>
                      <button onClick={() => { setShowPlanForm(false); setPlanForm({ title: '', description: '', deadline: '', priority: 'medium', reminderOffset: '15' }); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600  hover:bg-gray-50 dark:hover:bg-gray-700 text-[#172554] dark:text-gray-300">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {(deadlinePlans || []).sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()).map(plan => (
                  <div key={plan.id} className={`bg-white dark:bg-gray-800  shadow p-6 border-l-4 ${plan.priority === 'high' ? 'border-red-500' : plan.priority === 'medium' ? 'border-yellow-500' : 'border-[#2878F0]'} dark:border-gray-700`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <button onClick={() => handleTogglePlan(plan.id)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400">
                            {plan.status === 'completed' ? <CheckCircle className="text-green-600 dark:text-green-400" size={24} /> : <Circle size={24} />}
                          </button>
                          <h3 className={`text-xl font-bold ${plan.status === 'completed' ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-[#172554] dark:text-gray-100'}`}>{plan.title}</h3>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 ml-9 mb-3">{plan.description}</p>
                        <div className="flex items-center space-x-4 ml-9 text-sm">
                          <span className={`px-3 py-1  text-xs uppercase ${plan.priority === 'high' ? 'bg-red-100 text-red-700' : plan.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-[#2878F0] text-[#2878F0]'}`}>{plan.priority}</span>
                          <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Clock size={14} />
                            {new Date(plan.deadline).toLocaleString()}
                          </span>
                          {plan.status === 'overdue' && <span className="text-red-600 font-bold">Overdue</span>}
                        </div>
                      </div>
                      <button onClick={() => handleDeletePlan(plan.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 ">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                {deadlinePlans.length === 0 && (
                  <div className="p-12 text-center bg-white dark:bg-gray-800  shadow border border-gray-200 dark:border-gray-700">
                    <Calendar size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No active plans. Add a deadline to get started!</p>
                  </div>
                )}
              </div>
            </div>
          )}



          {activeTab === 'content' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-[#172554] dark:text-gray-100">Content Creation</h2>
                <button onClick={() => setShowContentForm(!showContentForm)} className="flex items-center space-x-2 bg-[#6C2BEF] text-white px-4 py-2  hover:bg-[#5A1FD8]">
                  <Plus size={20} />
                  <span>Add Content</span>
                </button>
              </div>

              {showContentForm && (
                <div className="bg-white dark:bg-gray-800  shadow p-6 mb-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100 mb-4">{editingContent ? 'Edit Content' : 'New Content'}</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="content-title" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Title</label>
                      <input id="content-title" type="text" value={contentForm.title} onChange={(e) => setContentForm({ ...contentForm, title: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="Enter content title" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="content-type" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Content Type</label>
                        <select id="content-type" value={contentForm.type} onChange={(e) => setContentForm({ ...contentForm, type: e.target.value as 'youtube' | 'instagram' | 'script' | 'roadmap', platform: e.target.value === 'youtube' ? 'youtube' : e.target.value === 'instagram' ? 'instagram' : 'general' })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100" aria-label="Content type">
                          <option value="youtube">YouTube</option>
                          <option value="instagram">Instagram</option>
                          <option value="script">Script</option>
                          <option value="roadmap">Roadmap</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="content-status" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Status</label>
                        <select id="content-status" value={contentForm.status} onChange={(e) => setContentForm({ ...contentForm, status: e.target.value as 'draft' | 'in-progress' | 'completed' | 'published' })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100" aria-label="Content status">
                          <option value="draft">Draft</option>
                          <option value="in-progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="published">Published</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="content-script" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Script / Content</label>
                      <textarea id="content-script" value={contentForm.script} onChange={(e) => setContentForm({ ...contentForm, script: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" rows={8} placeholder="Write your script, roadmap, or content here..." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="content-target-date" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Target Date</label>
                        <input id="content-target-date" type="date" value={contentForm.targetDate} onChange={(e) => setContentForm({ ...contentForm, targetDate: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100" aria-label="Target date" />
                      </div>
                      <div>
                        <label htmlFor="content-publish-date" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Publish Date</label>
                        <input id="content-publish-date" type="date" value={contentForm.publishDate} onChange={(e) => setContentForm({ ...contentForm, publishDate: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100" aria-label="Publish date" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="content-tags" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Tags (comma separated)</label>
                      <input id="content-tags" type="text" value={contentForm.tags} onChange={(e) => setContentForm({ ...contentForm, tags: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="e.g., tech, tutorial, tips" />
                    </div>
                    <div>
                      <label htmlFor="content-notes" className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Notes</label>
                      <textarea id="content-notes" value={contentForm.notes} onChange={(e) => setContentForm({ ...contentForm, notes: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" rows={3} placeholder="Additional notes or reminders..." />
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={editingContent ? handleUpdateContent : handleAddContent} className="flex items-center space-x-2 bg-[#6C2BEF] dark:bg-[#5A1FD8] text-white px-4 py-2  hover:bg-[#5A1FD8] dark:hover:bg-[#6C2BEF]">
                        <Save size={18} />
                        <span>{editingContent ? 'Update' : 'Save'}</span>
                      </button>
                      <button onClick={() => { setShowContentForm(false); setEditingContent(null); setContentForm({ title: '', type: 'youtube', platform: 'youtube', script: '', status: 'draft', publishDate: '', targetDate: '', tags: '', notes: '' }); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600  hover:bg-gray-50 dark:hover:bg-gray-700 text-[#172554] dark:text-gray-300">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Content Filters */}
              <div className="flex items-center space-x-2 mb-4 flex-wrap gap-2">
                <button onClick={() => setActiveTab('content')} className={`px-4 py-2  ${true ? 'bg-indigo-100 dark:bg-[#3610B6]/50 text-indigo-700 dark:text-[#5A1FD8]' : 'bg-gray-100 dark:bg-gray-700 text-[#172554] dark:text-gray-300'}`}>
                  All ({contents.length})
                </button>
                <button onClick={() => setActiveTab('content')} className="px-4 py-2  bg-gray-100 dark:bg-gray-700 text-[#172554] dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">
                  YouTube ({contents.filter(c => c.type === 'youtube').length})
                </button>
                <button onClick={() => setActiveTab('content')} className="px-4 py-2  bg-gray-100 dark:bg-gray-700 text-[#172554] dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">
                  Instagram ({contents.filter(c => c.type === 'instagram').length})
                </button>
                <button onClick={() => setActiveTab('content')} className="px-4 py-2  bg-gray-100 dark:bg-gray-700 text-[#172554] dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">
                  Scripts ({contents.filter(c => c.type === 'script').length})
                </button>
                <button onClick={() => setActiveTab('content')} className="px-4 py-2  bg-gray-100 dark:bg-gray-700 text-[#172554] dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">
                  Roadmaps ({contents.filter(c => c.type === 'roadmap').length})
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {contents.map(content => {
                  const typeIcons = {
                    youtube: Video,
                    instagram: Image,
                    script: FileText,
                    roadmap: Play
                  };
                  const IconComponent = typeIcons[content.type] || FileText;
                  const statusColors = {
                    draft: 'bg-gray-100 dark:bg-gray-700 text-[#172554] dark:text-gray-300',
                    'in-progress': 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300',
                    completed: 'bg-[#2878F0] dark:bg-blue-900/50 text-[#2878F0] dark:text-blue-300',
                    published: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                  };
                  return (
                    <div key={content.id} className="bg-white dark:bg-gray-800  shadow p-6 border border-gray-200 dark:border-gray-700">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <IconComponent className={content.type === 'youtube' ? 'text-red-500 dark:text-red-400' : content.type === 'instagram' ? 'text-[#F43F72] dark:text-pink-400' : 'text-indigo-500 dark:text-[#6C2BEF]'} size={24} />
                            <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100">{content.title}</h3>
                            <span className={`px-3 py-1  text-sm ${statusColors[content.status]}`}>
                              {content.status}
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 mb-3 text-sm text-gray-600 dark:text-gray-300">
                            <span className="px-3 py-1 bg-indigo-100 dark:bg-[#3610B6]/50 text-indigo-700 dark:text-[#5A1FD8]  capitalize">{content.type}</span>
                            {content.targetDate && <span>Target: {content.targetDate}</span>}
                            {content.publishDate && <span>Published: {content.publishDate}</span>}
                          </div>
                          {content.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {content.tags.map((tag, idx) => (
                                <span key={idx} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs">#{tag}</span>
                              ))}
                            </div>
                          )}
                          {content.script && (
                            <div className="bg-gray-50 dark:bg-gray-700/50  p-4 mb-3 max-h-48 overflow-y-auto">
                              <p className="text-[#172554] dark:text-gray-300 whitespace-pre-wrap text-sm">{content.script}</p>
                            </div>
                          )}
                          {content.notes && (
                            <p className="text-gray-600 dark:text-gray-300 text-sm italic">Note: {content.notes}</p>
                          )}
                        </div>
                        <div className="flex space-x-2 ml-4">
                          <button onClick={() => handleEditContent(content)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 " aria-label="Edit content">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDeleteContent(content.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 " aria-label="Delete content">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {contents.length === 0 && (
                  <div className="bg-white dark:bg-gray-800  shadow p-12 text-center border border-gray-200 dark:border-gray-700">
                    <Video size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No content yet. Start creating your scripts and roadmaps!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-[#172554] dark:text-gray-100">Daily Schedule</h2>
                <button onClick={() => setShowScheduleForm(!showScheduleForm)} className="flex items-center space-x-2 bg-[#6C2BEF] text-white px-4 py-2  hover:bg-[#5A1FD8]">
                  <Plus size={20} />
                  <span>Add Schedule Task</span>
                </button>
              </div>

              {showScheduleForm && (
                <div className="bg-white dark:bg-gray-800  shadow p-6 mb-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100 mb-4">{editingSchedule ? 'Edit Schedule Task' : 'New Schedule Task'}</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Title</label>
                      <input type="text" value={scheduleForm.title} onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="e.g., Morning Exercise" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Description</label>
                      <textarea value={scheduleForm.description} onChange={(e) => setScheduleForm({ ...scheduleForm, description: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" rows={2} placeholder="Task description" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Time</label>
                        <div className="flex items-center gap-2">
                          <select
                            value={parseTime24To12(scheduleForm.time).hour}
                            onChange={(e) => {
                              const newHour = parseInt(e.target.value, 10);
                              const { minute, period } = parseTime24To12(scheduleForm.time);
                              setScheduleForm({ ...scheduleForm, time: convert12To24(newHour, minute, period) });
                            }}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100"
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          <span className="text-gray-600 dark:text-gray-400">:</span>
                          <select
                            value={parseTime24To12(scheduleForm.time).minute}
                            onChange={(e) => {
                              const { hour, period } = parseTime24To12(scheduleForm.time);
                              setScheduleForm({ ...scheduleForm, time: convert12To24(hour, e.target.value, period) });
                            }}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100"
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
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100"
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Duration (minutes)</label>
                        <input type="number" value={scheduleForm.estimatedDuration} onChange={(e) => setScheduleForm({ ...scheduleForm, estimatedDuration: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100" min="1" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Priority</label>
                        <select value={scheduleForm.priority} onChange={(e) => setScheduleForm({ ...scheduleForm, priority: e.target.value as 'low' | 'medium' | 'high' })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100">
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Category</label>
                        <input type="text" value={scheduleForm.category} onChange={(e) => setScheduleForm({ ...scheduleForm, category: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="e.g., Health, Work" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-2">Days of Week</label>
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
                            className={`px-4 py-2  border-2 ${scheduleForm.dayOfWeek.includes(index)
                              ? 'bg-[#6C2BEF] dark:bg-[#5A1FD8] text-white border-indigo-600 dark:border-[#4816C7]'
                              : 'bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-500'
                              }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={editingSchedule ? handleUpdateSchedule : handleAddSchedule} className="flex items-center space-x-2 bg-[#6C2BEF] dark:bg-[#5A1FD8] text-white px-4 py-2  hover:bg-[#5A1FD8] dark:hover:bg-[#6C2BEF]">
                        <Save size={18} />
                        <span>{editingSchedule ? 'Update' : 'Save'}</span>
                      </button>
                      <button onClick={() => { setShowScheduleForm(false); setEditingSchedule(null); setScheduleForm({ title: '', description: '', time: '', dayOfWeek: [], priority: 'medium', category: 'general', estimatedDuration: '30' }); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600  hover:bg-gray-50 dark:hover:bg-gray-700 text-[#172554] dark:text-gray-300">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {scheduleTasks.map(schedule => (
                  <div key={schedule.id} className="bg-white dark:bg-gray-800  shadow p-6 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100">{schedule.title}</h3>
                        {schedule.description && <p className="text-gray-600 dark:text-gray-300 mt-1 text-sm">{schedule.description}</p>}
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={() => handleEditSchedule(schedule)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 " aria-label="Edit schedule">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDeleteSchedule(schedule.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 " aria-label="Delete schedule">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Time:</span>
                        <span className="font-semibold text-[#172554] dark:text-gray-100">{formatTime12Hour(schedule.time)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Duration:</span>
                        <span className="font-semibold text-[#172554] dark:text-gray-100">{schedule.estimatedDuration} min</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Priority:</span>
                        <span className={`px-2 py-1 rounded text-xs ${schedule.priority === 'high' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' : schedule.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' : 'bg-[#2878F0] dark:bg-blue-900/50 text-[#2878F0] dark:text-blue-300'}`}>
                          {schedule.priority}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Days:</span>
                        <div className="flex gap-1">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                            schedule.dayOfWeek.includes(index) && (
                              <span key={index} className="px-2 py-1 bg-indigo-100 dark:bg-[#3610B6]/50 text-indigo-700 dark:text-[#5A1FD8] rounded text-xs">{day}</span>
                            )
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {scheduleTasks.length === 0 && (
                  <div className="col-span-2 bg-white dark:bg-gray-800  shadow p-12 text-center border border-gray-200 dark:border-gray-700">
                    <ListTodo size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No schedule tasks yet. Add your first scheduled task!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div>
              <h2 className="text-3xl font-bold text-[#172554] dark:text-gray-100 mb-6">Analysis Dashboard</h2>

              {/* Perfection Meter */}
              <div className="bg-white dark:bg-gray-800  shadow p-6 mb-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100 mb-4 flex items-center gap-2">
                  <BarChart3 className="text-indigo-600" size={24} />
                  Perfection Meter
                </h3>
                <div className="flex items-center justify-center mb-4">
                  <div className="relative w-48 h-48">
                    <svg className="transform -rotate-90 w-48 h-48">
                      <circle
                        cx="96"
                        cy="96"
                        r="88"
                        stroke="currentColor"
                        strokeWidth="12"
                        fill="transparent"
                        className="text-gray-200"
                      />
                      <circle
                        cx="96"
                        cy="96"
                        r="88"
                        stroke="currentColor"
                        strokeWidth="12"
                        fill="transparent"
                        strokeDasharray={`${(calculatePerfection() / 100) * 552} 552`}
                        className="text-indigo-600 transition-all duration-500"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-indigo-600">{calculatePerfection()}%</div>
                        <div className="text-sm text-gray-500 mt-1">Completion Rate</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="bg-green-50 dark:bg-green-900/20  p-4 text-center border border-green-200 dark:border-green-800">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {dailyTasks.filter(t => t.completed).length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">Completed Tasks</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20  p-4 text-center border border-red-200 dark:border-red-800">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {dailyTasks.filter(t => t.missed).length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">Missed Tasks</div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20  p-4 text-center border border-blue-200 dark:border-blue-800">
                    <div className="text-2xl font-bold text-[#2878F0] dark:text-blue-400">
                      {dailyTasks.length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">Total Tasks</div>
                  </div>
                </div>
              </div>

              {/* Task Completion Stats */}
              <div className="bg-white dark:bg-gray-800  shadow p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100 mb-4">Last 7 Days Performance</h3>
                <div className="space-y-3">
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
                        <div key={date} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 ">
                          <div className="flex items-center gap-3">
                            <div className="text-sm font-medium text-[#172554] dark:text-gray-300 w-20">{dayName}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{dayDate}</div>
                          </div>
                          <div className="flex items-center gap-3 flex-1 max-w-xs">
                            <div className="flex-1 bg-gray-200 dark:bg-gray-600  h-4">
                              <div
                                className={`h-4  transition-all duration-300 ${percentage === 100 ? 'bg-green-500 dark:bg-green-600' : percentage >= 50 ? 'bg-yellow-500 dark:bg-yellow-600' : 'bg-red-500 dark:bg-red-600'
                                  }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <div className="text-sm font-semibold text-[#172554] dark:text-gray-300 w-16 text-right">
                              {completed}/{total}
                            </div>
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
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-[#172554] dark:text-gray-100">Manual Notes</h2>
                <button onClick={() => setShowNoteForm(!showNoteForm)} className="flex items-center space-x-2 bg-[#6C2BEF] text-white px-4 py-2  hover:bg-[#5A1FD8]">
                  <Plus size={20} />
                  <span>Add Note</span>
                </button>
              </div>

              {showNoteForm && (
                <div className="bg-white dark:bg-gray-800  shadow p-6 mb-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100 mb-4">{editingNote ? 'Edit Note' : 'New Note'}</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Title</label>
                      <input type="text" value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="Note title" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Content</label>
                      <textarea value={noteForm.content} onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" rows={8} placeholder="Write your notes here..." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Category</label>
                        <input type="text" value={noteForm.category} onChange={(e) => setNoteForm({ ...noteForm, category: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="e.g., Ideas, Reminders" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#172554] dark:text-gray-300 mb-1">Tags (comma separated)</label>
                        <input type="text" value={noteForm.tags} onChange={(e) => setNoteForm({ ...noteForm, tags: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-[#172554] dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" placeholder="e.g., important, meeting" />
                      </div>
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={editingNote ? handleUpdateNote : handleAddNote} className="flex items-center space-x-2 bg-[#6C2BEF] dark:bg-[#5A1FD8] text-white px-4 py-2  hover:bg-[#5A1FD8] dark:hover:bg-[#6C2BEF]">
                        <Save size={18} />
                        <span>{editingNote ? 'Update' : 'Save'}</span>
                      </button>
                      <button onClick={() => { setShowNoteForm(false); setEditingNote(null); setNoteForm({ title: '', content: '', category: 'general', tags: '' }); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600  hover:bg-gray-50 dark:hover:bg-gray-700 text-[#172554] dark:text-gray-300">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {manualNotes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map(note => (
                  <div key={note.id} className="bg-white dark:bg-gray-800  shadow p-6 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-[#172554] dark:text-gray-100 mb-1">{note.title}</h3>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-1 bg-indigo-100 dark:bg-[#3610B6]/50 text-indigo-700 dark:text-[#5A1FD8] rounded text-xs">{note.category}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(note.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={() => handleEditNote(note)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 " aria-label="Edit note">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDeleteNote(note.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 " aria-label="Delete note">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap mb-3">{note.content}</p>
                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {note.tags.map((tag, idx) => (
                          <span key={idx} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {manualNotes.length === 0 && (
                  <div className="col-span-2 bg-white dark:bg-gray-800  shadow p-12 text-center border border-gray-200 dark:border-gray-700">
                    <StickyNote size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No notes yet. Create your first note!</p>
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
                      {groqAvailable ? (
                        <>
                          <Wifi size={12} className="text-green-300" />
                          <span className="text-xs opacity-75">Personal RAG + web sources</span>
                        </>
                      ) : ollamaAvailable ? (
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
