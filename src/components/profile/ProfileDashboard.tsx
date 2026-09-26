import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Briefcase,
  ExternalLink,
  FileText,
  Github,
  GraduationCap,
  Linkedin,
  Loader2,
  MapPin,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import { loadFromFirestore, saveToFirestore } from '../../firestore-helpers';
import type { ProfessionalProfile } from '../../types/profile';

interface ProfileUser {
  id: string;
  name: string;
  email: string;
}

interface ProfileDashboardProps {
  user: ProfileUser;
}

type ProfileSection = 'overview' | 'education' | 'experience' | 'projects' | 'certifications' | 'achievements';

const SECTIONS: Array<{ id: ProfileSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'education', label: 'Education' },
  { id: 'experience', label: 'Experience' },
  { id: 'projects', label: 'Projects' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'achievements', label: 'Achievements' },
];

const EMPTY_PROFILE: ProfessionalProfile = {
  avatarUrl: '',
  headline: '',
  currentRole: '',
  location: '',
  githubUrl: '',
  linkedInUrl: '',
  portfolioUrl: '',
  resumeUrl: '',
  summary: '',
  careerObjective: '',
  currentFocus: '',
  longTermGoal: '',
  education: [],
  experience: [],
  projects: [],
  certifications: [],
  achievements: [],
};

const createId = (): string => globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const splitLines = (value: string): string[] => value.split('\n').map(item => item.trim()).filter(Boolean);
const joinLines = (values: string[]): string => values.join('\n');
const isFilled = (value: string): boolean => Boolean(value.trim());
const safeWebUrl = (value: string): string => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
};

const ProfileEditContext = createContext(false);

const normalizeProfile = (value: unknown): ProfessionalProfile => {
  if (!value || typeof value !== 'object') return EMPTY_PROFILE;
  const stored = value as Partial<ProfessionalProfile>;
  return {
    ...EMPTY_PROFILE,
    ...stored,
    education: Array.isArray(stored.education) ? stored.education : [],
    experience: Array.isArray(stored.experience) ? stored.experience : [],
    projects: Array.isArray(stored.projects) ? stored.projects : [],
    certifications: Array.isArray(stored.certifications) ? stored.certifications : [],
    achievements: Array.isArray(stored.achievements) ? stored.achievements : [],
  };
};

const updateItem = <T extends { id: string }>(items: T[], id: string, updates: Partial<T>): T[] =>
  items.map(item => item.id === id ? { ...item, ...updates } : item);

const completionForItems = <T,>(items: T[], fields: Array<(item: T) => string>): number => {
  if (!items.length) return 0;
  const fieldCount = items.length * fields.length;
  const filledCount = items.reduce((sum, item) => sum + fields.filter(field => isFilled(field(item))).length, 0);
  return filledCount / fieldCount;
};

const Field = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) => (
  <label className="block min-w-0">
    <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
    <input type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-900" />
  </label>
);

const TextAreaField = ({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) => (
  <label className="block min-w-0">
    <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
    <textarea rows={rows} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-900" />
  </label>
);

const ItemFrame = ({ title, onRemove, children }: { title: string; onRemove: () => void; children: React.ReactNode }) => {
  const isEditing = useContext(ProfileEditContext);
  return (
    <article className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
        {isEditing && <button type="button" onClick={onRemove} aria-label={`Remove ${title}`} className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-300"><Trash2 size={16} /></button>}
      </div>
      {children}
    </article>
  );
};

const ProfileAvatar = ({ name, imageUrl }: { name: string; imageUrl: string }) => {
  const [imageFailed, setImageFailed] = useState(false);
  return imageUrl && !imageFailed
    ? <img src={imageUrl} alt={`${name}'s profile`} onError={() => setImageFailed(true)} className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-md dark:border-slate-800" />
    : <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-indigo-100 text-3xl font-bold text-indigo-800 shadow-md dark:border-slate-800 dark:bg-indigo-950 dark:text-indigo-200" aria-label="Profile avatar">{name.trim().charAt(0).toUpperCase() || <UserRound size={32} />}</div>;
};

const ProfileDashboard = ({ user }: ProfileDashboardProps) => {
  const [profile, setProfile] = useState<ProfessionalProfile>(EMPTY_PROFILE);
  const persistedProfile = useRef(EMPTY_PROFILE);
  const [activeSection, setActiveSection] = useState<ProfileSection>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      setIsLoading(true);
      setProfile(EMPTY_PROFILE);
      persistedProfile.current = EMPTY_PROFILE;
      try {
        const stored = await loadFromFirestore(user.id, 'profile');
        if (!active) return;
        if (stored) {
          const normalized = normalizeProfile(stored);
          setProfile(normalized);
          persistedProfile.current = normalized;
          localStorage.setItem(`profile-${user.id}`, JSON.stringify(normalized));
        } else {
          const localProfile = localStorage.getItem(`profile-${user.id}`);
          if (localProfile) {
            const normalized = normalizeProfile(JSON.parse(localProfile));
            setProfile(normalized);
            persistedProfile.current = normalized;
          }
        }
        setError('');
      } catch {
        if (!active) return;
        const localProfile = localStorage.getItem(`profile-${user.id}`);
        if (localProfile) {
          try {
            const normalized = normalizeProfile(JSON.parse(localProfile));
            setProfile(normalized);
            persistedProfile.current = normalized;
          } catch {
            setError('Saved profile data could not be read.');
          }
        } else {
          setError('Profile sync is unavailable. Your changes can still be saved locally.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadProfile();
    return () => { active = false; };
  }, [user.id]);

  const completion = useMemo(() => {
    const basics = [user.name, user.email, profile.headline, profile.currentRole, profile.location];
    const socials = [profile.githubUrl, profile.linkedInUrl, profile.portfolioUrl, profile.resumeUrl];
    const education = completionForItems(profile.education, [item => item.institution, item => item.degree, item => item.branch, item => item.graduationYear]);
    const experience = completionForItems(profile.experience, [item => item.company, item => item.role, item => item.startDate, item => item.description]);
    const projects = completionForItems(profile.projects, [item => item.name, item => item.description, item => item.technologies.join(', ')]);
    const certifications = completionForItems(profile.certifications, [item => item.name, item => item.organization, item => item.issueDate]);
    const achievements = completionForItems(profile.achievements, [item => item.title, item => item.type, item => item.description]);
    const sections = [
      basics.filter(isFilled).length / basics.length,
      education,
      experience,
      projects,
      certifications,
      achievements,
      socials.filter(isFilled).length / socials.length,
    ];
    return Math.round(sections.reduce((sum, value) => sum + value, 0) / sections.length * 100);
  }, [user.name, user.email, profile]);

  const updateProfile = <K extends keyof ProfessionalProfile>(key: K, value: ProfessionalProfile[K]) => {
    setProfile(current => ({ ...current, [key]: value }));
    setNotice('');
  };

  const saveProfile = async () => {
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      await saveToFirestore(user.id, 'profile', profile);
      localStorage.setItem(`profile-${user.id}`, JSON.stringify(profile));
      persistedProfile.current = profile;
      setNotice('Profile saved.');
      setIsEditing(false);
    } catch {
      try {
        localStorage.setItem(`profile-${user.id}`, JSON.stringify(profile));
        persistedProfile.current = profile;
        setNotice('Saved on this device. Cloud sync will resume when your connection is available.');
        setIsEditing(false);
      } catch {
        setError('Your profile could not be saved. Check available storage and try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const addEducation = () => updateProfile('education', [...profile.education, { id: createId(), institution: '', degree: '', branch: '', startYear: '', graduationYear: '', cgpa: '', relevantCoursework: '', achievements: [] }]);
  const addExperience = () => updateProfile('experience', [...profile.experience, { id: createId(), company: '', role: '', employmentType: '', startDate: '', endDate: '', location: '', description: '', technologies: [], achievements: [] }]);
  const addProject = () => updateProfile('projects', [...profile.projects, { id: createId(), name: '', description: '', technologies: [], githubUrl: '', liveUrl: '', imageUrl: '', role: '', keyFeatures: [], impact: '' }]);
  const addCertification = () => updateProfile('certifications', [...profile.certifications, { id: createId(), name: '', organization: '', issueDate: '', expiryDate: '', credentialId: '', credentialUrl: '' }]);
  const addAchievement = () => updateProfile('achievements', [...profile.achievements, { id: createId(), title: '', type: '', organization: '', date: '', description: '', url: '' }]);

  const socialLinks = [
    { label: 'GitHub', href: profile.githubUrl, icon: Github },
    { label: 'LinkedIn', href: profile.linkedInUrl, icon: Linkedin },
    { label: 'Portfolio', href: profile.portfolioUrl, icon: ExternalLink },
    { label: 'Resume', href: profile.resumeUrl, icon: FileText },
  ].map(link => ({ ...link, href: safeWebUrl(link.href) })).filter(link => link.href);

  return (
    <section className="mx-auto max-w-7xl space-y-6" aria-labelledby="profile-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Career portfolio</p><h2 id="profile-title" className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">Professional profile</h2></div>
        {!isEditing
          ? <button type="button" onClick={() => { setIsEditing(true); setNotice(''); }} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"><Sparkles size={16} /> Edit profile</button>
          : <div className="flex gap-2"><button type="button" onClick={() => { setProfile(persistedProfile.current); setIsEditing(false); }} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button><button type="button" onClick={() => void saveProfile()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save profile</button></div>}
      </div>

      {notice && <p role="status" className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200">{notice}</p>}
      {error && <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {isLoading ? <div role="status" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><Loader2 size={18} className="animate-spin text-indigo-600" /> Loading your profile…</div> : (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 sm:p-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <ProfileAvatar key={profile.avatarUrl} name={user.name} imageUrl={profile.avatarUrl} />
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-2xl font-bold text-slate-900 dark:text-slate-100">{user.name}</h3>
                <p className="mt-1 text-base font-medium text-indigo-800 dark:text-indigo-300">{profile.headline || 'Add a professional headline'}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300"><span className="inline-flex items-center gap-1.5"><Briefcase size={15} />{profile.currentRole || 'Current role not set'}</span><span className="inline-flex items-center gap-1.5"><MapPin size={15} />{profile.location || 'Location not set'}</span><span className="inline-flex items-center gap-1.5 break-all"><span aria-hidden="true">@</span>{user.email}</span></p>
                <div className="mt-4 flex flex-wrap gap-2">{socialLinks.map(link => <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-200 dark:hover:text-indigo-300"><link.icon size={15} />{link.label}</a>)}</div>
              </div>
              <div className="w-full rounded-lg bg-slate-50 p-4 sm:w-48 dark:bg-slate-900">
                <div className="flex items-end justify-between"><span className="text-sm font-medium text-slate-600 dark:text-slate-300">Profile completion</span><span className="text-xl font-bold tabular-nums text-indigo-700 dark:text-indigo-300">{completion}%</span></div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${completion}%` }} /></div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Calculated from your profile sections</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border-b border-slate-200 dark:border-slate-700">
            <div role="tablist" aria-label="Profile sections" className="flex min-w-max gap-1">
              {SECTIONS.map(section => <button key={section.id} type="button" role="tab" aria-selected={activeSection === section.id} onClick={() => setActiveSection(section.id)} className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${activeSection === section.id ? 'border-indigo-600 text-indigo-800 dark:text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`}>{section.label}</button>)}
            </div>
          </div>

          <ProfileEditContext.Provider value={isEditing}>
          <div role="tabpanel" className="min-h-64">
            {activeSection === 'overview' && <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
              <div className="space-y-6">
                {isEditing ? <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"><h3 className="mb-4 font-semibold text-slate-900 dark:text-slate-100">Professional information</h3><div className="grid gap-4 sm:grid-cols-2"><Field label="Professional headline" value={profile.headline} onChange={value => updateProfile('headline', value)} placeholder="Full Stack Developer | AI Engineer" /><Field label="Current role" value={profile.currentRole} onChange={value => updateProfile('currentRole', value)} placeholder="Computer Science Engineer" /><Field label="Location" value={profile.location} onChange={value => updateProfile('location', value)} placeholder="City, Region" /><Field label="Avatar image URL" type="url" value={profile.avatarUrl} onChange={value => updateProfile('avatarUrl', value)} placeholder="https://…" /><Field label="GitHub URL" type="url" value={profile.githubUrl} onChange={value => updateProfile('githubUrl', value)} placeholder="https://github.com/username" /><Field label="LinkedIn URL" type="url" value={profile.linkedInUrl} onChange={value => updateProfile('linkedInUrl', value)} placeholder="https://linkedin.com/in/username" /><Field label="Portfolio URL" type="url" value={profile.portfolioUrl} onChange={value => updateProfile('portfolioUrl', value)} /><Field label="Resume URL" type="url" value={profile.resumeUrl} onChange={value => updateProfile('resumeUrl', value)} /></div><div className="mt-4 space-y-4"><TextAreaField label="Professional summary" value={profile.summary} onChange={value => updateProfile('summary', value)} rows={4} /><TextAreaField label="Career objective" value={profile.careerObjective} onChange={value => updateProfile('careerObjective', value)} /><div className="grid gap-4 sm:grid-cols-2"><TextAreaField label="Current focus" value={profile.currentFocus} onChange={value => updateProfile('currentFocus', value)} rows={2} /><TextAreaField label="Long-term goal" value={profile.longTermGoal} onChange={value => updateProfile('longTermGoal', value)} rows={2} /></div></div></section> : <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"><h3 className="font-semibold text-slate-900 dark:text-slate-100">Professional summary</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{profile.summary || 'Add a summary to introduce your experience, strengths, and professional interests.'}</p><div className="mt-5 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3 dark:border-slate-700"><ProfileText label="Career objective" value={profile.careerObjective} /><ProfileText label="Current focus" value={profile.currentFocus} /><ProfileText label="Long-term goal" value={profile.longTermGoal} /></div></section>}
                {!isEditing && <div className="grid gap-4 sm:grid-cols-2"><QuickSection icon={GraduationCap} title="Education" value={profile.education[0] ? `${profile.education[0].degree}${profile.education[0].branch ? ` · ${profile.education[0].branch}` : ''}` : 'No education added'} /><QuickSection icon={Briefcase} title="Experience" value={profile.experience.length ? `${profile.experience.length} professional record${profile.experience.length === 1 ? '' : 's'}` : 'No experience added'} /></div>}
              </div>
              <aside className="space-y-4"><section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"><h3 className="font-semibold text-slate-900 dark:text-slate-100">Contact</h3><a href={`mailto:${user.email}`} className="mt-3 inline-flex max-w-full break-all text-sm text-indigo-800 underline dark:text-indigo-300">{user.email}</a></section></aside>
            </div>}

            {activeSection === 'education' && <SectionEditor title="Education" description="Add degrees, coursework, and academic achievements." isEditing={isEditing} onAdd={addEducation} empty={!profile.education.length} emptyText="No education records yet.">{profile.education.map(item => <ItemFrame key={item.id} title={item.degree || item.institution || 'Education'} onRemove={() => updateProfile('education', profile.education.filter(entry => entry.id !== item.id))}>{isEditing ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Institution" value={item.institution} onChange={value => updateProfile('education', updateItem(profile.education, item.id, { institution: value }))} /><Field label="Degree" value={item.degree} onChange={value => updateProfile('education', updateItem(profile.education, item.id, { degree: value }))} /><Field label="Branch" value={item.branch} onChange={value => updateProfile('education', updateItem(profile.education, item.id, { branch: value }))} /><Field label="Start year" value={item.startYear} onChange={value => updateProfile('education', updateItem(profile.education, item.id, { startYear: value }))} /><Field label="Graduation year" value={item.graduationYear} onChange={value => updateProfile('education', updateItem(profile.education, item.id, { graduationYear: value }))} /><Field label="CGPA" value={item.cgpa} onChange={value => updateProfile('education', updateItem(profile.education, item.id, { cgpa: value }))} /><TextAreaField label="Relevant coursework" value={item.relevantCoursework} onChange={value => updateProfile('education', updateItem(profile.education, item.id, { relevantCoursework: value }))} /><TextAreaField label="Achievements (one per line)" value={joinLines(item.achievements)} onChange={value => updateProfile('education', updateItem(profile.education, item.id, { achievements: splitLines(value) }))} /></div> : <ProfileTextList values={[item.institution, `${item.degree}${item.branch ? ` · ${item.branch}` : ''}`, `${item.startYear}${item.graduationYear ? ` – ${item.graduationYear}` : ''}`, item.cgpa ? `CGPA ${item.cgpa}` : '', item.relevantCoursework, ...item.achievements]} />}</ItemFrame>)}</SectionEditor>}

            {activeSection === 'experience' && <SectionEditor title="Experience" description="Highlight roles, technologies, and outcomes." isEditing={isEditing} onAdd={addExperience} empty={!profile.experience.length} emptyText="No experience records yet.">{profile.experience.map(item => <ItemFrame key={item.id} title={item.role || item.company || 'Experience'} onRemove={() => updateProfile('experience', profile.experience.filter(entry => entry.id !== item.id))}>{isEditing ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Company" value={item.company} onChange={value => updateProfile('experience', updateItem(profile.experience, item.id, { company: value }))} /><Field label="Role" value={item.role} onChange={value => updateProfile('experience', updateItem(profile.experience, item.id, { role: value }))} /><Field label="Employment type" value={item.employmentType} onChange={value => updateProfile('experience', updateItem(profile.experience, item.id, { employmentType: value }))} placeholder="Full-time, Internship…" /><Field label="Location" value={item.location} onChange={value => updateProfile('experience', updateItem(profile.experience, item.id, { location: value }))} /><Field label="Start date" type="month" value={item.startDate} onChange={value => updateProfile('experience', updateItem(profile.experience, item.id, { startDate: value }))} /><Field label="End date" type="month" value={item.endDate} onChange={value => updateProfile('experience', updateItem(profile.experience, item.id, { endDate: value }))} /><TextAreaField label="Description" value={item.description} onChange={value => updateProfile('experience', updateItem(profile.experience, item.id, { description: value }))} /><TextAreaField label="Technologies (one per line)" value={joinLines(item.technologies)} onChange={value => updateProfile('experience', updateItem(profile.experience, item.id, { technologies: splitLines(value) }))} /><TextAreaField label="Achievements (one per line)" value={joinLines(item.achievements)} onChange={value => updateProfile('experience', updateItem(profile.experience, item.id, { achievements: splitLines(value) }))} /></div> : <ProfileTextList values={[item.company, item.employmentType, item.location, `${item.startDate}${item.endDate ? ` – ${item.endDate}` : item.startDate ? ' – Present' : ''}`, item.description, item.technologies.join(' · '), ...item.achievements]} />}</ItemFrame>)}</SectionEditor>}

            {activeSection === 'projects' && <SectionEditor title="Projects" description="Showcase your work, contributions, and measurable impact." isEditing={isEditing} onAdd={addProject} empty={!profile.projects.length} emptyText="No projects added yet.">{profile.projects.map(item => <ItemFrame key={item.id} title={item.name || 'Project'} onRemove={() => updateProfile('projects', profile.projects.filter(entry => entry.id !== item.id))}>{isEditing ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Project name" value={item.name} onChange={value => updateProfile('projects', updateItem(profile.projects, item.id, { name: value }))} /><Field label="Role" value={item.role} onChange={value => updateProfile('projects', updateItem(profile.projects, item.id, { role: value }))} /><Field label="GitHub URL" type="url" value={item.githubUrl} onChange={value => updateProfile('projects', updateItem(profile.projects, item.id, { githubUrl: value }))} /><Field label="Live URL" type="url" value={item.liveUrl} onChange={value => updateProfile('projects', updateItem(profile.projects, item.id, { liveUrl: value }))} /><Field label="Project image URL" type="url" value={item.imageUrl} onChange={value => updateProfile('projects', updateItem(profile.projects, item.id, { imageUrl: value }))} /><TextAreaField label="Description" value={item.description} onChange={value => updateProfile('projects', updateItem(profile.projects, item.id, { description: value }))} /><TextAreaField label="Technologies (one per line)" value={joinLines(item.technologies)} onChange={value => updateProfile('projects', updateItem(profile.projects, item.id, { technologies: splitLines(value) }))} /><TextAreaField label="Key features (one per line)" value={joinLines(item.keyFeatures)} onChange={value => updateProfile('projects', updateItem(profile.projects, item.id, { keyFeatures: splitLines(value) }))} /><TextAreaField label="Impact / metrics" value={item.impact} onChange={value => updateProfile('projects', updateItem(profile.projects, item.id, { impact: value }))} /></div> : <div className="space-y-3">{item.imageUrl && <img src={item.imageUrl} alt={`${item.name} preview`} className="max-h-56 w-full rounded-md object-cover" />}{item.description && <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{item.description}</p>}{item.role && <p className="text-sm text-slate-500">Role: {item.role}</p>}<p className="text-sm text-slate-700 dark:text-slate-200">{item.technologies.join(' · ')}</p>{item.keyFeatures.length > 0 && <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">{item.keyFeatures.map(feature => <li key={feature}>{feature}</li>)}</ul>}{item.impact && <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.impact}</p>}<div className="flex gap-4">{item.githubUrl && <ExternalAnchor href={item.githubUrl}>GitHub repository</ExternalAnchor>}{item.liveUrl && <ExternalAnchor href={item.liveUrl}>Live project</ExternalAnchor>}</div></div>}</ItemFrame>)}</SectionEditor>}

            {activeSection === 'certifications' && <SectionEditor title="Certifications" description="Keep credentials and verification links together." isEditing={isEditing} onAdd={addCertification} empty={!profile.certifications.length} emptyText="No certifications added yet.">{profile.certifications.map(item => <ItemFrame key={item.id} title={item.name || 'Certification'} onRemove={() => updateProfile('certifications', profile.certifications.filter(entry => entry.id !== item.id))}>{isEditing ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Certification name" value={item.name} onChange={value => updateProfile('certifications', updateItem(profile.certifications, item.id, { name: value }))} /><Field label="Issuing organization" value={item.organization} onChange={value => updateProfile('certifications', updateItem(profile.certifications, item.id, { organization: value }))} /><Field label="Issue date" type="month" value={item.issueDate} onChange={value => updateProfile('certifications', updateItem(profile.certifications, item.id, { issueDate: value }))} /><Field label="Expiry date" type="month" value={item.expiryDate} onChange={value => updateProfile('certifications', updateItem(profile.certifications, item.id, { expiryDate: value }))} /><Field label="Credential ID" value={item.credentialId} onChange={value => updateProfile('certifications', updateItem(profile.certifications, item.id, { credentialId: value }))} /><Field label="Credential URL" type="url" value={item.credentialUrl} onChange={value => updateProfile('certifications', updateItem(profile.certifications, item.id, { credentialUrl: value }))} /></div> : <ProfileTextList values={[item.organization, item.issueDate, item.expiryDate ? `Expires ${item.expiryDate}` : '', item.credentialId && `Credential ID: ${item.credentialId}`]}>{item.credentialUrl && <ExternalAnchor href={item.credentialUrl}>Verify credential</ExternalAnchor>}</ProfileTextList>}</ItemFrame>)}</SectionEditor>}

            {activeSection === 'achievements' && <SectionEditor title="Achievements" description="Record awards, publications, competitions, and leadership." isEditing={isEditing} onAdd={addAchievement} empty={!profile.achievements.length} emptyText="No achievements added yet.">{profile.achievements.map(item => <ItemFrame key={item.id} title={item.title || 'Achievement'} onRemove={() => updateProfile('achievements', profile.achievements.filter(entry => entry.id !== item.id))}>{isEditing ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Title" value={item.title} onChange={value => updateProfile('achievements', updateItem(profile.achievements, item.id, { title: value }))} /><Field label="Type" value={item.type} onChange={value => updateProfile('achievements', updateItem(profile.achievements, item.id, { type: value }))} placeholder="Award, Hackathon, Publication…" /><Field label="Organization" value={item.organization} onChange={value => updateProfile('achievements', updateItem(profile.achievements, item.id, { organization: value }))} /><Field label="Date" type="month" value={item.date} onChange={value => updateProfile('achievements', updateItem(profile.achievements, item.id, { date: value }))} /><Field label="Reference URL" type="url" value={item.url} onChange={value => updateProfile('achievements', updateItem(profile.achievements, item.id, { url: value }))} /><TextAreaField label="Description" value={item.description} onChange={value => updateProfile('achievements', updateItem(profile.achievements, item.id, { description: value }))} /></div> : <ProfileTextList values={[item.type, item.organization, item.date, item.description]}>{item.url && <ExternalAnchor href={item.url}>View achievement</ExternalAnchor>}</ProfileTextList>}</ItemFrame>)}</SectionEditor>}
          </div>
          </ProfileEditContext.Provider>
        </>
      )}
    </section>
  );
};

const SectionEditor = ({
  title,
  description,
  isEditing,
  onAdd,
  empty,
  emptyText,
  children,
}: {
  title: string;
  description: string;
  isEditing: boolean;
  onAdd: () => void;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) => <section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p></div>{isEditing && <button type="button" onClick={onAdd} className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300 dark:hover:bg-slate-800"><Plus size={16} /> Add {title.toLowerCase().replace(/s$/, '')}</button>}</div>{empty && !isEditing ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">{emptyText}</p> : <div className="space-y-4">{children}</div>}</section>;

const ProfileText = ({ label, value }: { label: string; value: string }) => <div><h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</h4><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{value || 'Not added'}</p></div>;

const ProfileTextList = ({ values, children }: { values: Array<string | undefined | false>; children?: React.ReactNode }) => <div className="space-y-1.5">{values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value, index) => <p key={`${index}-${value}`} className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{value}</p>)}{children}</div>;

const QuickSection = ({ icon: Icon, title, value }: { icon: typeof GraduationCap; title: string; value: string }) => <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"><div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300"><Icon size={17} /><h3 className="text-sm font-semibold">{title}</h3></div><p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{value}</p></div>;

const ExternalAnchor = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-800 underline hover:text-indigo-900 dark:text-indigo-300">{children}<ExternalLink size={13} /></a>;

export default ProfileDashboard;