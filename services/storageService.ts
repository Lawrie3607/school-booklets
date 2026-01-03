
import { Booklet, CreateBookletDTO, Question, BookletType, User, UserRole, UserStatus, Assignment, Submission } from "../types";
import DEFAULT_LIBRARY_JSON from "../data/booklet_library_backup.json";

const DB_NAME = 'school_booklet_db';
const STORE_NAME = 'booklets';
const USER_STORE = 'users';
const ASSIGNMENT_STORE = 'assignments';
const SUBMISSION_STORE = 'submissions';
const DB_VERSION = 5; 

let dbInstance: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error("Database failed to open."));
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(USER_STORE)) db.createObjectStore(USER_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ASSIGNMENT_STORE)) db.createObjectStore(ASSIGNMENT_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SUBMISSION_STORE)) db.createObjectStore(SUBMISSION_STORE, { keyPath: 'id' });
    };
  });
};

const performTransaction = <T>(
  storeName: string | string[],
  mode: IDBTransactionMode, 
  callback: (tx: IDBTransaction) => IDBRequest<T> | void
): Promise<T> => {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = callback(tx);
      tx.oncomplete = () => resolve(request ? (request as IDBRequest).result : undefined as any);
      tx.onerror = () => reject(tx.error);
    });
  });
};

const renumberBooklet = (booklet: Booklet) => {
  // Ensure any questions missing a number get assigned a stable per-topic number.
  if (!booklet.questions) booklet.questions = [];
  // Group questions by topic and assign missing numbers deterministically
  const byTopic: Record<string, Question[]> = {};
  for (const q of booklet.questions) {
    const t = q.topic || '__default__';
    if (!byTopic[t]) byTopic[t] = [];
    byTopic[t].push(q);
  }
  for (const t of Object.keys(byTopic)) {
    const list = byTopic[t].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const existingMax = list.reduce((m, q) => q.number && q.number > m ? q.number : m, 0);
    let next = Math.max(1, existingMax + 1);
    for (const q of list) {
      if (!q.number || q.number <= 0) {
        q.number = next++;
      }
    }
  }
  booklet.updatedAt = Date.now();
};

export const initStorage = async () => await openDB();

export const factoryReset = async () => {
  if (dbInstance) dbInstance.close();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => { localStorage.clear(); resolve(null); };
  });
};

export const getBooklets = async () => {
  const booklets = await performTransaction<Booklet[]>(STORE_NAME, 'readonly', tx => tx.objectStore(STORE_NAME).getAll());
  return (booklets || []).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getBookletById = (id: string) => performTransaction<Booklet>(STORE_NAME, 'readonly', tx => tx.objectStore(STORE_NAME).get(id));

export const createBooklet = async (dto: CreateBookletDTO, compiler: string) => {
  const now = Date.now();
  const main: Booklet = {
    id: crypto.randomUUID(),
    title: `${dto.grade} ${dto.subject} - ${dto.topic}`,
    subject: dto.subject, 
    grade: dto.grade, 
    topic: dto.topic,
    type: dto.type, 
    compiler, 
    isPublished: false,
    createdAt: now, 
    updatedAt: now, 
    questions: []
  };
  await performTransaction(STORE_NAME, 'readwrite', tx => { tx.objectStore(STORE_NAME).put(main); });
  return main;
};

export const updateBookletSubject = async (bookletId: string, subject: string) => {
  const booklet = await getBookletById(bookletId);
  if (!booklet) throw new Error('Booklet not found');
  booklet.subject = subject;
  booklet.updatedAt = Date.now();
  await performTransaction(STORE_NAME, 'readwrite', tx => { tx.objectStore(STORE_NAME).put(booklet); });
  return booklet;
};

export const updateBooklet = async (booklet: Booklet) => {
  booklet.updatedAt = Date.now();
  await performTransaction(STORE_NAME, 'readwrite', tx => { tx.objectStore(STORE_NAME).put(booklet); });
  return booklet;
};

export const addQuestionToBooklet = async (bookletId: string, question: Question) => {
  const booklet = await getBookletById(bookletId);
  if (!booklet) return null;
  // compute stable per-topic sequential number: next after max for that topic
  const topic = question.topic || booklet.topic || '__default__';
  const existing = (booklet.questions || []).filter(q => (q.topic || booklet.topic || '__default__') === topic);
  const maxNum = existing.reduce((m, q) => q.number && q.number > m ? q.number : m, 0);
  question.number = (maxNum || 0) + 1;
  booklet.questions.push(question);
  await performTransaction(STORE_NAME, 'readwrite', tx => { tx.objectStore(STORE_NAME).put(booklet); });
  return booklet;
};

export const updateQuestionInBooklet = async (bookletId: string, qId: string, updates: Partial<Question>) => {
  const booklet = await getBookletById(bookletId);
  if (!booklet) return null;
  const idx = booklet.questions.findIndex(q => q.id === qId);
  if (idx !== -1) {
    const original = booklet.questions[idx];
    const merged = { ...original, ...updates } as Question;
    // if topic changed, assign next number in new topic, but do not shift existing numbers
    if (updates.topic && updates.topic !== original.topic) {
      const topic = updates.topic || booklet.topic || '__default__';
      const existing = (booklet.questions || []).filter(q => (q.topic || booklet.topic || '__default__') === topic);
      const maxNum = existing.reduce((m, q) => q.number && q.number > m ? q.number : m, 0);
      merged.number = (maxNum || 0) + 1;
    }
    booklet.questions[idx] = merged;
    // ensure any missing numbers are filled deterministically
    renumberBooklet(booklet);
    await performTransaction(STORE_NAME, 'readwrite', tx => { tx.objectStore(STORE_NAME).put(booklet); });
  }
  return booklet;
};

export const removeQuestionFromBooklet = async (bookletId: string, qId: string) => {
  const booklet = await getBookletById(bookletId);
  if (!booklet) return null;
  // Remove question but do not renumber existing questions to preserve sequence
  booklet.questions = booklet.questions.filter(q => q.id !== qId);
  // fill any missing numbers if present
  renumberBooklet(booklet);
  await performTransaction(STORE_NAME, 'readwrite', tx => { tx.objectStore(STORE_NAME).put(booklet); });
  return booklet;
};

/**
 * ULTRA-RESILIENT DATA IMPORT ENGINE
 * Fixes "Expected ',' or '}'" errors by deep-cleaning the string 
 * and matching boundaries precisely.
 */
export const importData = async (rawContent: string) => {
  try {
    // 1. Initial Cleanup: Remove non-printable control characters and zero-width spaces
    // These often sneak in during copy-paste from text editors or chat apps.
    let sanitized = rawContent
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "")
        .trim();

    // 2. Identify JSON boundaries
    const firstBrace = sanitized.indexOf('{');
    const firstBracket = sanitized.indexOf('[');
    
    let startIndex = -1;
    let expectedEndChar = '';

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIndex = firstBrace;
        expectedEndChar = '}';
    } else if (firstBracket !== -1) {
        startIndex = firstBracket;
        expectedEndChar = ']';
    }

    if (startIndex === -1) {
        throw new Error("Invalid format: No JSON root ({ or [) detected.");
    }

    // 3. Find the LAST valid closing character matching the root
    const lastIdx = sanitized.lastIndexOf(expectedEndChar);
    if (lastIdx === -1 || lastIdx <= startIndex) {
        throw new Error(`Invalid format: Closing '${expectedEndChar}' not found.`);
    }

    let jsonStr = sanitized.substring(startIndex, lastIdx + 1);

    // 4. Sanitize trailing commas which crash standard JSON.parse
    jsonStr = jsonStr.replace(/,(\s*[\]}])/g, '$1');

    // 5. Attempt Parse with Detailed Context Logging on failure
    let data;
    try {
        data = JSON.parse(jsonStr);
    } catch (parseError: any) {
        const msg = parseError.message || "";
        const posMatch = msg.match(/position (\d+)/);
        if (posMatch) {
            const pos = parseInt(posMatch[1]);
            const start = Math.max(0, pos - 50);
            const end = Math.min(jsonStr.length, pos + 50);
            const snippet = jsonStr.substring(start, end);
            console.error(`Detailed JSON Error at pos ${pos}. Context: ...${snippet}...`);
            throw new Error(`Data format error near position ${pos}. Check for hidden characters or truncation. Snippet: "...${snippet}..."`);
        }
        throw parseError;
    }

    // 6. Normalization: Wrap raw arrays into the expected store object
    if (Array.isArray(data)) {
        data = { booklets: data };
    }

    const db = await openDB();
    const stores = [STORE_NAME, USER_STORE, ASSIGNMENT_STORE, SUBMISSION_STORE];
    let totalItems = 0;
    
    for (const storeName of stores) {
      const key = storeName === STORE_NAME ? 'booklets' : storeName;
      const items = data[key];
      
      if (items && Array.isArray(items)) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          
          items.forEach(item => {
            if (storeName === STORE_NAME) renumberBooklet(item);
            store.put(item);
            totalItems++;
          });
          
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    }
    
    return { success: true, count: totalItems };
  } catch (err: any) { 
    console.error("Import Engine Crash:", err);
    return { success: false, count: 0, message: err.message || "Unknown format error" }; 
  }
};

export const exportData = async () => {
  const booklets = await getBooklets();
  const users = await getUsers();
  const assignments = await getAssignments();
  const submissions = await getSubmissions();
  const data = { booklets, users, assignments, submissions, version: 1, exportedAt: Date.now() };
  
  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `pcl_library_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 3000); 
};

export const hasAnyUsers = async () => {
  const users = await performTransaction<User[]>(USER_STORE, 'readonly', tx => tx.objectStore(USER_STORE).getAll());
  return (users || []).length > 0;
};

export const registerUser = async (name: string, email: string, password: string, grade?: string) => {
  const normalizedEmail = email.toLowerCase().trim();
  const users = await performTransaction<User[]>(USER_STORE, 'readonly', tx => tx.objectStore(USER_STORE).getAll());
  if ((users || []).some(u => u.email === normalizedEmail)) throw new Error("Email taken.");
  
  const isFirst = (users || []).length === 0;
  const newUser: User = {
    id: crypto.randomUUID(), name, email: normalizedEmail, password, 
    role: isFirst ? UserRole.SUPER_ADMIN : UserRole.STUDENT,
    status: isFirst ? UserStatus.AUTHORIZED : UserStatus.PENDING,
    grade, createdAt: Date.now()
  };
  await performTransaction(USER_STORE, 'readwrite', tx => { tx.objectStore(USER_STORE).put(newUser); });
  return newUser;
};

export const loginUser = async (email: string, password: string) => {
  const users = await performTransaction<User[]>(USER_STORE, 'readonly', tx => tx.objectStore(USER_STORE).getAll());
  const user = (users || []).find(u => u.email === email.toLowerCase().trim());
  if (!user || user.password !== password) throw new Error("Invalid credentials.");
  return user;
};

export const resetPassword = async (email: string, newPassword: string) => {
  const normalizedEmail = email.toLowerCase().trim();
  const users = await performTransaction<User[]>(USER_STORE, 'readonly', tx => tx.objectStore(USER_STORE).getAll());
  const user = (users || []).find(u => u.email === normalizedEmail);
  if (!user) throw new Error('No account found for that email.');
  user.password = newPassword;
  await performTransaction(USER_STORE, 'readwrite', tx => { tx.objectStore(USER_STORE).put(user); });
  return true;
};

export const getUsers = () => performTransaction<User[]>(USER_STORE, 'readonly', tx => tx.objectStore(USER_STORE).getAll());

export const authorizeUser = async (userId: string, role: UserRole, status: UserStatus) => {
  const user = await performTransaction<User>(USER_STORE, 'readonly', tx => tx.objectStore(USER_STORE).get(userId));
  if (user) {
    user.role = role; user.status = status;
    await performTransaction(USER_STORE, 'readwrite', tx => { tx.objectStore(USER_STORE).put(user); });
  }
};

export const checkAndSeedDatabase = async () => {
  const existing = await getBooklets();
  if (existing.length > 0) return false;
  if (!DEFAULT_LIBRARY_JSON || DEFAULT_LIBRARY_JSON.trim().length < 50) return false;
  await importData(DEFAULT_LIBRARY_JSON);
  return true;
};

export const getAssignments = (grade?: string) => performTransaction<Assignment[]>(ASSIGNMENT_STORE, 'readonly', tx => tx.objectStore(ASSIGNMENT_STORE).getAll()).then(all => grade ? (all || []).filter(a => a.grade === grade) : (all || []));
export const getAssignmentById = (id: string) => performTransaction<Assignment>(ASSIGNMENT_STORE, 'readonly', tx => tx.objectStore(ASSIGNMENT_STORE).get(id));
export const createAssignment = async (data: any) => {
  const assignment = { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
  await performTransaction(ASSIGNMENT_STORE, 'readwrite', tx => { tx.objectStore(ASSIGNMENT_STORE).put(assignment); });
  return assignment;
};

export const createDemoData = async () => {
  const grades = ["Grade 8","Grade 9","Grade 10","Grade 11","Grade 12","University"];
  // create demo students (one per grade)
  const users: User[] = grades.map((g, idx) => ({
    id: crypto.randomUUID(),
    name: `Demo Student ${g}`,
    email: `demo_${g.replace(/\s+/g,'').toLowerCase()}@example.com`,
    password: 'password123',
    role: UserRole.STUDENT,
    status: UserStatus.AUTHORIZED,
    grade: g,
    createdAt: Date.now() - (idx * 1000)
  }));

  await performTransaction(USER_STORE, 'readwrite', tx => {
    const s = tx.objectStore(USER_STORE);
    users.forEach(u => s.put(u));
  });

  // Ensure there is at least one booklet with questions
  let booklets = await getBooklets();
  let booklet: Booklet | null = booklets && booklets.length ? booklets[0] : null;
  if (!booklet) {
    const now = Date.now();
    booklet = {
      id: crypto.randomUUID(),
      title: 'Demo Grade 10; Mathematics',
      subject: ("Mathematics" as any),
      grade: 'Grade 10',
      topic: 'Demo Topics',
      compiler: 'system',
      type: BookletType.WITH_SOLUTIONS,
      isPublished: true,
      createdAt: now,
      updatedAt: now,
      questions: []
    };
    // add three demo questions
    const topics = ['Algebra','Geometry','Trigonometry'];
    for (let i=0;i<3;i++) {
      booklet.questions.push({
        id: crypto.randomUUID(),
        topic: topics[i],
        term: `Term ${i+1}`,
        number: i+1,
        maxMarks: 5,
        imageUrls: [],
        extractedQuestion: `Demo question ${i+1} on ${topics[i]}`,
        generatedSolution: `Demo solution for ${topics[i]}`,
        isProcessing: false,
        includeImage: false,
        createdAt: now + i
      });
    }
    await performTransaction(STORE_NAME, 'readwrite', tx => tx.objectStore(STORE_NAME).put(booklet!));
  }

  // Create or reuse an assignment for the booklet
  const assignments = await getAssignments();
  let assignment = assignments && assignments.length ? assignments[0] : null;
  if (!assignment) {
    assignment = await createAssignment({
      bookletId: booklet.id,
      bookletTitle: booklet.title,
      topic: booklet.topic,
      startNum: 1,
      endNum: Math.min(3, booklet.questions.length || 3),
      grade: booklet.grade,
      isPublished: true,
      openDate: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      closeDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
      timeLimitSeconds: 60 * 30,
      createdAt: Date.now()
    });
  }

  // Create mock submissions for first three demo students
  const demoStudents = users.slice(0,3);
  for (const s of demoStudents) {
    const answers = (booklet.questions || []).slice(0, assignment.endNum).map(q => ({
      questionId: q.id,
      textResponse: `Demo answer by ${s.name} for Q${q.number}`,
      imageResponse: undefined,
      aiMark: Math.floor(Math.random()*5),
      aiFeedback: `Good attempt on ${q.topic}`
    }));
    const total = answers.reduce((acc:any,a:any)=>acc + (a.aiMark||0),0);
    const sub = {
      id: crypto.randomUUID(),
      assignmentId: assignment.id,
      studentId: s.id,
      studentName: s.name,
      answers,
      totalScore: total,
      maxScore: (booklet.questions||[]).slice(0, assignment.endNum).reduce((acc:any,q:any)=>acc + (q.maxMarks||5),0),
      status: 'SUBMITTED',
      submittedAt: Date.now()
    };
    await performTransaction(SUBMISSION_STORE, 'readwrite', tx => tx.objectStore(SUBMISSION_STORE).put(sub));
  }

  return { success: true };
};
export const submitWork = (sub: Submission) => performTransaction(SUBMISSION_STORE, 'readwrite', tx => { tx.objectStore(SUBMISSION_STORE).put(sub); });
export const getSubmissions = (aId?: string, sId?: string) => performTransaction<Submission[]>(SUBMISSION_STORE, 'readonly', tx => tx.objectStore(SUBMISSION_STORE).getAll()).then(all => {
  let f = all || [];
  if (aId) f = f.filter(s => s.assignmentId === aId);
  if (sId) f = f.filter(s => s.studentId === sId);
  return f;
});
