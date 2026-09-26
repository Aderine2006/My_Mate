export type SkillPriority = 'High' | 'Medium' | 'Low';
export type SkillTopicStatus = 'Not Started' | 'In Progress' | 'Completed';

export interface SkillTopic {
  id: string;
  skill: string;
  category: string;
  topic: string;
  subtopic: string;
  priority: SkillPriority;
  currentLevel: string;
  targetLevel: string;
  status: SkillTopicStatus;
  resource: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillCsvPreview {
  topics: SkillTopic[];
  duplicateCount: number;
  totalRows: number;
  errors: string[];
  warnings: string[];
}