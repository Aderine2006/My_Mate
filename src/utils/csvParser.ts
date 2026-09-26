import Papa from 'papaparse';
import type { SkillCsvPreview, SkillPriority, SkillTopic, SkillTopicStatus } from '../types/skill';

export const SKILL_CSV_HEADERS = [
  'skill',
  'category',
  'topic',
  'subtopic',
  'priority',
  'current_level',
  'target_level',
  'status',
  'resource',
  'notes',
] as const;

const REQUIRED_HEADERS = SKILL_CSV_HEADERS.slice(0, 8);

const normalizeHeader = (value: string): string =>
  value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const normalizeDuplicateKey = (topic: Pick<SkillTopic, 'skill' | 'category' | 'topic' | 'subtopic'>): string =>
  [topic.skill, topic.category, topic.topic, topic.subtopic]
    .map(value => value.trim().toLocaleLowerCase())
    .join('\u0000');

const parsePriority = (value: string): SkillPriority | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  if (normalized === 'low') return 'Low';
  return null;
};

const parseStatus = (value: string): SkillTopicStatus | null => {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (normalized === 'not started') return 'Not Started';
  if (normalized === 'in progress') return 'In Progress';
  if (normalized === 'completed') return 'Completed';
  return null;
};

const getCell = (row: Record<string, string>, key: string): string => (row[key] ?? '').trim();

export const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const parseSkillCsv = (csvText: string, existingTopics: SkillTopic[] = []): SkillCsvPreview => {
  if (!csvText.trim()) {
    return { topics: [], duplicateCount: 0, totalRows: 0, errors: ['The CSV file is empty.'], warnings: [] };
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
  });
  const headers = parsed.meta.fields ?? [];
  const missingHeaders = REQUIRED_HEADERS.filter(header => !headers.includes(header));
  const errors: string[] = [];
  const warnings: string[] = [];

  if (missingHeaders.length > 0) {
    errors.push(`Missing required columns: ${missingHeaders.join(', ')}.`);
  }
  if (parsed.data.length === 0) {
    errors.push('No topic rows were found in the CSV.');
  }
  parsed.errors.forEach(error => {
    errors.push(`CSV format error near row ${(error.row ?? 0) + 2}: ${error.message}.`);
  });

  if (errors.length > 0) {
    return { topics: [], duplicateCount: 0, totalRows: parsed.data.length, errors, warnings };
  }

  const seen = new Set(existingTopics.map(normalizeDuplicateKey));
  const topics: SkillTopic[] = [];
  let duplicateCount = 0;
  let defaultedPriorityCount = 0;
  let plainTextResourceCount = 0;
  const now = new Date().toISOString();

  parsed.data.forEach((row, index) => {
    const rowNumber = index + 2;
    const skill = getCell(row, 'skill');
    const category = getCell(row, 'category');
    const topic = getCell(row, 'topic');
    const subtopic = getCell(row, 'subtopic');
    const priorityValue = getCell(row, 'priority');
    const parsedPriority = parsePriority(priorityValue);
    const priority = parsedPriority ?? 'Medium';
    const currentLevel = getCell(row, 'current_level');
    const targetLevel = getCell(row, 'target_level');
    const status = parseStatus(getCell(row, 'status'));
    const resource = getCell(row, 'resource');
    const notes = getCell(row, 'notes');
    const rowErrors: string[] = [];

    if (!skill) rowErrors.push('skill is required');
    if (!category) rowErrors.push('category is required');
    if (!topic) rowErrors.push('topic is required');
    if (!currentLevel) rowErrors.push('current_level is required');
    if (!targetLevel) rowErrors.push('target_level is required');
    if (!status) rowErrors.push('status must be Not Started, In Progress, or Completed');

    if (rowErrors.length > 0) {
      errors.push(`Row ${rowNumber}: ${rowErrors.join('; ')}.`);
      return;
    }

    const candidate = { skill, category, topic, subtopic };
    const duplicateKey = normalizeDuplicateKey(candidate);
    if (seen.has(duplicateKey)) {
      duplicateCount += 1;
      return;
    }
    seen.add(duplicateKey);
    if (!parsedPriority) defaultedPriorityCount += 1;
    if (resource && !isHttpUrl(resource)) plainTextResourceCount += 1;

    topics.push({
      id: globalThis.crypto?.randomUUID?.() ?? `skill-topic-${Date.now()}-${index}`,
      ...candidate,
      priority,
      currentLevel,
      targetLevel,
      status: status as SkillTopicStatus,
      resource,
      notes: [notes, !parsedPriority && priorityValue ? `Practice tasks: ${priorityValue}` : '']
        .filter(Boolean)
        .join('\n'),
      createdAt: now,
      updatedAt: now,
    });
  });

  if (defaultedPriorityCount > 0) {
    warnings.push(`${defaultedPriorityCount} topic(s) had a blank or unrecognized priority. Medium was assigned and the original value was added to notes.`);
  }
  if (plainTextResourceCount > 0) {
    warnings.push(`${plainTextResourceCount} topic(s) use a plain-text resource label. It was kept as text and will not be linked.`);
  }

  return {
    topics: errors.length > 0 ? [] : topics,
    duplicateCount,
    totalRows: parsed.data.length,
    errors: errors.slice(0, 12).concat(errors.length > 12 ? [`And ${errors.length - 12} more validation errors.`] : []),
    warnings,
  };
};

export const exportSkillCsv = (topics: SkillTopic[]): string =>
  Papa.unparse({
    fields: [...SKILL_CSV_HEADERS],
    data: topics.map(topic => [
      topic.skill,
      topic.category,
      topic.topic,
      topic.subtopic,
      topic.priority,
      topic.currentLevel,
      topic.targetLevel,
      topic.status,
      topic.resource,
      topic.notes,
    ]),
  });