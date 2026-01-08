import React, { useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';
import { Plus, Target, Award, Clock, TrendingUp, BookOpen, Download, Menu, X, CheckCircle, Circle, Edit2, Trash2, Save, Calendar, Video, Image, FileText, Play, Flame } from 'lucide-react';

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
}

interface TimeLog {
  id: number;
  activity: string;
  hours: number;
  date: string;
  category: string;
}

interface Achievement {
  id: number;
  title: string;
  description: string;
  date: string;
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

const MYMate = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<number | null>(null);
  const [goalForm, setGoalForm] = useState({ title: '', description: '', category: 'career', targetDate: '', status: 'in-progress' });
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [skillForm, setSkillForm] = useState({ name: '', level: 'beginner', hoursInvested: '0' });
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [showTimeForm, setShowTimeForm] = useState(false);
  const [timeForm, setTimeForm] = useState({ activity: '', hours: '', date: new Date().toISOString().split('T')[0], category: 'learning' });
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [showAchievementForm, setShowAchievementForm] = useState(false);
  const [achievementForm, setAchievementForm] = useState({ title: '', description: '', date: new Date().toISOString().split('T')[0] });
  const [contents, setContents] = useState<Content[]>([]);
  const [showContentForm, setShowContentForm] = useState(false);
  const [editingContent, setEditingContent] = useState<number | null>(null);
  const [contentForm, setContentForm] = useState({ title: '', type: 'youtube' as 'youtube' | 'instagram' | 'script' | 'roadmap', platform: 'youtube', script: '', status: 'draft' as 'draft' | 'in-progress' | 'completed' | 'published', publishDate: '', targetDate: '', tags: '', notes: '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakData>({ lastVisitDate: '', visitDates: [], currentStreak: 0, longestStreak: 0 });

  // Helper function to clear all data state
  const clearAllData = () => {
    setGoals([]);
    setSkills([]);
    setTimeLogs([]);
    setAchievements([]);
    setContents([]);
    setStreak({ lastVisitDate: '', visitDates: [], currentStreak: 0, longestStreak: 0 });
  };

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = (): string => {
    return new Date().toISOString().split('T')[0];
  };

  // Calculate streak from visit dates
  const calculateStreak = (visitDates: string[]): number => {
    if (visitDates.length === 0) return 0;
    
    // Sort dates in descending order
    const sortedDates = [...visitDates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const today = getTodayDate();
    
    // Check if today is in the list or yesterday
    let streak = 0;
    let currentDate = new Date(today);
    
    // If today is not visited, start from yesterday
    if (!sortedDates.includes(today)) {
      currentDate.setDate(currentDate.getDate() - 1);
    }
    
    // Count consecutive days
    for (const visitDate of sortedDates) {
      const checkDate = currentDate.toISOString().split('T')[0];
      if (visitDate === checkDate) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else if (visitDate < checkDate) {
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
    
    // If already visited today, don't update
    if (streak.lastVisitDate === today) {
      streak.currentStreak = calculateStreak(streak.visitDates);
      setStreak(streak);
      return;
    }
    
    // Add today to visit dates if not already there
    if (!streak.visitDates.includes(today)) {
      streak.visitDates.push(today);
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

  // Load user data from localStorage
  const loadData = () => {
    if (!user) {
      clearAllData();
      return;
    }
    try {
      // Reset all arrays first to prevent showing previous user's data
      clearAllData();
      
      const goalsData = localStorage.getItem(`goals-${user.id}`);
      const skillsData = localStorage.getItem(`skills-${user.id}`);
      const timeLogsData = localStorage.getItem(`timeLogs-${user.id}`);
      const achievementsData = localStorage.getItem(`achievements-${user.id}`);
      const contentsData = localStorage.getItem(`contents-${user.id}`);
      
      if (goalsData) setGoals(JSON.parse(goalsData));
      if (skillsData) setSkills(JSON.parse(skillsData));
      if (timeLogsData) setTimeLogs(JSON.parse(timeLogsData));
      if (achievementsData) setAchievements(JSON.parse(achievementsData));
      if (contentsData) setContents(JSON.parse(contentsData));
    } catch (error) {
      console.error('Error loading data:', error);
      clearAllData();
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

  const saveData = (key: string, data: Goal[] | Skill[] | TimeLog[] | Achievement[] | Content[]) => {
    if (!user) return;
    try {
      localStorage.setItem(`${key}-${user.id}`, JSON.stringify(data));
    } catch (error) {
      console.error('Error:', error);
    }
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

  const handleAddSkill = () => {
    if (!skillForm.name) return;
    const newSkill: Skill = { id: Date.now(), ...skillForm, hoursInvested: parseInt(skillForm.hoursInvested) || 0 };
    const updatedSkills = [...skills, newSkill];
    setSkills(updatedSkills);
    saveData('skills', updatedSkills);
    setSkillForm({ name: '', level: 'beginner', hoursInvested: '0' });
    setShowSkillForm(false);
  };

  const handleDeleteSkill = (id: number) => {
    const updatedSkills = skills.filter(s => s.id !== id);
    setSkills(updatedSkills);
    saveData('skills', updatedSkills);
  };

  const handleAddTimeLog = () => {
    if (!timeForm.activity || !timeForm.hours) return;
    const newLog: TimeLog = { id: Date.now(), ...timeForm, hours: parseFloat(timeForm.hours) };
    const updatedLogs = [...timeLogs, newLog];
    setTimeLogs(updatedLogs);
    saveData('timeLogs', updatedLogs);
    setTimeForm({ activity: '', hours: '', date: new Date().toISOString().split('T')[0], category: 'learning' });
    setShowTimeForm(false);
  };

  const handleDeleteTimeLog = (id: number) => {
    const updatedLogs = timeLogs.filter(l => l.id !== id);
    setTimeLogs(updatedLogs);
    saveData('timeLogs', updatedLogs);
  };

  const handleAddAchievement = () => {
    if (!achievementForm.title) return;
    const newAchievement: Achievement = { id: Date.now(), ...achievementForm };
    const updatedAchievements = [...achievements, newAchievement];
    setAchievements(updatedAchievements);
    saveData('achievements', updatedAchievements);
    setAchievementForm({ title: '', description: '', date: new Date().toISOString().split('T')[0] });
    setShowAchievementForm(false);
  };

  const handleDeleteAchievement = (id: number) => {
    const updatedAchievements = achievements.filter(a => a.id !== id);
    setAchievements(updatedAchievements);
    saveData('achievements', updatedAchievements);
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
    const data = { goals, skills, timeLogs, achievements, contents, exportedAt: new Date().toISOString() };
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

  const stats = {
    totalGoals: goals.length,
    completedGoals: goals.filter(g => g.status === 'completed').length,
    activeGoals: goals.filter(g => g.status === 'in-progress').length,
    totalSkills: skills.length,
    totalHours: timeLogs.reduce((sum, log) => sum + log.hours, 0),
    totalAchievements: achievements.length
  };

  if (showAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-2">
              {/* Logo to the left of the name */}
              <img
                src="/mymate-logo.png"
                alt="MyMate logo"
                className="w-10 h-10 rounded-md"
              />
              <h1 className="text-4xl font-bold text-indigo-600">MyMate</h1>
            </div>
            <p className="text-gray-600">Your Personal Career Tracker</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'signup' && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input 
                  id="name"
                  type="text" 
                  value={authForm.name} 
                  onChange={(e) => setAuthForm({...authForm, name: e.target.value})} 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                  required={authMode === 'signup'}
                  placeholder="Enter your name"
                  aria-label="Name"
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input 
                id="email"
                type="email" 
                value={authForm.email} 
                onChange={(e) => setAuthForm({...authForm, email: e.target.value})} 
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                required
                placeholder="Enter your email"
                aria-label="Email"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input 
                id="password"
                type="password" 
                value={authForm.password} 
                onChange={(e) => setAuthForm({...authForm, password: e.target.value})} 
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                required
                placeholder="Enter your password"
                aria-label="Password"
              />
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium">{authMode === 'login' ? 'Login' : 'Sign Up'}</button>
          </form>

          {/* Auth error message */}
          {authError && (
            <p className="mt-3 text-sm text-red-600 text-center">{authError}</p>
          )}

          {/* Divider */}
          <div className="flex items-center my-4">
            <div className="flex-grow border-t border-gray-200" />
            <span className="mx-2 text-gray-400 text-xs uppercase">or</span>
            <div className="flex-grow border-t border-gray-200" />
          </div>

          {/* Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google logo"
              className="w-5 h-5"
            />
            <span>Continue with Google</span>
          </button>

          <div className="text-center mt-4">
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-indigo-600 hover:text-indigo-700 text-sm">{authMode === 'login' ? 'Need an account? Sign up' : 'Have an account? Login'}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-indigo-900 text-white transition-all duration-300 overflow-hidden`}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            {/* Logo to the left of the name */}
            <img
              src="/mymate-logo.png"
              alt="MyMate logo"
              className="w-8 h-8 rounded-md bg-white"
            />
            <h1 className="text-2xl font-bold">MyMate</h1>
          </div>
          <nav className="space-y-2">
            {[
              { id: 'dashboard', icon: TrendingUp, label: 'Dashboard' },
              { id: 'goals', icon: Target, label: 'Goals' },
              { id: 'skills', icon: BookOpen, label: 'Skills' },
              { id: 'time', icon: Clock, label: 'Time Logs' },
              { id: 'achievements', icon: Award, label: 'Achievements' },
              { id: 'content', icon: Video, label: 'Content Creation' }
            ].map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg ${activeTab === item.id ? 'bg-indigo-700' : 'hover:bg-indigo-800'}`}>
                <item.icon size={20} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-8 pt-8 border-t border-indigo-700">
            <button onClick={handleExport} className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-indigo-800" aria-label="Export data">
              <Download size={20} />
              <span>Export</span>
            </button>
            <button onClick={handleLogout} className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-indigo-800 mt-2" aria-label="Logout">
              <X size={20} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm p-4 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Toggle sidebar">
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="flex items-center gap-4">
            {/* Daily Streak Icon */}
            {user && streak.currentStreak > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-100 to-red-100 rounded-lg border border-orange-200">
                <Flame className="text-orange-500" size={24} fill="currentColor" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-orange-700">{streak.currentStreak}</span>
                  <span className="text-xs text-orange-600">Day Streak</span>
                </div>
              </div>
            )}
            <div className="text-gray-600">Welcome, {user && user.name}</div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          {activeTab === 'dashboard' && (
            <div>
              <h2 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h2>
              
              {/* Year End Banner */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg p-6 mb-8 text-white">
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Daily Streak Card */}
                <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl shadow p-6 border border-orange-200">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gray-700 font-medium">Daily Streak</h3>
                    <Flame className="text-orange-500" size={28} fill="currentColor" />
                  </div>
                  <p className="text-3xl font-bold text-orange-600">{streak.currentStreak}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {streak.currentStreak > 0 
                      ? streak.currentStreak === streak.longestStreak 
                        ? '🔥 Your longest streak!' 
                        : `Best: ${streak.longestStreak} days`
                      : 'Start your streak today!'}
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gray-600 font-medium">Total Goals</h3>
                    <Target className="text-indigo-600" size={24} />
                  </div>
                  <p className="text-3xl font-bold text-gray-800">{stats.totalGoals}</p>
                  <p className="text-sm text-gray-500 mt-1">{stats.completedGoals} completed</p>
                </div>
                <div className="bg-white rounded-xl shadow p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gray-600 font-medium">Skills Tracked</h3>
                    <BookOpen className="text-green-600" size={24} />
                  </div>
                  <p className="text-3xl font-bold text-gray-800">{stats.totalSkills}</p>
                  <p className="text-sm text-gray-500 mt-1">{stats.totalHours.toFixed(1)} hours</p>
                </div>
                <div className="bg-white rounded-xl shadow p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gray-600 font-medium">Achievements</h3>
                    <Award className="text-yellow-600" size={24} />
                  </div>
                  <p className="text-3xl font-bold text-gray-800">{stats.totalAchievements}</p>
                  <p className="text-sm text-gray-500 mt-1">Keep going!</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">Active Goals</h3>
                  <div className="space-y-3">
                    {goals.filter(g => g.status === 'in-progress').slice(0, 3).map(goal => (
                      <div key={goal.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-700">{goal.title}</span>
                        <span className="text-xs text-gray-500">{goal.category}</span>
                      </div>
                    ))}
                    {goals.filter(g => g.status === 'in-progress').length === 0 && <p className="text-gray-500 text-center py-4">No active goals</p>}
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">Recent Achievements</h3>
                  <div className="space-y-3">
                    {achievements.slice(-3).reverse().map(achievement => (
                      <div key={achievement.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-700">{achievement.title}</span>
                        <span className="text-xs text-gray-500">{achievement.date}</span>
                      </div>
                    ))}
                    {achievements.length === 0 && <p className="text-gray-500 text-center py-4">No achievements yet</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'goals' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Career Goals</h2>
                <button onClick={() => setShowGoalForm(!showGoalForm)} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                  <Plus size={20} />
                  <span>Add Goal</span>
                </button>
              </div>

              {showGoalForm && (
                <div className="bg-white rounded-xl shadow p-6 mb-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">{editingGoal ? 'Edit Goal' : 'New Goal'}</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="goal-title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                      <input id="goal-title" type="text" value={goalForm.title} onChange={(e) => setGoalForm({...goalForm, title: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Enter goal title" />
                    </div>
                    <div>
                      <label htmlFor="goal-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea id="goal-description" value={goalForm.description} onChange={(e) => setGoalForm({...goalForm, description: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" rows={3} placeholder="Describe your goal" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="goal-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select id="goal-category" value={goalForm.category} onChange={(e) => setGoalForm({...goalForm, category: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" aria-label="Goal category">
                          <option value="career">Career</option>
                          <option value="learning">Learning</option>
                          <option value="project">Project</option>
                          <option value="networking">Networking</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="goal-date" className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
                        <input id="goal-date" type="date" value={goalForm.targetDate} onChange={(e) => setGoalForm({...goalForm, targetDate: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" aria-label="Target date" />
                      </div>
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={editingGoal ? handleUpdateGoal : handleAddGoal} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                        <Save size={18} />
                        <span>{editingGoal ? 'Update' : 'Save'}</span>
                      </button>
                      <button onClick={() => { setShowGoalForm(false); setEditingGoal(null); setGoalForm({ title: '', description: '', category: 'career', targetDate: '', status: 'in-progress' }); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {goals.map(goal => (
                  <div key={goal.id} className="bg-white rounded-xl shadow p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <button onClick={() => toggleGoalStatus(goal.id)} className="text-gray-400 hover:text-indigo-600" aria-label={goal.status === 'completed' ? 'Mark as in progress' : 'Mark as completed'}>
                            {goal.status === 'completed' ? <CheckCircle className="text-green-600" size={24} /> : <Circle size={24} />}
                          </button>
                          <h3 className={`text-xl font-bold ${goal.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{goal.title}</h3>
                        </div>
                        <p className="text-gray-600 ml-9 mb-3">{goal.description}</p>
                        <div className="flex items-center space-x-4 ml-9 text-sm">
                          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full">{goal.category}</span>
                          {goal.targetDate && <span className="text-gray-500">Target: {goal.targetDate}</span>}
                          <span className={`px-3 py-1 rounded-full ${goal.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{goal.status}</span>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={() => handleEditGoal(goal)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Edit goal">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDeleteGoal(goal.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Delete goal">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {goals.length === 0 && (
                  <div className="bg-white rounded-xl shadow p-12 text-center">
                    <Target size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">No goals yet. Add your first goal!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'skills' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Skills Development</h2>
                <button onClick={() => setShowSkillForm(!showSkillForm)} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                  <Plus size={20} />
                  <span>Add Skill</span>
                </button>
              </div>

              {showSkillForm && (
                <div className="bg-white rounded-xl shadow p-6 mb-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">New Skill</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="skill-name" className="block text-sm font-medium text-gray-700 mb-1">Skill Name</label>
                      <input id="skill-name" type="text" value={skillForm.name} onChange={(e) => setSkillForm({...skillForm, name: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="e.g., React, Python" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="skill-level" className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                        <select id="skill-level" value={skillForm.level} onChange={(e) => setSkillForm({...skillForm, level: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" aria-label="Skill level">
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                          <option value="expert">Expert</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="skill-hours" className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
                        <input id="skill-hours" type="number" value={skillForm.hoursInvested} onChange={(e) => setSkillForm({...skillForm, hoursInvested: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" min="0" aria-label="Hours invested" />
                      </div>
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={handleAddSkill} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                        <Save size={18} />
                        <span>Save</span>
                      </button>
                      <button onClick={() => { setShowSkillForm(false); setSkillForm({ name: '', level: 'beginner', hoursInvested: '0' }); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {skills.map(skill => (
                  <div key={skill.id} className="bg-white rounded-xl shadow p-6">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-xl font-bold text-gray-800">{skill.name}</h3>
                      <button onClick={() => handleDeleteSkill(skill.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Delete skill">
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Level:</span>
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm capitalize">{skill.level}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Hours Invested:</span>
                        <span className="font-semibold text-gray-800">{skill.hoursInvested}h</span>
                      </div>
                    </div>
                  </div>
                ))}
                {skills.length === 0 && (
                  <div className="col-span-2 bg-white rounded-xl shadow p-12 text-center">
                    <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">No skills tracked yet. Add your first skill!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'time' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Time Logs</h2>
                <button onClick={() => setShowTimeForm(!showTimeForm)} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                  <Plus size={20} />
                  <span>Log Time</span>
                </button>
              </div>

              {showTimeForm && (
                <div className="bg-white rounded-xl shadow p-6 mb-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">New Time Log</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="time-activity" className="block text-sm font-medium text-gray-700 mb-1">Activity</label>
                      <input id="time-activity" type="text" value={timeForm.activity} onChange={(e) => setTimeForm({...timeForm, activity: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="What did you work on?" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="time-hours" className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
                        <input id="time-hours" type="number" step="0.5" value={timeForm.hours} onChange={(e) => setTimeForm({...timeForm, hours: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" min="0" placeholder="2.5" aria-label="Hours" />
                      </div>
                      <div>
                        <label htmlFor="time-date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                        <input id="time-date" type="date" value={timeForm.date} onChange={(e) => setTimeForm({...timeForm, date: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" aria-label="Date" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="time-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select id="time-category" value={timeForm.category} onChange={(e) => setTimeForm({...timeForm, category: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" aria-label="Category">
                        <option value="learning">Learning</option>
                        <option value="project">Project Work</option>
                        <option value="networking">Networking</option>
                        <option value="research">Research</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={handleAddTimeLog} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                        <Save size={18} />
                        <span>Save</span>
                      </button>
                      <button onClick={() => { setShowTimeForm(false); setTimeForm({ activity: '', hours: '', date: new Date().toISOString().split('T')[0], category: 'learning' }); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {timeLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(log => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-gray-800">{log.activity}</td>
                          <td className="px-6 py-4 text-gray-800 font-semibold">{log.hours}h</td>
                          <td className="px-6 py-4 text-gray-600">{log.date}</td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm capitalize">{log.category}</span>
                          </td>
                          <td className="px-6 py-4">
                            <button onClick={() => handleDeleteTimeLog(log.id)} className="text-red-600 hover:text-red-700" aria-label="Delete time log">
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {timeLogs.length === 0 && (
                    <div className="p-12 text-center">
                      <Clock size={48} className="mx-auto text-gray-300 mb-4" />
                      <p className="text-gray-500">No time logs yet. Start tracking your time!</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'achievements' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Achievements</h2>
                <button onClick={() => setShowAchievementForm(!showAchievementForm)} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                  <Plus size={20} />
                  <span>Add Achievement</span>
                </button>
              </div>

              {showAchievementForm && (
                <div className="bg-white rounded-xl shadow p-6 mb-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">New Achievement</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="achievement-title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                      <input id="achievement-title" type="text" value={achievementForm.title} onChange={(e) => setAchievementForm({...achievementForm, title: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="What did you achieve?" />
                    </div>
                    <div>
                      <label htmlFor="achievement-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea id="achievement-description" value={achievementForm.description} onChange={(e) => setAchievementForm({...achievementForm, description: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" rows={3} placeholder="Tell more about it" />
                    </div>
                    <div>
                      <label htmlFor="achievement-date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                      <input id="achievement-date" type="date" value={achievementForm.date} onChange={(e) => setAchievementForm({...achievementForm, date: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" aria-label="Achievement date" />
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={handleAddAchievement} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                        <Save size={18} />
                        <span>Save</span>
                      </button>
                      <button onClick={() => { setShowAchievementForm(false); setAchievementForm({ title: '', description: '', date: new Date().toISOString().split('T')[0] }); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {achievements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(achievement => (
                  <div key={achievement.id} className="bg-white rounded-xl shadow p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <Award className="text-yellow-500" size={24} />
                          <h3 className="text-xl font-bold text-gray-800">{achievement.title}</h3>
                        </div>
                        <p className="text-gray-600 ml-9 mb-3">{achievement.description}</p>
                        <div className="flex items-center space-x-4 ml-9 text-sm">
                          <span className="text-gray-500">{achievement.date}</span>
                        </div>
                      </div>
                      <button onClick={() => handleDeleteAchievement(achievement.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Delete achievement">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                {achievements.length === 0 && (
                  <div className="bg-white rounded-xl shadow p-12 text-center">
                    <Award size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">No achievements yet. Celebrate your wins!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'content' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Content Creation</h2>
                <button onClick={() => setShowContentForm(!showContentForm)} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                  <Plus size={20} />
                  <span>Add Content</span>
                </button>
              </div>

              {showContentForm && (
                <div className="bg-white rounded-xl shadow p-6 mb-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">{editingContent ? 'Edit Content' : 'New Content'}</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="content-title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                      <input id="content-title" type="text" value={contentForm.title} onChange={(e) => setContentForm({...contentForm, title: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Enter content title" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="content-type" className="block text-sm font-medium text-gray-700 mb-1">Content Type</label>
                        <select id="content-type" value={contentForm.type} onChange={(e) => setContentForm({...contentForm, type: e.target.value as 'youtube' | 'instagram' | 'script' | 'roadmap', platform: e.target.value === 'youtube' ? 'youtube' : e.target.value === 'instagram' ? 'instagram' : 'general'})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" aria-label="Content type">
                          <option value="youtube">YouTube</option>
                          <option value="instagram">Instagram</option>
                          <option value="script">Script</option>
                          <option value="roadmap">Roadmap</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="content-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select id="content-status" value={contentForm.status} onChange={(e) => setContentForm({...contentForm, status: e.target.value as 'draft' | 'in-progress' | 'completed' | 'published'})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" aria-label="Content status">
                          <option value="draft">Draft</option>
                          <option value="in-progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="published">Published</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="content-script" className="block text-sm font-medium text-gray-700 mb-1">Script / Content</label>
                      <textarea id="content-script" value={contentForm.script} onChange={(e) => setContentForm({...contentForm, script: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" rows={8} placeholder="Write your script, roadmap, or content here..." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="content-target-date" className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
                        <input id="content-target-date" type="date" value={contentForm.targetDate} onChange={(e) => setContentForm({...contentForm, targetDate: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" aria-label="Target date" />
                      </div>
                      <div>
                        <label htmlFor="content-publish-date" className="block text-sm font-medium text-gray-700 mb-1">Publish Date</label>
                        <input id="content-publish-date" type="date" value={contentForm.publishDate} onChange={(e) => setContentForm({...contentForm, publishDate: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" aria-label="Publish date" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="content-tags" className="block text-sm font-medium text-gray-700 mb-1">Tags (comma separated)</label>
                      <input id="content-tags" type="text" value={contentForm.tags} onChange={(e) => setContentForm({...contentForm, tags: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="e.g., tech, tutorial, tips" />
                    </div>
                    <div>
                      <label htmlFor="content-notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <textarea id="content-notes" value={contentForm.notes} onChange={(e) => setContentForm({...contentForm, notes: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" rows={3} placeholder="Additional notes or reminders..." />
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={editingContent ? handleUpdateContent : handleAddContent} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                        <Save size={18} />
                        <span>{editingContent ? 'Update' : 'Save'}</span>
                      </button>
                      <button onClick={() => { setShowContentForm(false); setEditingContent(null); setContentForm({ title: '', type: 'youtube', platform: 'youtube', script: '', status: 'draft', publishDate: '', targetDate: '', tags: '', notes: '' }); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Content Filters */}
              <div className="flex items-center space-x-2 mb-4 flex-wrap gap-2">
                <button onClick={() => setActiveTab('content')} className={`px-4 py-2 rounded-lg ${true ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'}`}>
                  All ({contents.length})
                </button>
                <button onClick={() => setActiveTab('content')} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
                  YouTube ({contents.filter(c => c.type === 'youtube').length})
                </button>
                <button onClick={() => setActiveTab('content')} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
                  Instagram ({contents.filter(c => c.type === 'instagram').length})
                </button>
                <button onClick={() => setActiveTab('content')} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
                  Scripts ({contents.filter(c => c.type === 'script').length})
                </button>
                <button onClick={() => setActiveTab('content')} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
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
                    draft: 'bg-gray-100 text-gray-700',
                    'in-progress': 'bg-yellow-100 text-yellow-700',
                    completed: 'bg-blue-100 text-blue-700',
                    published: 'bg-green-100 text-green-700'
                  };
                  return (
                    <div key={content.id} className="bg-white rounded-xl shadow p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <IconComponent className={content.type === 'youtube' ? 'text-red-500' : content.type === 'instagram' ? 'text-pink-500' : 'text-indigo-500'} size={24} />
                            <h3 className="text-xl font-bold text-gray-800">{content.title}</h3>
                            <span className={`px-3 py-1 rounded-full text-sm ${statusColors[content.status]}`}>
                              {content.status}
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 mb-3 text-sm text-gray-600">
                            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full capitalize">{content.type}</span>
                            {content.targetDate && <span>Target: {content.targetDate}</span>}
                            {content.publishDate && <span>Published: {content.publishDate}</span>}
                          </div>
                          {content.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {content.tags.map((tag, idx) => (
                                <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">#{tag}</span>
                              ))}
                            </div>
                          )}
                          {content.script && (
                            <div className="bg-gray-50 rounded-lg p-4 mb-3 max-h-48 overflow-y-auto">
                              <p className="text-gray-700 whitespace-pre-wrap text-sm">{content.script}</p>
                            </div>
                          )}
                          {content.notes && (
                            <p className="text-gray-600 text-sm italic">Note: {content.notes}</p>
                          )}
                        </div>
                        <div className="flex space-x-2 ml-4">
                          <button onClick={() => handleEditContent(content)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Edit content">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDeleteContent(content.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Delete content">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {contents.length === 0 && (
                  <div className="bg-white rounded-xl shadow p-12 text-center">
                    <Video size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">No content yet. Start creating your scripts and roadmaps!</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default MYMate;

