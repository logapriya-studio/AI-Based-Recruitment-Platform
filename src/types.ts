export type UserRole = 'candidate' | 'recruiter' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Candidate {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  skills: string[];
  experienceYears: number;
  education: string;
  projects: string[];
  github: string;
  linkedin: string;
  resumeUrl?: string;
  status: 'applied' | 'shortlisted' | 'rejected' | 'screening';
}

export interface Recruiter {
  id: string;
  userId: string;
  name: string;
  company: string;
}

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  type: 'Full-time' | 'Part-time' | 'Contract' | 'Remote';
  description: string;
  requirements: string[];
  salary: string;
  status: 'open' | 'closed';
  createdBy: string; // Recruiter user ID
  createdAt: string;
}

export interface Application {
  id: string;
  jobId: string;
  candidateId: string;
  appliedDate: string;
  status: 'applied' | 'shortlisted' | 'rejected';
  aiMatchScore: number;
  aiMatchExplanation: string;
}

export interface ParsedResume {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  experienceYears: number;
  education: string;
  projects: string[];
  github: string;
  linkedin: string;
}

export interface CodingQuestion {
  id: string;
  title: string;
  problemStatement: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  skillsTested: string[];
  constraints: string[];
  sampleInput: string;
  sampleOutput: string;
  starterCode: string;
}

export interface CodingSubmission {
  questionId: string;
  submittedCode: string;
  correctnessScore: number;
  timeComplexity: string;
  spaceComplexity: string;
  optimizationFeedback: string;
  score: number;
  feedback: string;
}

export interface InterviewQuestion {
  id: string;
  question: string;
  type: 'hr' | 'technical';
  category?: string; // e.g. Java, Python, Behavioral
}

export interface InterviewEvaluation {
  scores: {
    confidence: number;
    communication: number;
    leadership?: number;
    behavior?: number;
    technical?: number;
  };
  feedback: string;
  overallScore: number;
}

export interface AssessmentState {
  id: string;
  applicationId: string;
  type: 'coding' | 'interview';
  subType: 'coding' | 'hr' | 'technical';
  questions: any[];
  answers: Record<string, string>;
  scores: Record<string, any>;
  completed: boolean;
  score?: number;
  feedback?: string;
}

export interface PlatformStats {
  totalCandidates: number;
  totalRecruiters: number;
  totalJobs: number;
  totalApplications: number;
  averageMatchScore: number;
  applicationsByStatus: {
    applied: number;
    shortlisted: number;
    rejected: number;
  };
}
