
export enum Subject {
  MATHEMATICS = 'Mathematics',
  PHYSICS = 'Physics',
  CHEMISTRY = 'Chemistry',
  LIFE_SCIENCE = 'Life Science',
  GEOGRAPHY = 'Geography',
  HISTORY = 'History',
  ENGLISH = 'English',
  
}

export enum BookletType {
  READING_ONLY = 'Reading Material Only',
  WITH_SOLUTIONS = 'With Solutions'
}

export enum Difficulty {
  LEVEL_1 = 'Knowledge',
  LEVEL_2 = 'Routine',
  LEVEL_3 = 'Complex',
  LEVEL_4 = 'Problem Solving'
}

export enum UserRole {
  STAFF = 'STAFF',
  STUDENT = 'STUDENT',
  SUPER_ADMIN = 'SUPER_ADMIN'
}

export enum UserStatus {
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  DENIED = 'DENIED'
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  status: UserStatus;
  grade?: string;
  createdAt: number;
}

export interface Question {
  id: string;
  topic: string;
  term?: string;
  number: number;
  maxMarks: number;
  imageUrls: string[]; 
  solutionImageUrls?: string[]; 
  extractedQuestion: string; 
  generatedSolution: string | null; 
  difficulty?: Difficulty;
  isProcessing: boolean;
  includeImage?: boolean; 
  createdAt: number; // Added for stable sequencing
}

export interface Booklet {
  id: string;
  relatedBookletId?: string;
  title: string;
  subject: string;
  grade: string;
  topic: string;
  compiler: string;
  type: BookletType;
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
  questions: Question[];
}

export interface Assignment {
  id: string;
  bookletId: string;
  bookletTitle: string;
  topic: string;
  startNum: number;
  endNum: number;
  dueDate?: string;
  openDate?: string;    // ISO string when the assignment opens for students
  closeDate?: string;   // ISO string when the assignment closes for students
  timeLimitSeconds?: number; // optional time limit per student in seconds
  isPublished?: boolean; // whether students can see the assignment
  grade: string;
  createdAt: number;
}

export interface StudentAnswer {
  questionId: string;
  textResponse: string;
  imageResponse?: string;
  aiMark?: number;
  aiFeedback?: string;
  teacherOverrideMark?: number;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  answers: StudentAnswer[];
  totalScore?: number;
  maxScore?: number;
  status: 'SUBMITTED' | 'MARKED' | 'RECORDED';
  submittedAt: number;
}

export interface CreateBookletDTO {
  subject: string;
  grade: string;
  topic: string;
  type: BookletType;
}

export interface AIQuestionResponse {
  questionText: string;
  solutionMarkdown: string | null;
  difficulty: Difficulty;
  totalMarks: number;
  requiresImage: boolean; 
  error?: string;
}
