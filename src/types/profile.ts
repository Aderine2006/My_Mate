export interface ProfileEducation {
  id: string;
  institution: string;
  degree: string;
  branch: string;
  startYear: string;
  graduationYear: string;
  cgpa: string;
  relevantCoursework: string;
  achievements: string[];
}

export interface ProfileExperience {
  id: string;
  company: string;
  role: string;
  employmentType: string;
  startDate: string;
  endDate: string;
  location: string;
  description: string;
  technologies: string[];
  achievements: string[];
}

export interface ProfileProject {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  githubUrl: string;
  liveUrl: string;
  imageUrl: string;
  role: string;
  keyFeatures: string[];
  impact: string;
}

export interface ProfileCertification {
  id: string;
  name: string;
  organization: string;
  issueDate: string;
  expiryDate: string;
  credentialId: string;
  credentialUrl: string;
}

export interface ProfileAchievement {
  id: string;
  title: string;
  type: string;
  organization: string;
  date: string;
  description: string;
  url: string;
}

export interface ProfessionalProfile {
  avatarUrl: string;
  headline: string;
  currentRole: string;
  location: string;
  githubUrl: string;
  linkedInUrl: string;
  portfolioUrl: string;
  resumeUrl: string;
  summary: string;
  careerObjective: string;
  currentFocus: string;
  longTermGoal: string;
  education: ProfileEducation[];
  experience: ProfileExperience[];
  projects: ProfileProject[];
  certifications: ProfileCertification[];
  achievements: ProfileAchievement[];
}