
import { Booklet, CreateBookletDTO, Question, BookletType, User, UserRole, UserStatus, Assignment, Submission } from "../types";
import { supabase } from "./supabaseClient";

// Remote URLs for chunked library data (loaded at runtime to avoid deploy size limits)
const LIBRARY_CHUNK_URLS = [
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/1.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/2.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/3.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/4.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/5.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/6.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/7.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/8.json'
];

const LIBRARY_CACHE_KEY = 'pcl_library_cache';
const LIBRARY_CACHE_VERSION = 'v1';

let libraryLoadPromise: Promise<Booklet[]> | null = null;

// Check if library is cached in IndexedDB
async function getCachedLibrary(): Promise<Booklet[] | null> {
  try {
    const cached = localStorage.getItem(LIBRARY_CACHE_KEY + '_version');
    if (cached !== LIBRARY_CACHE_VERSION) return null;
    
    const db = await openDB();
    const booklets = await new Promise<Booklet[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    
    // If we have booklets, library was already seeded
    if (booklets.length > 0) return booklets;
    return null;
  } catch (e) {
    return null;
  }
}

async function fetchLibraryChunks(): Promise<Booklet[]> {
  // Check cache first
  const cached = await getCachedLibrary();
  if (cached && cached.length > 0) {
    console.log('Using cached library (' + cached.length + ' booklets)');
    try { localStorage.setItem('pcl_library_last_source', 'cache'); localStorage.setItem('pcl_library_last_count', String(cached.length)); } catch (_) {}
    return cached;
  }
  // First try to load any local JSON files placed in the app's /data folder.
  // Prefer using the Electron preload API when available (safe, uses Node fs).
  const localTexts: string[] = [];
  try {
    const anyWindow: any = (typeof window !== 'undefined' ? window : undefined) as any;
    if (anyWindow && anyWindow.electron && typeof anyWindow.electron.listDataFiles === 'function') {
      const files: string[] = await anyWindow.electron.listDataFiles() || [];
      console.log('fetchLibraryChunks: found local files via IPC:', files);
      for (const f of files) {
        try {
          const content = await anyWindow.electron.readDataFile(f);
          if (content && content.toString().trim().length > 0) {
            localTexts.push(content.toString());
            console.log('Loaded local library file via preload:', f, 'size:', content.length);
          }
        } catch (e) {
          console.error('Error reading file:', f, e);
        }
      }
    } else {
      // Fallback: try to fetch common relative paths (works in dev server)
      const localCandidates = [
        '/data/chem_12.json',
        '/data/librarybooks.json',
        '/data/booklet_library_backup.json',
        '/data/booklet_library_backup_2025-12-31.json',
        '/data/library1.json',
        '/data/library2.json'
      ];
      for (const p of localCandidates) {
        try {
          const r = await fetch(p);
          if (r.ok) {
            const txt = await r.text();
            if (txt && txt.trim().length > 0) {
              localTexts.push(txt);
              console.log('Loaded local library chunk via fetch:', p);
            }
          }
        } catch (e) {
          // ignore missing local files
        }
      }
    }
  } catch (e) {
    console.error('Error loading local files:', e);
  }

  if (localTexts.length > 0) {
    try {
      // parse each file which may be an array or an object { booklets: [...] }
      const allBooklets: Booklet[] = [];
      for (const t of localTexts) {
        const parsed = JSON.parse(t);
        const items = Array.isArray(parsed) ? parsed : (parsed.booklets || []);
        for (const b of items) {
          // Normalize grade to "Grade X" format
          if (b.grade && !b.grade.toString().toLowerCase().startsWith('grade')) {
            b.grade = 'Grade ' + b.grade;
          }
          allBooklets.push(b as Booklet);
        }
      }
      console.log('fetchLibraryChunks: parsed', allBooklets.length, 'booklets from local files');
      try { localStorage.setItem('pcl_library_last_source', 'local_files'); localStorage.setItem('pcl_library_last_count', String(allBooklets.length)); } catch(_) {}
      localStorage.setItem(LIBRARY_CACHE_KEY + '_version', LIBRARY_CACHE_VERSION);
      return allBooklets;
    } catch (e) {
      console.warn('Failed to parse local library files, falling back to remote chunks.', e);
    }
  }

  console.log('Fetching library from GitHub...');
  // Fetch each chunk and record failures individually so partial data can still be used.
  const texts: string[] = [];
  for (const u of LIBRARY_CHUNK_URLS) {
    try {
      const res = await fetch(u);
      if (!res.ok) {
        console.warn('Failed to fetch chunk:', u, res.status);
        continue;
      }
      const t = await res.text();
      texts.push(t);
    } catch (e) {
      console.warn('Error fetching chunk:', u, e);
    }
  }
  if (texts.length === 0) {
    console.error('No library chunks could be loaded from remote sources.');
    try { localStorage.setItem('pcl_library_last_source', 'remote_failed'); localStorage.setItem('pcl_library_last_count', '0'); } catch(_) {}
    return [];
  }
  // Chunks are partial arrays; strip outer brackets and join
  const stripped = texts.map(t => t.trim().replace(/^\s*\[/, '').replace(/\]\s*$/, '')).filter(Boolean);
  const merged = '[' + stripped.join(',') + ']';
  const booklets = JSON.parse(merged) as Booklet[];

  // Mark cache version and record telemetry for debugging
  try { localStorage.setItem('pcl_library_last_source', 'github_chunks'); localStorage.setItem('pcl_library_last_count', String(booklets.length)); } catch(_) {}
  localStorage.setItem(LIBRARY_CACHE_KEY + '_version', LIBRARY_CACHE_VERSION);

  return booklets;
}

export function getDefaultLibrary(): Promise<Booklet[]> {
  if (!libraryLoadPromise) {
    libraryLoadPromise = fetchLibraryChunks().catch(err => {
      console.error('Failed to load default library:', err);
      return [] as Booklet[];
    });
  }
  return libraryLoadPromise;
}

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
    request.onerror = (event: any) => {
      console.error('IndexedDB open failed:', { name: request.error?.name, message: request.error?.message, code: (request as any).error?.code, event });
      reject(request.error || new Error("Database failed to open."));
    };
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

let _periodicSyncId: ReturnType<typeof setInterval> | null = null;

export const startPeriodicSync = (ms = 60000) => {
  try {
    if (_periodicSyncId) clearInterval(_periodicSyncId);
    _periodicSyncId = setInterval(() => {
      syncAllData().catch(e => console.warn('Periodic sync failed:', e));
    }, ms);
    console.log('startPeriodicSync: started, interval ms=', ms);
    return _periodicSyncId;
  } catch (e) {
    console.warn('startPeriodicSync error:', e);
    return null;
  }
};

export const stopPeriodicSync = () => {
  if (_periodicSyncId) {
    clearInterval(_periodicSyncId);
    _periodicSyncId = null;
    console.log('stopPeriodicSync: stopped');
  }
};

export const dedupeLibrary = async () => {
  const db = await openDB();
  return new Promise<{ kept: number; removed: number }>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const list: Booklet[] = req.result || [];
      const groups = new Map<string, Booklet[]>();
      for (const b of list) {
        const key = `${(b.grade||'').toString().trim().toLowerCase()}|${(b.subject||'').toString().trim().toLowerCase()}|${(b.title||'').toString().trim().toLowerCase()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(b);
      }
      const deletes: string[] = [];
      for (const [, arr] of groups) {
        if (arr.length > 1) {
          arr.sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          // keep first (most recently updated)
          for (let i = 1; i < arr.length; i++) deletes.push(arr[i].id);
        }
      }
      for (const id of deletes) store.delete(id);
      tx.oncomplete = () => resolve({ kept: list.length - deletes.length, removed: deletes.length });
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
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

export const initStorage = async () => {
  try {
    await openDB();
    // Auto-sync with Supabase on startup (pull remote changes)
    console.log('initStorage: Starting background sync with Supabase...');
    // Pull/push then dedupe to remove accidental duplicates (runs in background)
    syncAllData()
      .then(() => dedupeLibrary().then(r => console.log('initStorage: dedupe result', r)).catch(e => console.warn('initStorage: dedupe failed', e)))
      .catch(e => console.warn('Background sync failed:', e));
    // Start a periodic background sync so desktop and web stay in sync while open
    try { startPeriodicSync(60000); } catch (e) { /* non-fatal */ }
  } catch (err) {
    console.warn('initStorage: IndexedDB unavailable, continuing in degraded mode. Default library will be used.', err);
  }
};

export const factoryReset = async () => {
  if (dbInstance) dbInstance.close();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => { localStorage.clear(); resolve(null); };
  });
};

export const getBooklets = async () => {
  try {
    const booklets = await performTransaction<Booklet[]>(STORE_NAME, 'readonly', tx => tx.objectStore(STORE_NAME).getAll());
    const list = (booklets || []);
    console.log('getBooklets: Retrieved from IndexedDB:', list.length, 'booklets');
    // Sort by grade descending (Z -> A). If grades are equal, sort by most recently updated first.
    list.sort((a, b) => {
      const ga = (a.grade || '').toString();
      const gb = (b.grade || '').toString();
      if (ga === gb) return (b.updatedAt || 0) - (a.updatedAt || 0);
      return gb.localeCompare(ga);
    });
    return list;
  } catch (err) {
    console.error('getBooklets failed, falling back to default library:', err);
    try {
      const def = await getDefaultLibrary();
      console.log('getBooklets: Using default library fallback:', def.length, 'booklets');
      return def;
    } catch (e) {
      console.error('Failed to load default library:', e);
      return [] as Booklet[];
    }
  }
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
  // Auto-sync to Supabase
  syncBookletToRemote(main).catch(e => console.warn('Sync failed:', e));
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
  // Auto-sync to Supabase
  syncBookletToRemote(booklet).catch(e => console.warn('Sync failed:', e));
  return booklet;
};

export const addQuestionToBooklet = async (bookletId: string, question: Question) => {
  return addQuestionsToBooklet(bookletId, [question]);
};

export const addQuestionsToBooklet = async (bookletId: string, questions: Question[]) => {
  const booklet = await getBookletById(bookletId);
  if (!booklet) return null;
  
  for (const question of questions) {
    const topic = question.topic || booklet.topic || '__default__';
    const existing = (booklet.questions || []).filter(q => (q.topic || booklet.topic || '__default__') === topic);
    const maxNum = existing.reduce((m, q) => q.number && q.number > m ? q.number : m, 0);
    question.number = (maxNum || 0) + 1;
    booklet.questions.push(question);
  }
  
  booklet.updatedAt = Date.now();
  await performTransaction(STORE_NAME, 'readwrite', tx => { tx.objectStore(STORE_NAME).put(booklet); });
  // Auto-sync to Supabase
  syncBookletToRemote(booklet).catch(e => console.warn('Sync failed:', e));
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
    // Auto-sync to Supabase
    syncBookletToRemote(booklet).catch(e => console.warn('Sync failed:', e));
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
  // Auto-sync to Supabase
  syncBookletToRemote(booklet).catch(e => console.warn('Sync failed:', e));
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
  // Try Supabase first
  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    if (!error && data && data.length > 0) return true;
  } catch (e) { /* fallback to local */ }
  const users = await performTransaction<User[]>(USER_STORE, 'readonly', tx => tx.objectStore(USER_STORE).getAll());
  return (users || []).length > 0;
};

export const registerUser = async (name: string, email: string, password: string, grade?: string) => {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check Supabase first for existing user
  try {
    const { data: existingUsers } = await supabase.from('users').select('id').eq('email', normalizedEmail);
    if (existingUsers && existingUsers.length > 0) throw new Error("Email taken.");
  } catch (e: any) {
    if (e.message === "Email taken.") throw e;
    // Supabase unavailable, continue with local check
  }
  
  // Check local
  const users = await performTransaction<User[]>(USER_STORE, 'readonly', tx => tx.objectStore(USER_STORE).getAll());
  if ((users || []).some(u => u.email === normalizedEmail)) throw new Error("Email taken.");
  
  // Check if first user (across both Supabase and local)
  let isFirst = (users || []).length === 0;
  try {
    const { count } = await supabase.from('users').select('id', { count: 'exact', head: true });
    if (count !== null && count > 0) isFirst = false;
  } catch (e) { /* ignore */ }
  
  const newUser: User = {
    id: crypto.randomUUID(), name, email: normalizedEmail, password, 
    role: isFirst ? UserRole.SUPER_ADMIN : UserRole.STUDENT,
    status: isFirst ? UserStatus.AUTHORIZED : UserStatus.PENDING,
    grade, createdAt: Date.now()
  };
  
  // Save to Supabase
  try {
    await supabase.from('users').upsert({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      password: newUser.password,
      role: newUser.role,
      status: newUser.status,
      grade: newUser.grade,
      created_at: newUser.createdAt
    });
  } catch (e) { console.warn('Supabase save failed, using local only:', e); }
  
  // Save to local
  await performTransaction(USER_STORE, 'readwrite', tx => { tx.objectStore(USER_STORE).put(newUser); });
  return newUser;
};

export const loginUser = async (email: string, password: string) => {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Try Supabase first
  try {
    const { data: supaUsers, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();
    
    if (!error && supaUsers) {
      if (supaUsers.password !== password) throw new Error("Invalid credentials.");
      // Map Supabase row to User object
      const user: User = {
        id: supaUsers.id,
        name: supaUsers.name,
        email: supaUsers.email,
        password: supaUsers.password,
        role: supaUsers.role as UserRole,
        status: supaUsers.status as UserStatus,
        grade: supaUsers.grade,
        createdAt: supaUsers.created_at
      };
      // Sync to local storage
      await performTransaction(USER_STORE, 'readwrite', tx => { tx.objectStore(USER_STORE).put(user); });
      return user;
    }
  } catch (e: any) {
    if (e.message === "Invalid credentials.") throw e;
    // Supabase unavailable, try local
  }
  
  // Fallback to local
  const users = await performTransaction<User[]>(USER_STORE, 'readonly', tx => tx.objectStore(USER_STORE).getAll());
  const user = (users || []).find(u => u.email === normalizedEmail);
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
  // First, try to import any local data files the user placed in /data folder
  await importLocalDataFiles();
  
  const existing = await getBooklets();
  if (existing.length > 0) return false;
  
  // Load from remote chunks instead of embedded JSON
  try {
    const defaultLibrary = await getDefaultLibrary();
    if (!defaultLibrary || defaultLibrary.length === 0) return false;
    
    // Store all booklets in IndexedDB
    await performTransaction(STORE_NAME, 'readwrite', tx => {
      const store = tx.objectStore(STORE_NAME);
      for (const booklet of defaultLibrary) {
        store.put(booklet);
      }
    });
    console.log(`Seeded ${defaultLibrary.length} booklets from remote library`);
    return true;
  } catch (e) {
    console.error('Failed to seed database:', e);
    return false;
  }
};

// Import local JSON files from /data folder into IndexedDB
export const importLocalDataFiles = async () => {
  try {
    const anyWindow: any = (typeof window !== 'undefined' ? window : undefined) as any;
    if (!anyWindow?.electron?.listDataFiles) {
      console.log('importLocalDataFiles: No electron API available, trying fetch');
      // Try fetch fallback for dev server
      const candidates = ['/data/chem_12.json', '/data/librarybooks.json'];
      for (const url of candidates) {
        try {
          const r = await fetch(url);
          if (r.ok) {
            const txt = await r.text();
            await importLocalJsonContent(txt, url);
          }
        } catch (e) {
          // ignore
        }
      }
      return;
    }
    
    const files: string[] = await anyWindow.electron.listDataFiles() || [];
    console.log('importLocalDataFiles: Found files:', files);
    
    for (const f of files) {
      try {
        const content = await anyWindow.electron.readDataFile(f);
        if (content && content.trim().length > 0) {
          await importLocalJsonContent(content, f);
        }
      } catch (e) {
        console.error('importLocalDataFiles: Error reading', f, e);
      }
    }
  } catch (e) {
    console.error('importLocalDataFiles error:', e);
  }
};

async function importLocalJsonContent(content: string, source: string) {
  try {
    // Strip BOM (byte order mark) if present
    const cleanContent = content.replace(/^\uFEFF/, '').trim();
    const parsed = JSON.parse(cleanContent);
    const items: Booklet[] = Array.isArray(parsed) ? parsed : (parsed.booklets || []);
    
    if (items.length === 0) return;
    
    // Normalize and import each booklet (upsert - update or insert)
    let imported = 0;
    let updated = 0;
    for (const b of items) {
      // Normalize grade to "Grade X" format
      if (b.grade && !b.grade.toString().toLowerCase().startsWith('grade')) {
        b.grade = 'Grade ' + b.grade;
      }
      
      // For Grade 12 Physical Science, rename to Chemistry (Reading Only) or Physics (With Solutions)
      if (b.grade === 'Grade 12' && b.subject === 'Physical Science') {
        if (b.type === 'Reading Material Only') {
          b.subject = 'Chemistry';
        } else if (b.type === 'With Solutions') {
          b.subject = 'Physics';
        }
      }
      
      // Check if booklet already exists
      const existing = await getBookletById(b.id);
      await performTransaction(STORE_NAME, 'readwrite', tx => {
        tx.objectStore(STORE_NAME).put(b);
      });
      if (existing) {
        updated++;
      } else {
        imported++;
      }
    }
    
    console.log(`importLocalDataFiles: Imported ${imported} new, updated ${updated} existing booklets from ${source}`);
  } catch (e) {
    console.error('importLocalJsonContent parse error for', source, e);
  }
}

export const clearLibrary = async () => {
  await performTransaction(STORE_NAME, 'readwrite', tx => {
    tx.objectStore(STORE_NAME).clear();
  });
  // Also clear the cache version to force a re-fetch if needed
  localStorage.removeItem(LIBRARY_CACHE_KEY + '_version');
  return true;
};

// ---- Remote sync helpers (Supabase) ----
export const pushBookletsToRemote = async () => {
  const local = await performTransaction<Booklet[]>(STORE_NAME, 'readonly', tx => tx.objectStore(STORE_NAME).getAll()) || [];
  if (!local || local.length === 0) return { pushed: 0 };
  const payload = local.map(b => ({
    id: b.id,
    title: b.title,
    grade: b.grade,
    subject: b.subject,
    topic: b.topic,
    type: b.type,
    compiler: b.compiler,
    is_published: b.isPublished || false,
    created_at: b.createdAt || Date.now(),
    updated_at: b.updatedAt || Date.now(),
    questions: b.questions || []
  }));

  const { data, error } = await supabase.from('booklets').upsert(payload, { onConflict: 'id' }).select('id');
  if (error) {
    console.error('Supabase push error:', error);
    throw error;
  }
  return { pushed: data?.length || 0 };
};

export const pullBookletsFromRemote = async () => {
  const { data, error } = await supabase.from('booklets').select('*');
  if (error) {
    console.error('Supabase pull error:', error);
    throw error;
  }
  const remote = (data || []) as any[];
  if (!remote.length) return { pulled: 0 };

  const local = await performTransaction<Booklet[]>(STORE_NAME, 'readonly', tx => tx.objectStore(STORE_NAME).getAll()) || [];
  const localMap = new Map(local.map(l => [l.id, l]));
  const toPut: Booklet[] = [];

  for (const r of remote) {
    const remoteUpdated = Number(r.updated_at || 0);
    const localItem = localMap.get(r.id as string) as Booklet | undefined;
    if (!localItem || remoteUpdated > (localItem.updatedAt || 0)) {
      const b: Booklet = {
        id: r.id,
        title: r.title,
        subject: r.subject,
        grade: r.grade,
        topic: r.topic,
        type: r.type as BookletType,
        compiler: r.compiler,
        isPublished: !!r.is_published,
        createdAt: Number(r.created_at || Date.now()),
        updatedAt: Number(r.updated_at || Date.now()),
        questions: r.questions || []
      };
      toPut.push(b);
    }
  }

  if (toPut.length > 0) {
    await performTransaction(STORE_NAME, 'readwrite', tx => {
      const s = tx.objectStore(STORE_NAME);
      toPut.forEach(b => s.put(b));
    });
  }
  return { pulled: toPut.length };
};

export const syncBooklets = async () => {
  // Pull remote changes first, then push local changes (simple conflict resolution by updatedAt)
  await pullBookletsFromRemote().catch(e => console.warn('pullBookletsFromRemote failed', e));
  const res = await pushBookletsToRemote().catch(e => { console.warn('pushBookletsToRemote failed', e); return { pushed: 0 }; });
  return res;
};

// Sync a single booklet to Supabase (for real-time updates)
export const syncBookletToRemote = async (booklet: Booklet) => {
  const payload = {
    id: booklet.id,
    title: booklet.title,
    grade: booklet.grade,
    subject: booklet.subject,
    topic: booklet.topic,
    type: booklet.type,
    compiler: booklet.compiler,
    is_published: booklet.isPublished || false,
    created_at: booklet.createdAt || Date.now(),
    updated_at: booklet.updatedAt || Date.now(),
    questions: booklet.questions || []
  };
  const { error } = await supabase.from('booklets').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.error('syncBookletToRemote error:', error);
    throw error;
  }
  console.log('Synced booklet to Supabase:', booklet.id, booklet.title);
};

// Push assignments to Supabase
export const pushAssignmentsToRemote = async () => {
  const local = await getAssignments();
  if (!local || local.length === 0) return { pushed: 0 };
  
  const payload = local.map(a => ({
    id: a.id,
    booklet_id: a.bookletId,
    booklet_title: a.bookletTitle,
    topic: a.topic,
    topics: a.topics || [],
    grade: a.grade,
    start_num: a.startNum,
    end_num: a.endNum,
    is_published: a.isPublished || false,
    open_date: a.openDate,
    close_date: a.closeDate,
    due_date: a.dueDate,
    time_limit_seconds: a.timeLimitSeconds,
    created_at: a.createdAt || Date.now()
  }));

  const { data, error } = await supabase.from('assignments').upsert(payload, { onConflict: 'id' }).select('id');
  if (error) {
    console.error('pushAssignmentsToRemote error:', error);
    throw error;
  }
  return { pushed: data?.length || 0 };
};

// Pull assignments from Supabase
export const pullAssignmentsFromRemote = async () => {
  const { data, error } = await supabase.from('assignments').select('*');
  if (error) {
    console.error('pullAssignmentsFromRemote error:', error);
    throw error;
  }
  const remote = (data || []) as any[];
  if (!remote.length) return { pulled: 0 };

  let pulled = 0;
  for (const r of remote) {
    const assignment: Assignment = {
      id: r.id,
      bookletId: r.booklet_id,
      bookletTitle: r.booklet_title,
      topic: r.topic,
      topics: r.topics || [],
      grade: r.grade,
      startNum: r.start_num,
      endNum: r.end_num,
      isPublished: !!r.is_published,
      openDate: r.open_date,
      closeDate: r.close_date,
      dueDate: r.due_date,
      timeLimitSeconds: r.time_limit_seconds,
      createdAt: r.created_at || Date.now()
    };
    await performTransaction(ASSIGNMENT_STORE, 'readwrite', tx => {
      tx.objectStore(ASSIGNMENT_STORE).put(assignment);
    });
    pulled++;
  }
  return { pulled };
};

// Push users to Supabase
export const pushUsersToRemote = async () => {
  const local = await performTransaction<User[]>(USER_STORE, 'readonly', tx => tx.objectStore(USER_STORE).getAll()) || [];
  if (!local || local.length === 0) return { pushed: 0 };

  const payload = local.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    password: u.password,
    role: u.role,
    status: u.status,
    grade: u.grade,
    created_at: u.createdAt || Date.now()
  }));

  const { data, error } = await supabase.from('users').upsert(payload, { onConflict: 'id' }).select('id');
  if (error) {
    console.error('pushUsersToRemote error:', error);
    throw error;
  }
  return { pushed: data?.length || 0 };
};

// Pull users from Supabase into local IndexedDB
export const pullUsersFromRemote = async () => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.error('pullUsersFromRemote error:', error);
    throw error;
  }
  const remote = (data || []) as any[];
  if (!remote.length) return { pulled: 0 };

  const toPut: User[] = [];
  for (const r of remote) {
    const user: User = {
      id: r.id,
      name: r.name,
      email: (r.email || '').toString().toLowerCase(),
      password: r.password || '',
      role: r.role as UserRole,
      status: r.status as UserStatus,
      grade: r.grade,
      createdAt: Number(r.created_at || Date.now())
    };
    toPut.push(user);
  }

  if (toPut.length > 0) {
    await performTransaction(USER_STORE, 'readwrite', tx => {
      const s = tx.objectStore(USER_STORE);
      toPut.forEach(u => s.put(u));
    });
  }
  return { pulled: toPut.length };
};

// Push submissions to Supabase
export const pushSubmissionsToRemote = async () => {
  const local = await getSubmissions();
  if (!local || local.length === 0) return { pushed: 0 };
  
  const payload = local.map(s => ({
    id: s.id,
    assignment_id: s.assignmentId,
    student_id: s.studentId,
    student_name: s.studentName,
    answers: s.answers || [],
    total_score: s.totalScore,
    max_score: s.maxScore,
    status: s.status,
    started_at: s.startedAt,
    submitted_at: s.submittedAt
  }));

  const { data, error } = await supabase.from('submissions').upsert(payload, { onConflict: 'id' }).select('id');
  if (error) {
    console.error('pushSubmissionsToRemote error:', error);
    throw error;
  }
  return { pushed: data?.length || 0 };
};

// Pull submissions from Supabase
export const pullSubmissionsFromRemote = async () => {
  const { data, error } = await supabase.from('submissions').select('*');
  if (error) {
    console.error('pullSubmissionsFromRemote error:', error);
    throw error;
  }
  const remote = (data || []) as any[];
  if (!remote.length) return { pulled: 0 };

  let pulled = 0;
  for (const r of remote) {
    const submission: Submission = {
      id: r.id,
      assignmentId: r.assignment_id,
      studentId: r.student_id,
      studentName: r.student_name,
      answers: r.answers || [],
      totalScore: r.total_score,
      maxScore: r.max_score,
      status: r.status,
      startedAt: r.started_at,
      submittedAt: r.submitted_at
    };
    await performTransaction(SUBMISSION_STORE, 'readwrite', tx => {
      tx.objectStore(SUBMISSION_STORE).put(submission);
    });
    pulled++;
  }
  return { pulled };
};

// Sync all data (booklets, assignments, submissions) bidirectionally
export const syncAllData = async () => {
  console.log('syncAllData: Starting full sync...');
  try {
    // Pull from remote first (get latest from Supabase)
    const pullBooklets = await pullBookletsFromRemote().catch(e => { console.warn('Pull booklets failed:', e); return { pulled: 0 }; });
    const pullAssignments = await pullAssignmentsFromRemote().catch(e => { console.warn('Pull assignments failed:', e); return { pulled: 0 }; });
    const pullSubmissions = await pullSubmissionsFromRemote().catch(e => { console.warn('Pull submissions failed:', e); return { pulled: 0 }; });
    const pullUsers = await pullUsersFromRemote().catch(e => { console.warn('Pull users failed:', e); return { pulled: 0 }; });
    
    // Push local changes to remote
    const pushBooklets = await pushBookletsToRemote().catch(e => { console.warn('Push booklets failed:', e); return { pushed: 0 }; });
    const pushAssignments = await pushAssignmentsToRemote().catch(e => { console.warn('Push assignments failed:', e); return { pushed: 0 }; });
    const pushSubmissions = await pushSubmissionsToRemote().catch(e => { console.warn('Push submissions failed:', e); return { pushed: 0 }; });
    const pushUsers = await pushUsersToRemote().catch(e => { console.warn('Push users failed:', e); return { pushed: 0 }; });
    
    console.log('syncAllData complete:', {
      pulled: { booklets: pullBooklets.pulled, assignments: pullAssignments.pulled, submissions: pullSubmissions.pulled, users: (pullUsers && (pullUsers.pulled||0)) },
      pushed: { booklets: pushBooklets.pushed, assignments: pushAssignments.pushed, submissions: pushSubmissions.pushed, users: (pushUsers && (pushUsers.pushed||0)) }
    });
    
    return { success: true, pullBooklets, pullAssignments, pullSubmissions, pushBooklets, pushAssignments, pushSubmissions };
  } catch (e) {
    console.error('syncAllData error:', e);
    return { success: false, error: e };
  }
};

export const getAssignments = (grade?: string) => performTransaction<Assignment[]>(ASSIGNMENT_STORE, 'readonly', tx => tx.objectStore(ASSIGNMENT_STORE).getAll()).then(all => grade ? (all || []).filter(a => a.grade === grade) : (all || []));
export const getAssignmentById = (id: string) => performTransaction<Assignment>(ASSIGNMENT_STORE, 'readonly', tx => tx.objectStore(ASSIGNMENT_STORE).get(id));

// Sync a single assignment to Supabase
const syncAssignmentToRemote = async (assignment: any) => {
  const payload = {
    id: assignment.id,
    booklet_id: assignment.bookletId,
    booklet_title: assignment.bookletTitle,
    topic: assignment.topic,
    topics: assignment.topics || [],
    grade: assignment.grade,
    start_num: assignment.startNum,
    end_num: assignment.endNum,
    is_published: assignment.isPublished || false,
    open_date: assignment.openDate,
    close_date: assignment.closeDate,
    due_date: assignment.dueDate,
    time_limit_seconds: assignment.timeLimitSeconds,
    created_at: assignment.createdAt || Date.now()
  };
  const { error } = await supabase.from('assignments').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.error('syncAssignmentToRemote error:', error);
    throw error;
  }
  console.log('Synced assignment to Supabase:', assignment.id);
};

export const createAssignment = async (data: any) => {
  const assignment = { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
  await performTransaction(ASSIGNMENT_STORE, 'readwrite', tx => { tx.objectStore(ASSIGNMENT_STORE).put(assignment); });
  // Auto-sync to Supabase
  syncAssignmentToRemote(assignment).catch(e => console.warn('Sync failed:', e));
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

// Sync a single submission to Supabase
const syncSubmissionToRemote = async (sub: Submission) => {
  const payload = {
    id: sub.id,
    assignment_id: sub.assignmentId,
    student_id: sub.studentId,
    student_name: sub.studentName,
    answers: sub.answers || [],
    total_score: sub.totalScore,
    max_score: sub.maxScore,
    status: sub.status,
    started_at: sub.startedAt,
    submitted_at: sub.submittedAt
  };
  const { error } = await supabase.from('submissions').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.error('syncSubmissionToRemote error:', error);
    throw error;
  }
  console.log('Synced submission to Supabase:', sub.id);
};

export const submitWork = async (sub: Submission) => {
  await performTransaction(SUBMISSION_STORE, 'readwrite', tx => { tx.objectStore(SUBMISSION_STORE).put(sub); });
  // Auto-sync to Supabase
  syncSubmissionToRemote(sub).catch(e => console.warn('Sync failed:', e));
};
export const getSubmissions = (aId?: string, sId?: string) => performTransaction<Submission[]>(SUBMISSION_STORE, 'readonly', tx => tx.objectStore(SUBMISSION_STORE).getAll()).then(all => {
  let f = all || [];
  if (aId) f = f.filter(s => s.assignmentId === aId);
  if (sId) f = f.filter(s => s.studentId === sId);
  return f;
});
