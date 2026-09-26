import { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Search,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { exportSkillCsv, isHttpUrl, parseSkillCsv, SKILL_CSV_HEADERS } from '../../utils/csvParser';
import type { SkillCsvPreview, SkillPriority, SkillTopic, SkillTopicStatus } from '../../types/skill';

interface SkillsTrackerProps {
  topics: SkillTopic[];
  onTopicsChange: (topics: SkillTopic[]) => Promise<void> | void;
}

const SAMPLE_CSV = [
  SKILL_CSV_HEADERS.join(','),
  'Python,Programming,Python Basics,Variables and Data Types,High,Beginner,Intermediate,Not Started,https://example.com,Learn Python fundamentals',
  'Python,Programming,Python Basics,Functions,High,Beginner,Intermediate,Not Started,https://example.com,Practice functions',
  'Python,Programming,Data Structures,Lists and Tuples,High,Beginner,Intermediate,In Progress,https://example.com,Practice common operations',
  'SQL,Database,SQL Fundamentals,SELECT Queries,High,Beginner,Intermediate,Completed,https://example.com,Revise SQL basics',
  'SQL,Database,SQL Fundamentals,JOINs,High,Beginner,Intermediate,Not Started,https://example.com,Practice INNER JOIN and LEFT JOIN',
  'React,Frontend,React Fundamentals,Components,Medium,Beginner,Intermediate,Not Started,https://example.com,Build reusable components',
  'React,Frontend,React Fundamentals,Hooks,High,Beginner,Intermediate,Not Started,https://example.com,Learn useState and useEffect',
].join('\n');

const priorityRank: Record<SkillPriority, number> = { High: 0, Medium: 1, Low: 2 };
const statusRank: Record<SkillTopicStatus, number> = { 'In Progress': 0, 'Not Started': 1, Completed: 2 };
const levelRank = (level: string): number => ({ beginner: 0, intermediate: 1, advanced: 2, expert: 3 }[level.toLowerCase()] ?? 2);

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const SkillsTracker = ({ topics, onTopicsChange }: SkillsTrackerProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [fileDetails, setFileDetails] = useState<{ name: string; size: number } | null>(null);
  const [preview, setPreview] = useState<SkillCsvPreview | null>(null);
  const [fileError, setFileError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentLevelFilter, setCurrentLevelFilter] = useState('');
  const [targetLevelFilter, setTargetLevelFilter] = useState('');

  const categories = useMemo(() => [...new Set(topics.map(topic => topic.category))].sort(), [topics]);
  const skills = useMemo(() => [...new Set(topics.map(topic => topic.skill))].sort(), [topics]);
  const completedCount = topics.filter(topic => topic.status === 'Completed').length;
  const inProgressCount = topics.filter(topic => topic.status === 'In Progress').length;
  const notStartedCount = topics.filter(topic => topic.status === 'Not Started').length;
  const overallProgress = topics.length ? Math.round(completedCount / topics.length * 100) : 0;

  const filteredTopics = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return topics.filter(topic => {
      const matchesSearch = !normalizedSearch || [topic.skill, topic.topic, topic.subtopic, topic.category]
        .some(value => value.toLocaleLowerCase().includes(normalizedSearch));
      return matchesSearch
        && (!categoryFilter || topic.category === categoryFilter)
        && (!skillFilter || topic.skill === skillFilter)
        && (!priorityFilter || topic.priority === priorityFilter)
        && (!statusFilter || topic.status === statusFilter)
        && (!currentLevelFilter || topic.currentLevel === currentLevelFilter)
        && (!targetLevelFilter || topic.targetLevel === targetLevelFilter);
    });
  }, [topics, search, categoryFilter, skillFilter, priorityFilter, statusFilter, currentLevelFilter, targetLevelFilter]);

  const groupedTopics = useMemo(() => {
    const groups = new Map<string, Map<string, SkillTopic[]>>();
    filteredTopics.forEach(topic => {
      const categoryGroup = groups.get(topic.category) ?? new Map<string, SkillTopic[]>();
      const skillGroup = categoryGroup.get(topic.skill) ?? [];
      skillGroup.push(topic);
      categoryGroup.set(topic.skill, skillGroup);
      groups.set(topic.category, categoryGroup);
    });
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [filteredTopics]);

  const roadmap = useMemo(() => topics
    .filter(topic => topic.status !== 'Completed')
    .sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority]
      || statusRank[left.status] - statusRank[right.status]
      || levelRank(left.currentLevel) - levelRank(right.currentLevel)
      || levelRank(left.targetLevel) - levelRank(right.targetLevel)
      || left.category.localeCompare(right.category))
    .slice(0, 6), [topics]);

  const processFile = async (file?: File) => {
    setFileError('');
    setSaveError('');
    setSuccessMessage('');
    setPreview(null);
    if (!file) return;
    setFileDetails({ name: file.name, size: file.size });
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError('Choose a file with the .csv extension.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError('CSV files must be 10 MB or smaller.');
      return;
    }

    setIsParsing(true);
    try {
      const result = parseSkillCsv(await file.text(), topics);
      if (result.errors.length > 0) {
        setFileError(`Import failed. ${result.errors.join(' ')}`);
        return;
      }
      setPreview(result);
    } catch {
      setFileError('The file could not be read. Check that it is a valid UTF-8 CSV and try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!preview || preview.topics.length === 0) return;
    setIsImporting(true);
    setSaveError('');
    try {
      await onTopicsChange([...topics, ...preview.topics]);
      setSuccessMessage(`${preview.topics.length} topics imported; ${preview.duplicateCount} duplicates skipped.`);
      setPreview(null);
    } catch {
      setSaveError('Topics could not be saved. Check your connection and try importing again.');
    } finally {
      setIsImporting(false);
    }
  };

  const updateTopic = async (id: string, updates: Partial<SkillTopic>) => {
    setSaveError('');
    try {
      await onTopicsChange(topics.map(topic => topic.id === id
        ? { ...topic, ...updates, updatedAt: new Date().toISOString() }
        : topic));
    } catch {
      setSaveError('Your change could not be saved. Check your connection and try again.');
    }
  };

  const deleteTopic = async (id: string) => {
    setSaveError('');
    try {
      await onTopicsChange(topics.filter(topic => topic.id !== id));
    } catch {
      setSaveError('This topic could not be deleted. Check your connection and try again.');
    }
  };

  const downloadSample = () => {
    const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mymate-skills-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadTracker = () => {
    const url = URL.createObjectURL(new Blob([exportSkillCsv(topics)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `mymate-skills-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('');
    setSkillFilter('');
    setPriorityFilter('');
    setStatusFilter('');
    setCurrentLevelFilter('');
    setTargetLevelFilter('');
  };

  const hasFilters = Boolean(search || categoryFilter || skillFilter || priorityFilter || statusFilter || currentLevelFilter || targetLevelFilter);

  return (
    <section className="space-y-6" aria-labelledby="skills-title">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Learning roadmap</p>
          <h2 id="skills-title" className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">Track sheet</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Import a learning plan, track topic progress, and focus on the next high-priority step.</p>
        </div>
        <button type="button" onClick={() => setIsImportPanelOpen(open => !open)} aria-expanded={isImportPanelOpen} aria-controls="csv-upload-panel" className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">
          <Upload size={16} aria-hidden="true" /> {isImportPanelOpen ? 'Close import' : 'Import CSV'}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Track sheets', value: skills.length, icon: BookOpen },
          { label: 'Topics', value: topics.length, icon: Target },
          { label: 'Completed', value: completedCount, icon: CheckCircle2 },
          { label: 'In progress', value: inProgressCount, icon: Clock3 },
          { label: 'Not started', value: notStartedCount, icon: FileSpreadsheet },
          { label: 'Overall', value: `${overallProgress}%`, icon: CheckCircle2 },
        ].map(stat => (
          <div key={stat.label} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium uppercase">{stat.label}</span>
              <stat.icon size={17} className="text-indigo-600" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        <div className="min-w-0 space-y-6">
          {isImportPanelOpen && <section id="csv-upload-panel" className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" aria-labelledby="csv-upload-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 id="csv-upload-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import learning topics</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">CSV only, up to 10 MB. Your existing topics are checked for duplicates.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={downloadTracker} disabled={!topics.length} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-100">
                  <Download size={16} aria-hidden="true" /> Export CSV
                </button>
                <button type="button" onClick={downloadSample} className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-indigo-300 dark:hover:bg-slate-700">
                  <FileDown size={16} aria-hidden="true" /> Download example CSV
                </button>
                <button type="button" onClick={() => setIsImportPanelOpen(false)} aria-label="Close CSV import" title="Close CSV import" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"><X size={17} /></button>
              </div>
            </div>

            <div
              onDragOver={event => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={event => { event.preventDefault(); setIsDragging(false); void processFile(event.dataTransfer.files[0]); }}
              className={`mt-4 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${isDragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/40'}`}
            >
              <Upload size={25} className="mx-auto text-indigo-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Drop a CSV file here</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">or choose it from your device</p>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose CSV file" onChange={event => void processFile(event.target.files?.[0])} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">
                <FileSpreadsheet size={17} aria-hidden="true" /> Choose CSV File
              </button>
            </div>

            {fileDetails && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Selected: <span className="font-medium text-slate-900 dark:text-slate-100">{fileDetails.name}</span> ({formatBytes(fileDetails.size)})</p>}
            {isParsing && <p role="status" className="mt-3 flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300"><Loader2 className="animate-spin" size={17} /> Validating and reading CSV…</p>}
            {fileError && <p role="alert" className="mt-3 flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"><AlertCircle size={17} className="mt-0.5 shrink-0" />{fileError}</p>}
            {successMessage && <p role="status" className="mt-3 flex items-start gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{successMessage}</p>}
            {saveError && <p role="alert" className="mt-3 flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"><AlertCircle size={17} className="mt-0.5 shrink-0" />{saveError}</p>}

            <details className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-slate-200">
                CSV format requirements <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">Required headers, in any order: <code className="break-words text-indigo-800 dark:text-indigo-300">skill, category, topic, subtopic, priority, current_level, target_level, status</code>. Optional: <code className="text-indigo-800 dark:text-indigo-300">resource, notes</code>. Priority: High, Medium, Low; other values default to Medium and are preserved in notes. Resource values can be URLs or plain-text labels; only URLs are linked. Status: Not Started, In Progress, Completed.</p>
              <pre className="mt-2 overflow-x-auto rounded-md bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">{SAMPLE_CSV.split('\n')[0]}</pre>
            </details>

            {preview && (
              <div className="mt-5 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20" aria-labelledby="csv-preview-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 id="csv-preview-title" className="font-semibold text-slate-900 dark:text-slate-100">CSV preview</h4>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{preview.topics.length} new topics found; {preview.duplicateCount} duplicate topics skipped.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPreview(null)} disabled={isImporting} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
                    <button type="button" onClick={() => void handleImport()} disabled={isImporting || preview.topics.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                      {isImporting && <Loader2 size={15} className="animate-spin" />}
                      Import Topics
                    </button>
                  </div>
                </div>
                {preview.warnings.length > 0 && <ul role="status" className="mt-3 space-y-1 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
                <div className="mt-3 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>{['Skill', 'Category', 'Topic', 'Subtopic', 'Priority'].map(label => <th key={label} className="px-3 py-2 font-semibold">{label}</th>)}</tr></thead>
                    <tbody>{preview.topics.slice(0, 12).map(topic => <tr key={topic.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-3 py-2">{topic.skill}</td><td className="px-3 py-2">{topic.category}</td><td className="px-3 py-2">{topic.topic}</td><td className="px-3 py-2">{topic.subtopic || '—'}</td><td className="px-3 py-2">{topic.priority}</td></tr>)}</tbody>
                  </table>
                </div>
                {preview.topics.length > 12 && <p className="mt-2 text-xs text-slate-500">Showing 12 of {preview.topics.length} rows.</p>}
              </div>
            )}
          </section>}

          <section aria-labelledby="topic-list-title" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 id="topic-list-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Learning topics</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{filteredTopics.length} of {topics.length} topics</p>
              </div>
              {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300"><X size={15} /> Clear filters</button>}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="relative sm:col-span-2 xl:col-span-1"><span className="sr-only">Search skills and topics</span><Search size={16} className="absolute left-3 top-3 text-slate-400" aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search skill, topic…" className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-indigo-900" /></label>
              <FilterSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} options={categories} />
              <FilterSelect label="Skill" value={skillFilter} onChange={setSkillFilter} options={skills} />
              <FilterSelect label="Priority" value={priorityFilter} onChange={setPriorityFilter} options={['High', 'Medium', 'Low']} />
              <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={['Not Started', 'In Progress', 'Completed']} />
              <FilterSelect label="Current level" value={currentLevelFilter} onChange={setCurrentLevelFilter} options={[...new Set(topics.map(topic => topic.currentLevel))].sort()} />
              <FilterSelect label="Target level" value={targetLevelFilter} onChange={setTargetLevelFilter} options={[...new Set(topics.map(topic => topic.targetLevel))].sort()} />
            </div>

            {topics.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-800">
                <BookOpen size={32} className="mx-auto text-indigo-600" aria-hidden="true" />
                <h4 className="mt-3 font-semibold text-slate-900 dark:text-slate-100">Your learning plan starts with a CSV</h4>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Upload a topic list to build your tracker and roadmap.</p>
              </div>
            ) : groupedTopics.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">No topics match these filters.</p>
            ) : groupedTopics.map(([category, skillGroups]) => (
              <details key={category} open className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-indigo-600 dark:bg-slate-900/50">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{category}</span>
                  <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{[...skillGroups.values()].flat().filter(topic => topic.status === 'Completed').length}/{[...skillGroups.values()].flat().length} <ChevronDown size={16} className="ml-2 inline" /></span>
                </summary>
                {[...skillGroups.entries()].map(([skill, skillTopics]) => (
                  <div key={skill} className="border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <h4 className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">{skill}</h4>
                      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{skillTopics.filter(topic => topic.status === 'Completed').length}/{skillTopics.length}</span>
                    </div>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                      {skillTopics.map(topic => (
                        <li key={topic.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40">
                          <input
                            type="checkbox"
                            checked={topic.status === 'Completed'}
                            onChange={event => void updateTopic(topic.id, { status: event.target.checked ? 'Completed' : 'Not Started' })}
                            aria-label={`Mark ${topic.topic} ${topic.status === 'Completed' ? 'incomplete' : 'complete'}`}
                            className="mt-0.5 h-5 w-5 cursor-pointer accent-indigo-600"
                          />
                          <div className="min-w-0">
                            <p className={`text-sm font-medium ${topic.status === 'Completed' ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>{topic.topic}</p>
                            {topic.subtopic && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{topic.subtopic}</p>}
                            {topic.notes && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500 dark:text-slate-400">{topic.notes}</p>}
                            {topic.resource && (isHttpUrl(topic.resource)
                              ? <a href={topic.resource} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-700 underline dark:text-indigo-300"><ExternalLink size={12} /> Resource</a>
                              : <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{topic.resource}</p>)}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded px-2 py-1 text-xs font-semibold ${topic.priority === 'High' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : topic.priority === 'Medium' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>{topic.priority}</span>
                            <button type="button" onClick={() => void deleteTopic(topic.id)} className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-300" aria-label={`Delete ${topic.topic}`} title="Delete topic"><Trash2 size={15} /></button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </details>
            ))}
          </section>
        </div>

        <aside className="h-fit rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" aria-labelledby="roadmap-title">
          <div className="flex items-center gap-2"><Target size={18} className="text-indigo-600" /><h3 id="roadmap-title" className="font-semibold text-slate-900 dark:text-slate-100">Your learning roadmap</h3></div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Prioritized by urgency, progress, and current level.</p>
          {roadmap.length ? <ol className="mt-4 space-y-3">{roadmap.map((topic, index) => <li key={topic.id} className="flex gap-3 border-t border-slate-100 pt-3 first:border-0 first:pt-0 dark:border-slate-700"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">{index + 1}</span><div className="min-w-0"><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{topic.topic}{topic.subtopic ? ` · ${topic.subtopic}` : ''}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{topic.skill} · {topic.category}</p><div className="mt-1 flex flex-wrap gap-2 text-xs"><span className="font-medium text-indigo-800 dark:text-indigo-300">{topic.priority} priority</span><span className="text-slate-500 dark:text-slate-400">{topic.status}</span></div></div></li>)}</ol> : <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">Import topics to see your next learning steps.</p>}
        </aside>
      </div>
    </section>
  );
};

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}

const FilterSelect = ({ label, value, onChange, options }: FilterSelectProps) => (
  <label className="block">
    <span className="sr-only">Filter by {label}</span>
    <select value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
      <option value="">All {label.toLowerCase()}</option>
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
);

export default SkillsTracker;