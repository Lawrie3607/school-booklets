
import React, { useState, useEffect } from 'react';
import { Subject, BookletType, UserRole, UserStatus, Booklet, Assignment, User, CreateBookletDTO } from '../types';
import { GRADE_THEMES } from '../constants';
import * as storageService from '../services/storageService';
import { extractLibraryFromJsonOrCode } from '../services/geminiService';
import BookletCover from '../components/BookletCover';

const GRADELIST = ["Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "University"];

interface DashboardContentProps {
  onSelectBooklet: (id: string) => void;
  onSelectAssignment: (id: string) => void;
  onViewSubmissions: (id: string) => void;
  userRole: UserRole;
  currentUser: User;
  onLogout: () => void;
  isPreviewMode: boolean;
  setIsPreviewMode: (v: boolean) => void;
}

const DashboardContent: React.FC<DashboardContentProps> = ({ 
  onSelectBooklet, 
  onSelectAssignment, 
  onViewSubmissions, 
  userRole, 
  currentUser, 
  onLogout,
  isPreviewMode,
  setIsPreviewMode,
}) => {
    const [booklets, setBooklets] = useState<Booklet[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [view, setView] = useState<'library' | 'assignments'>('library');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showCreateAssignment, setShowCreateAssignment] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingBooklet, setEditingBooklet] = useState<Booklet | null>(null);
    const [showUserManagement, setShowUserManagement] = useState(false);
    const [showPastePortal, setShowPastePortal] = useState(false);
    const [pasteData, setPasteData] = useState('');
    // preview mode is lifted to App and passed in via props
    const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
    const [librarySourceInfo, setLibrarySourceInfo] = useState<{source?: string, count?: number}>({});
    const [isImporting, setIsImporting] = useState(false);
    const [newBooklet, setNewBooklet] = useState<CreateBookletDTO>({ 
      subject: Subject.MATHEMATICS as unknown as string, 
      grade: 'Grade 12', 
      topic: '', 
      type: BookletType.WITH_SOLUTIONS 
    });
    const [customSubject, setCustomSubject] = useState('');

      const [assignmentForm, setAssignmentForm] = useState({
        bookletId: '',
        topics: [] as string[],
        topic: '',
        startNum: 1,
        endNum: 5,
        grade: currentUser.grade || 'Grade 12',
        openDate: '',
        dueDate: '',
        closeDate: '',
        timeLimitMinutes: 0,
        isPublished: true
      });
    
    const isSuperAdmin = userRole === UserRole.SUPER_ADMIN;
    const effectiveRole = (isPreviewMode && (userRole === UserRole.STAFF || userRole === UserRole.SUPER_ADMIN)) ? UserRole.STUDENT : userRole;
    const isStaff = effectiveRole === UserRole.STAFF || effectiveRole === UserRole.SUPER_ADMIN;
    const isStudent = effectiveRole === UserRole.STUDENT;
    const normalize = (s?: string) => (s || '').toString().trim().toLowerCase();
    const visibleBooklets = booklets.filter(b => {
      if (!isStudent) return true;
      const matchGrade = normalize(b.grade) === normalize(currentUser.grade);
      // Allow authorized students to see their grade booklets without an extra "publish" step.
      const studentCanSee = (b.isPublished || currentUser.status === UserStatus.AUTHORIZED);
      // Show all booklet types (removed READING_ONLY filter)
      return matchGrade && studentCanSee;
    });
    // Sort booklets by grade descending (per GRADELIST order) and then title
    const gradeOrder: Record<string, number> = GRADELIST.reduce((m, g, i) => { m[g] = i; return m; }, {} as Record<string, number>);
    // Deduplicate by ID and by composite key (grade|subject|title) to prevent duplicate cards
    const seenIds = new Set<string>();
    const seenComposite = new Set<string>();
    const dedupedBooklets = visibleBooklets.filter(b => {
      const composite = `${(b.grade||'').toString().trim().toLowerCase()}|${(b.subject||'').toString().trim().toLowerCase()}|${(b.title||'').toString().trim().toLowerCase()}`;
      if (seenIds.has(b.id)) return false;
      if (seenComposite.has(composite)) return false;
      seenIds.add(b.id);
      seenComposite.add(composite);
      return true;
    });
    const sortedVisibleBooklets = dedupedBooklets.slice().sort((a, b) => {
      const oa = gradeOrder[a.grade] ?? -1;
      const ob = gradeOrder[b.grade] ?? -1;
      if (oa !== ob) return ob - oa; // descending by grade order
      return (a.title || '').toString().localeCompare((b.title || '').toString());
    });
    const totalForGrade = booklets.filter(b => normalize(b.grade) === normalize(currentUser.grade)).length;

    const refreshData = async () => {
        try {
            let b = await storageService.getBooklets();
            
            // One-time fix for Grade 12 Physical Science booklets
            let changed = false;
            for (const booklet of b) {
              if (booklet.grade === 'Grade 12' && booklet.subject === 'Physical Science') {
                if (booklet.type === BookletType.WITH_SOLUTIONS) {
                  booklet.subject = 'Physics';
                  changed = true;
                } else if (booklet.type === BookletType.READING_ONLY) {
                  booklet.subject = 'Chemistry';
                  changed = true;
                }
                if (changed) {
                  await storageService.updateBooklet(booklet);
                }
              }
            }
            if (changed) {
              b = await storageService.getBooklets();
            }

            setBooklets(b || []);
                try {
                  const src = localStorage.getItem('pcl_library_last_source') || undefined;
                  const cnt = Number(localStorage.getItem('pcl_library_last_count') || '') || undefined;
                  setLibrarySourceInfo({ source: src, count: cnt });
                } catch(_) {}
            // Debug: log counts of Grade 12 Chemistry booklets
            try {
              const chem = (b || []).filter(bt => normalize(bt.grade) === normalize('Grade 12') && ((bt.subject||'').toString().toLowerCase().includes('chemistry')));
              console.log('DEBUG: Grade 12 Chemistry count (DashboardContent):', chem.length, chem.map(c => ({ id: c.id, title: c.title, type: c.type, isPublished: c.isPublished })));
            } catch (e) { /* ignore debug errors */ }
            try {
              console.log('DashboardContent: pulling assignments from Supabase before loading local assignments...');
              await storageService.pullAssignmentsFromRemote().catch(e => { console.warn('DashboardContent: pullAssignmentsFromRemote failed', e); });
            } catch (e) {
              console.warn('DashboardContent: Unexpected error pulling assignments', e);
            }
            const a = await storageService.getAssignments(isStudent ? currentUser.grade : undefined);
            setAssignments(a || []);
            if (isSuperAdmin) {
                try {
                  console.log('DashboardContent: pulling users from Supabase before reading local cache...');
                  await storageService.pullUsersFromRemote();
                } catch (pullErr) {
                  console.warn('DashboardContent: pullUsersFromRemote failed', pullErr);
                }
                const latestUsers = await storageService.getUsers();
                setUsers(latestUsers || []);
            }
        }
        catch (e) {
            console.error("Dashboard Sync Failed:", e);
        }
    };

    const markAssignmentSeen = (assignmentId: string) => {
      try { localStorage.setItem(`seen_assignment_${assignmentId}_${currentUser.id}`, '1'); } catch(_) {}
    };

    const isAssignmentSeen = (assignmentId: string) => {
      try { return !!localStorage.getItem(`seen_assignment_${assignmentId}_${currentUser.id}`); } catch(_) { return false; }
    };

    const getBookletColor = (bookletId?: string) => {
      if (!bookletId) return '#ffffff00';
      const b = booklets.find(bb => bb.id === bookletId);
      if (!b) return '#ffffff00';
      const theme = (GRADE_THEMES as any)[b.grade] || (GRADE_THEMES as any)['default'];
      const subj = (b.subject || '').toString().toLowerCase();
      if (b.grade === 'Grade 12' && subj.includes('chemistry')) return '#000000';
      if (b.grade === 'Grade 12' && subj.includes('physics')) return theme.main || '#be123c';
      return b.type === BookletType.WITH_SOLUTIONS ? (theme.main || '#2563eb') : (theme.alt || '#60a5fa');
    };


    useEffect(() => { refreshData(); }, [effectiveRole]);

    const processImport = async (content: string, fileName?: string) => {
        setIsImporting(true);
        try {
            let finalContent = content;
            if (fileName && (fileName.endsWith('.ts') || fileName.endsWith('.js'))) {
                setToast({ message: "Analyzing Backup Script...", type: 'success' });
                finalContent = await extractLibraryFromJsonOrCode(content, fileName);
            }
            const result = await storageService.importData(finalContent);
            console.log('Import result:', result);
            if (result.success) {
                // Clear library cache to force reload from IndexedDB
                localStorage.removeItem('pcl_library_cache_version');
                console.log('Import successful, cache cleared. Count:', result.count);
                setToast({ message: `Success! ${result.count} items imported.`, type: 'success' });
                setTimeout(async () => {
                    const reloaded = await storageService.getBooklets();
                    console.log('After import, booklets in DB:', reloaded.length);
                    window.location.reload();
                }, 1200);
            }
            else {
                console.error('Import failed:', result.message);
                setToast({ message: `Import Failed: ${result.message}`, type: 'error' });
            }
        }
        catch (err: any) {
            console.error('Import error:', err);
            setToast({ message: `System Error: ${err.message}`, type: 'error' });
        }
        finally {
            setIsImporting(false);
            setTimeout(() => setToast(null), 8000);
        }
    };

    const handleLibraryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const content = await file.text();
            await processImport(content, file.name);
        }
        catch (err) {
            setToast({ message: "Browser blocked the file.", type: 'error' });
        }
        e.target.value = '';
    };

    const handlePasteImport = async () => {
        if (!pasteData.trim()) return;
        await processImport(pasteData, 'manual-paste.json');
        setShowPastePortal(false);
        setPasteData('');
    };

    const handleCreateBooklet = async (e: React.FormEvent) => {
        e.preventDefault();
        const main = await storageService.createBooklet(newBooklet, currentUser.name);
        setShowCreateModal(false);
        onSelectBooklet(main.id);
    };

    const handleUpdateUser = async (uId: string, role: UserRole, status: UserStatus) => {
        await storageService.authorizeUser(uId, role, status);
        refreshData();
    };

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-in fade-in duration-500">
        {librarySourceInfo.source && (
          <div className="mb-4 text-xs text-gray-700">
            Library source: <strong className="uppercase">{librarySourceInfo.source}</strong>
            {typeof librarySourceInfo.count === 'number' && (
              <> — <strong>{librarySourceInfo.count}</strong> booklets</>
            )}
          </div>
        )}
        {toast && (
          <div className={`fixed top-12 left-1/2 -translate-x-1/2 z-[200] px-10 py-5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl animate-bounce ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'}`}>
            {toast.message}
          </div>
        )}

        {/* Student notification for new assignments */}
        {isStudent && (() => {
          const now = Date.now();
          const visible = assignments.filter(a => {
            if (a.isPublished === false) return false;
            if (a.openDate && new Date(a.openDate).getTime() > now) return false;
            if (a.closeDate && new Date(a.closeDate).getTime() < now) return false;
            if (a.grade && normalize(a.grade) !== normalize(currentUser.grade)) return false;
            return true;
          }).sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
          const unseen = visible.filter(a => !isAssignmentSeen(a.id));
          if (unseen.length === 0) return null;
          const top = unseen[0];
          return (
            <div className="mb-6 p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-between">
              <div>
                <div className="text-sm font-black uppercase text-indigo-700">New Assessment Available</div>
                <div className="mt-1 text-lg font-bold text-gray-900">{top.bookletTitle} • {top.topic}</div>
                <div className="text-xs text-gray-500 mt-1">{top.dueDate ? `Due: ${new Date(top.dueDate).toLocaleString()}` : ''} {top.closeDate ? ` • Closes: ${new Date(top.closeDate).toLocaleString()}` : ''}</div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => { markAssignmentSeen(top.id); refreshData(); onSelectAssignment(top.id); }} className="bg-indigo-600 text-white px-4 py-2 rounded font-black">Open Task</button>
                <button onClick={() => { markAssignmentSeen(top.id); refreshData(); }} className="px-4 py-2 border rounded">Dismiss</button>
              </div>
            </div>
          );
        })()}

        <div className="mb-20 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-10">
          <div className="flex items-center gap-8">
            <button onClick={onLogout} title="Sign Out" className="p-5 bg-white border border-gray-100 rounded-[2rem] shadow-xl hover:text-red-500 transition-all hover:scale-110">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-5">
                <h1 className="text-6xl font-black text-gray-900 tracking-tighter uppercase leading-none italic">{isStaff ? 'Master' : 'Student'}</h1>
                {isSuperAdmin && (
                  <div className="flex items-center gap-3">
                    <button onClick={async () => {
                      try {
                        await storageService.pullUsersFromRemote();
                        const latestUsers = await storageService.getUsers();
                        setUsers(latestUsers || []);
                      } catch (e) {
                        console.error('Failed to pull users before opening User Control', e);
                      }
                      setShowUserManagement(true);
                    }} title="Users" className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-black transition-all shadow-xl">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </button>
                    <a
                      href="https://supabase.com/dashboard/project/zqpdbmqneebjsytgkodl/editor/17484?schema=public"
                      target="_blank"
                      rel="noreferrer"
                      title="Open Supabase Users Table"
                      className="px-5 py-3 bg-yellow-500 text-white rounded-2xl hover:bg-yellow-600 transition-all shadow-xl flex items-center gap-2 font-bold text-xs uppercase tracking-wide"
                    >
                      📊 Supabase
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                  </div>
                )}
              </div>
              <p className="text-gray-400 font-black uppercase tracking-[0.5em] text-[9px] mt-2 italic opacity-60">Princeton Centre of Learning</p>
            </div>
          </div>
          
          {isStaff && (
            <div className="flex items-center gap-6">
              <button
                id="btn-sync"
                onClick={async () => {
                  setToast({ message: 'Syncing all data...', type: 'success' });
                  try {
                    const res = await storageService.syncAllData();
                    const msg = res.success
                      ? `Synced! Pulled: ${(res.pullBooklets?.pulled || 0)} booklets, ${(res.pullUsers?.pulled || 0)} users`
                      : 'Sync failed';
                    setToast({ message: msg, type: res.success ? 'success' : 'error' });
                    if (res.success) refreshData();
                  } catch (err) {
                    console.error('Sync failed', err);
                    setToast({ message: 'Sync failed. Check console.', type: 'error' });
                  }
                  setTimeout(() => setToast(null), 4000);
                }}
                title="Sync booklets, users, assignments, and submissions with Supabase"
                className="px-6 py-3 bg-emerald-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl"
              >
                🔄 Sync All
              </button>
              {isSuperAdmin ? (
                <button 
                  onClick={async () => { 
                    if(confirm("CRITICAL ACTION: Are you sure you want to EMPTY the entire library? This will delete all booklets from your local storage.")) { 
                      await storageService.clearLibrary(); 
                      window.location.reload(); 
                    } 
                  }} 
                  className="px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border-2 border-red-200 text-red-500 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all shadow-sm"
                >
                  Clear Library
                </button>
              ) : (
                <button onClick={() => setIsPreviewMode(!isPreviewMode)} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border-2 transition-all ${isPreviewMode ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-400'}`}>
                  {isPreviewMode ? 'Close Portal Preview' : 'Preview Student View'}
                </button>
              )}
              {!isPreviewMode && (
                <div className="flex items-center gap-4">
                  <div className="flex bg-white border border-gray-100 rounded-[2.5rem] p-2 shadow-xl items-center">
                    <button onClick={() => storageService.exportData()} title="Download Backup" className="px-6 py-4 text-gray-400 hover:text-gray-900 flex flex-col items-center gap-1 group">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span className="text-[7px] font-black uppercase opacity-0 group-hover:opacity-100">Export</span>
                    </button>
                    <label title="Upload Library" className={`px-6 py-4 text-gray-400 hover:text-indigo-600 cursor-pointer border-l border-r flex flex-col items-center gap-1 group ${isImporting ? 'animate-spin' : ''}`}>
                      <input type="file" accept=".json,.ts,.js" onChange={handleLibraryUpload} className="hidden" disabled={isImporting} />
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span className="text-[7px] font-black uppercase opacity-0 group-hover:opacity-100">Upload</span>
                    </label>
                    <button onClick={() => setShowPastePortal(true)} title="Emergency Paste" className="px-6 py-4 text-gray-400 hover:text-red-500 flex flex-col items-center gap-1 group">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      </svg>
                      <span className="text-[7px] font-black uppercase opacity-100 text-red-600">Paste Data</span>
                    </button>
                  </div>
                  <button onClick={() => setShowCreateModal(true)} className="bg-gray-900 text-white px-10 py-5 rounded-[2rem] shadow-2xl font-black text-[11px] uppercase tracking-widest hover:bg-black transition-all">New Asset</button>
                  <button onClick={() => { setShowCreateAssignment(true); if (booklets.length>0) setAssignmentForm(f=>({...f, bookletId: booklets[0].id, grade: currentUser.grade || f.grade})); }} className="bg-indigo-600 text-white px-8 py-4 rounded-[2rem] shadow-2xl font-black text-[11px] uppercase tracking-widest hover:bg-black transition-all">Create Assignment</button>
                  <button onClick={async () => { try { await storageService.createDemoData(); setToast({message: 'Demo data created.', type: 'success'}); setTimeout(()=>setToast(null),3000); refreshData(); } catch(e:any) { setToast({message: e.message||'Seed failed', type:'error'}); } }} className="bg-yellow-500 text-black px-6 py-4 rounded-[2rem] shadow-2xl font-black text-[11px] uppercase tracking-widest hover:bg-yellow-400 transition-all">Seed Demo Data</button>
                  <button onClick={async () => {
                    const grade = prompt('Enter grade to publish for (e.g. Grade 10):', currentUser.grade || 'Grade 10');
                    if (!grade) return;
                    try {
                      const all = await storageService.getBooklets();
                      const targets = all.filter(b => normalize(b.grade) === normalize(grade));
                      if (targets.length === 0) { setToast({message: `No booklets found for ${grade}`, type: 'error'}); setTimeout(()=>setToast(null),3000); return; }
                      for (const b of targets) {
                        b.isPublished = true;
                        b.type = BookletType.READING_ONLY;
                        await storageService.updateBooklet(b);
                      }
                      setToast({message: `Published ${targets.length} booklets for ${grade}.`, type: 'success'});
                      setTimeout(()=>setToast(null),3000);
                      refreshData();
                    } catch(err:any) { setToast({message: err.message||'Failed', type:'error'}); }
                  }} className="bg-green-600 text-white px-6 py-4 rounded-[2rem] shadow-2xl font-black text-[11px] uppercase tracking-widest hover:bg-black transition-all">Publish For Grade</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-16 mb-20 border-b-8 border-gray-100">
          <button onClick={() => setView('library')} className={`pb-8 text-2xl font-black uppercase tracking-tighter transition-all italic ${view === 'library' ? 'text-gray-900 border-b-[12px] border-gray-900' : 'text-gray-300'}`}>Library</button>
          <button onClick={() => setView('assignments')} className={`pb-8 text-2xl font-black uppercase tracking-tighter transition-all italic ${view === 'assignments' ? 'text-indigo-600 border-b-[12px] border-indigo-600' : 'text-gray-300'}`}>Assessments</button>
        </div>

        {view === 'library' ? (
          <div className="space-y-12">
            {GRADELIST.slice().reverse().map(grade => {
              const items = sortedVisibleBooklets.filter(b => normalize(b.grade) === normalize(grade));
              if (!items || items.length === 0) return null;
              return (
                <div key={grade} className="w-full">
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-2xl font-black uppercase tracking-tight">{grade}</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-16">
                    {items.map(b => (
                      <BookletCover
                        key={b.id}
                        booklet={b}
                        isStaff={isStaff}
                        onClick={() => onSelectBooklet(b.id)}
                        onEdit={(booklet) => { setEditingBooklet(booklet); setShowEditModal(true); }}
                        onUpdate={async (id, subject) => { try { await storageService.updateBookletSubject(id, subject); setToast({message: `Marked ${subject}.`, type: 'success'}); refreshData(); setTimeout(()=>setToast(null),2000); } catch(err:any){ setToast({message: err.message||'Update failed', type:'error'}); } }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {sortedVisibleBooklets.length === 0 && !isImporting && (
              <div className="py-40 text-center border-4 border-dashed border-gray-100 rounded-[4rem] bg-gray-50/50">
                <p className="text-3xl font-black text-gray-700 uppercase italic">No booklets available</p>
                {isStudent ? (
                  <div className="mt-6 text-sm text-gray-500">
                    <p>Your account grade: <strong className="uppercase">{currentUser.grade || 'Not set'}</strong></p>
                    {totalForGrade > 0 ? (
                      <p className="mt-2">There are {totalForGrade} booklet(s) for your grade, but none are published and questions-only. Ask your teacher to publish a questions-only booklet.</p>
                    ) : (
                      <p className="mt-2">No booklets exist for your grade yet. Ask your teacher to add content for {currentUser.grade || 'your grade'}.</p>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-5xl font-black text-gray-200 uppercase italic">Library Empty</p>
                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mt-6">Use the Paste Portal to restore your work.</p>
                    {isStaff && (
                      <div className="mt-12 flex flex-col items-center gap-6">
                        <button onClick={() => setShowPastePortal(true)} className="bg-indigo-600 text-white px-16 py-6 rounded-3xl font-black text-[14px] uppercase tracking-widest shadow-2xl hover:bg-black transition-all">Restore from Paste Box</button>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Open your backup file, copy the text, and paste it in.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {isImporting && (
              <div className="py-40 text-center">
                <div className="w-24 h-24 border-8 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-10"></div>
                <p className="text-3xl font-black uppercase italic animate-pulse text-indigo-600 tracking-tighter">Syncing Database...</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {assignments.length === 0 ? (
              <div className="py-40 text-center text-gray-100 font-black uppercase italic text-4xl">No Tasks Assigned</div>
            ) : (
              (() => {
                const now = Date.now();
                const visible = assignments.filter(a => {
                  if (!isStudent) return true;
                  if (a.isPublished === false) return false;
                  if (a.openDate && new Date(a.openDate).getTime() > now) return false;
                  if (a.closeDate && new Date(a.closeDate).getTime() < now) return false;
                  return true;
                });
                if (visible.length === 0) return <div className="py-40 text-center text-gray-100 font-black uppercase italic text-4xl">No Tasks Assigned</div>;
                return visible.map(a => (
                  <div key={a.id} className="bg-white p-10 rounded-[3.5rem] border-4 border-gray-50 flex flex-col md:flex-row justify-between items-center group hover:border-indigo-500 transition-all shadow-xl">
                    <div className="flex items-center gap-10">
                      <div className="w-24 h-24 bg-gray-50 text-gray-900 rounded-[2rem] flex items-center justify-center font-black text-4xl shadow-inner italic">T</div>
                      <div>
                        <h3 className="text-4xl font-black text-gray-900 uppercase tracking-tighter italic">{a.topic}</h3>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-3 italic">{a.bookletTitle} • Q{a.startNum} - Q{a.endNum}</p>
                        {a.openDate && <p className="text-[10px] text-gray-400 mt-2">Opens: {new Date(a.openDate).toLocaleString()}</p>}
                        {a.closeDate && <p className="text-[10px] text-gray-400">Closes: {new Date(a.closeDate).toLocaleString()}</p>}
                        {a.timeLimitSeconds && <p className="text-[10px] text-gray-400">Time limit: {Math.floor(a.timeLimitSeconds/60)} minutes</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-10 mt-8 md:mt-0">
                      {isStudent ? (
                        <button onClick={() => onSelectAssignment(a.id)} className="bg-indigo-600 text-white px-12 py-5 rounded-3xl font-black text-[11px] uppercase tracking-widest shadow-2xl hover:scale-105 transition-all">Start Task</button>
                      ) : (
                        <button onClick={() => onViewSubmissions(a.id)} className="bg-gray-900 text-white px-10 py-5 rounded-3xl font-black text-[11px] uppercase tracking-widest shadow-2xl hover:bg-black transition-all">Review Scripts</button>
                      )}
                    </div>
                  </div>
                ));
              })()
            )}
          </div>
        )}

        {showPastePortal && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/95 backdrop-blur-xl p-6">
            <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col">
              <div className="p-12 border-b flex justify-between items-center bg-gray-50">
                <div>
                  <h2 className="text-4xl font-black uppercase italic">Paste Data Portal</h2>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">Direct text injection for backup files.</p>
                </div>
                <button onClick={() => setShowPastePortal(false)} className="p-5 bg-white border border-gray-100 rounded-full hover:bg-red-50 hover:text-red-500 transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="p-12 space-y-8 overflow-y-auto">
                <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 flex items-start gap-5">
                  <div className="p-3 bg-indigo-600 text-white rounded-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </div>
                  <p className="text-xs font-bold text-gray-600 leading-relaxed italic">If your file upload failed, open your backup file (.json or .ts) in Notepad, copy all the text, and paste it below. This bypasses browser security blocks.</p>
                </div>
                <textarea 
                  className="w-full h-[350px] p-8 bg-gray-50 border-4 border-gray-100 rounded-[2.5rem] font-mono text-[10px] outline-none focus:border-indigo-600 shadow-inner" 
                  placeholder='Paste content here starting with { "booklets": ...' 
                  value={pasteData} 
                  onChange={e => setPasteData(e.target.value)} 
                />
                <div className="flex justify-between items-center text-[9px] font-black uppercase text-gray-400 px-4">
                  <span>Characters: {pasteData.length.toLocaleString()}</span>
                  {pasteData.length > 0 && pasteData.length < 5000 && <span className="text-orange-500">Notice: Input length seems low for a full library.</span>}
                </div>
                <div className="flex gap-4">
                  <button onClick={handlePasteImport} className="flex-1 bg-indigo-600 text-white py-8 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all">Inject Content Now</button>
                  <button onClick={() => { if (confirm("This will wipe the current app memory. Continue?")) storageService.factoryReset().then(() => window.location.reload()); }} className="px-10 bg-gray-100 text-gray-400 py-8 rounded-3xl font-black text-xs uppercase tracking-widest hover:text-red-500 transition-all">Clear Memory</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showCreateAssignment && (
          <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/70">
            <div className="bg-white rounded-2xl p-8 w-full max-w-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-black uppercase">Create Assignment</h3>
                <button onClick={() => setShowCreateAssignment(false)} className="p-2">✕</button>
              </div>
              <div className="space-y-4">
                <label className="block text-sm font-bold">Select Booklet</label>
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-sm border" style={{ backgroundColor: getBookletColor(assignmentForm.bookletId) }} />
                  <select className="flex-1 p-3 border" value={assignmentForm.bookletId} onChange={e => {
                    const val = e.target.value;
                    setAssignmentForm({...assignmentForm, bookletId: val, topics: []});
                  }}>
                    <option value="">-- choose booklet --</option>
                    {booklets.map(b => <option key={b.id} value={b.id}>{`${b.grade}; ${b.subject} - ${b.title}`}</option>)}
                  </select>
                </div>

                <label className="block text-sm font-bold">Topics (select one or more)</label>
                <div className="w-full border p-3 rounded max-h-40 overflow-auto bg-white">
                  {(() => {
                    const b = booklets.find(bb => bb.id === assignmentForm.bookletId);
                    if (!b) return <div className="text-sm text-gray-400">Choose a booklet to pick topics.</div>;
                    const topics = Array.from(new Set(b.questions.map(q => q.topic || b.topic))).filter(t => t && t.trim().length>0);
                    if (topics.length === 0) return <div className="text-sm text-gray-400">No topics found in this booklet.</div>;
                    return topics.map(t => (
                      <label key={t} className="flex items-center gap-3 py-1">
                        <input type="checkbox" checked={assignmentForm.topics.includes(t)} onChange={e => {
                          const next = assignmentForm.topics.includes(t) ? assignmentForm.topics.filter(x => x !== t) : [...assignmentForm.topics, t];
                          setAssignmentForm({...assignmentForm, topics: next});
                        }} />
                        <span className="text-sm font-medium">{t}</span>
                      </label>
                    ));
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold">Start Q#</label>
                    <input type="number" min={1} className="w-full p-3 border" value={assignmentForm.startNum} onChange={e => setAssignmentForm({...assignmentForm, startNum: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold">End Q#</label>
                    <input type="number" min={1} className="w-full p-3 border" value={assignmentForm.endNum} onChange={e => setAssignmentForm({...assignmentForm, endNum: Number(e.target.value)})} />
                  </div>
                </div>

                <label className="block text-sm font-bold">Grade</label>
                <input className="w-full p-3 border" value={assignmentForm.grade} onChange={e => setAssignmentForm({...assignmentForm, grade: e.target.value})} />

                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className="block text-sm font-bold">Open At</label>
                    <input type="datetime-local" className="w-full p-3 border" value={assignmentForm.openDate} onChange={e => setAssignmentForm({...assignmentForm, openDate: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold">Close At</label>
                    <input type="datetime-local" className="w-full p-3 border" value={assignmentForm.closeDate} onChange={e => setAssignmentForm({...assignmentForm, closeDate: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className="block text-sm font-bold">Due (optional)</label>
                    <input type="datetime-local" className="w-full p-3 border" value={assignmentForm.dueDate} onChange={e => setAssignmentForm({...assignmentForm, dueDate: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold">Time Limit (mins)</label>
                    <input type="number" min={0} className="w-full p-3 border" value={assignmentForm.timeLimitMinutes} onChange={e => setAssignmentForm({...assignmentForm, timeLimitMinutes: Number(e.target.value)})} />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 mt-3">
                  <input type="checkbox" checked={assignmentForm.isPublished} onChange={e => setAssignmentForm({...assignmentForm, isPublished: e.target.checked})} />
                  <span className="text-sm font-bold">Publish to students</span>
                </label>

                <div className="flex justify-end gap-3 mt-4">
                  <button onClick={() => setShowCreateAssignment(false)} className="px-4 py-2 border rounded">Cancel</button>
                  <button onClick={async () => {
                    if (!assignmentForm.bookletId) { setToast({message: 'Pick a booklet first', type: 'error'}); return; }
                    const b = booklets.find(bb => bb.id === assignmentForm.bookletId);
                    const payload: any = {
                      bookletId: assignmentForm.bookletId,
                      bookletTitle: b?.title || '',
                      topic: (assignmentForm.topics && assignmentForm.topics.length>0) ? assignmentForm.topics.join(', ') : (assignmentForm.topic || (b?.topic || '')),
                      startNum: assignmentForm.startNum,
                      endNum: assignmentForm.endNum,
                      grade: assignmentForm.grade,
                      isPublished: !!assignmentForm.isPublished,
                      createdAt: Date.now()
                    };
                    if (assignmentForm.openDate) payload.openDate = new Date(assignmentForm.openDate).toISOString();
                    if (assignmentForm.closeDate) payload.closeDate = new Date(assignmentForm.closeDate).toISOString();
                    if (assignmentForm.dueDate) payload.dueDate = new Date(assignmentForm.dueDate).toISOString();
                    if (assignmentForm.timeLimitMinutes && assignmentForm.timeLimitMinutes > 0) payload.timeLimitSeconds = Math.floor(Number(assignmentForm.timeLimitMinutes) * 60);
                    try {
                      await storageService.createAssignment(payload);
                      setToast({message: 'Assignment created.', type: 'success'});
                      setShowCreateAssignment(false);
                      setTimeout(() => setToast(null), 3000);
                      refreshData();
                    } catch (err: any) {
                      setToast({message: err.message || 'Create failed', type: 'error'});
                    }
                  }} className="px-6 py-3 bg-indigo-600 text-white rounded">Create</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showEditModal && editingBooklet && (
          <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
            <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-xl overflow-hidden">
              <div className="p-12 border-b flex justify-between items-center">
                <h2 className="text-4xl font-black uppercase italic">Edit Asset</h2>
                <button onClick={() => setShowEditModal(false)} className="p-5 bg-gray-100 rounded-full hover:bg-red-50 hover:text-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (editingBooklet) {
                  await storageService.updateBooklet(editingBooklet);
                  setShowEditModal(false);
                  setToast({message: 'Asset updated.', type: 'success'});
                  refreshData();
                  setTimeout(() => setToast(null), 3000);
                }
              }} className="p-12 space-y-10">
                <div className="space-y-8">
                  <div>
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-4">Title</label>
                    <input required type="text" className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={editingBooklet.title} onChange={e => setEditingBooklet({ ...editingBooklet, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-4">Type</label>
                    <select className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={editingBooklet.type} onChange={e => setEditingBooklet({ ...editingBooklet, type: e.target.value as BookletType })}>
                      <option value={BookletType.READING_ONLY}>{BookletType.READING_ONLY}</option>
                      <option value={BookletType.WITH_SOLUTIONS}>{BookletType.WITH_SOLUTIONS}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-4">Subject</label>
                    <select className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={editingBooklet.subject} onChange={e => setEditingBooklet({ ...editingBooklet, subject: e.target.value })}>
                      {Object.values(Subject).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <button type="submit" className="w-full bg-gray-900 text-white font-black py-8 rounded-[2rem] text-[12px] uppercase tracking-[0.3em] shadow-2xl hover:bg-black transition-all">Save Changes</button>
              </form>
            </div>
          </div>
        )}

        {showUserManagement && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 backdrop-blur-xl p-6">
            <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-12 border-b flex justify-between items-center">
                <h2 className="text-4xl font-black uppercase italic">User Control</h2>
                <button onClick={() => setShowUserManagement(false)} className="p-5 bg-gray-100 rounded-full hover:bg-red-50 hover:text-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 space-y-4">
                {users.map(u => (
                  <div key={u.id} className="bg-gray-50 p-6 rounded-[2rem] flex flex-col md:flex-row justify-between items-center gap-6 border border-gray-100">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center font-black text-xl italic">{u.name.charAt(0)}</div>
                      <div>
                        <p className="font-black text-lg uppercase italic">{u.name}</p>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{u.email} • {u.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <select className="bg-white border-2 border-gray-100 rounded-xl p-3 text-[10px] font-black uppercase" value={u.role} onChange={e => handleUpdateUser(u.id, e.target.value as UserRole, u.status)}>
                        <option value={UserRole.STUDENT}>STUDENT</option>
                        <option value={UserRole.STAFF}>STAFF</option>
                        <option value={UserRole.SUPER_ADMIN}>SUPER_ADMIN</option>
                      </select>
                      <select className={`border-2 rounded-xl p-3 text-[10px] font-black uppercase ${u.status === UserStatus.AUTHORIZED ? 'bg-green-50 border-green-100 text-green-600' : 'bg-red-50 border-red-100 text-red-600'}`} value={u.status} onChange={e => handleUpdateUser(u.id, u.role, e.target.value as UserStatus)}>
                        <option value={UserStatus.PENDING}>PENDING</option>
                        <option value={UserStatus.AUTHORIZED}>AUTHORIZED</option>
                        <option value={UserStatus.DENIED}>DENIED</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showCreateModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
            <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-xl overflow-hidden">
              <div className="p-12 border-b flex justify-between items-center">
                <h2 className="text-4xl font-black uppercase italic">Module Creator</h2>
                <button onClick={() => setShowCreateModal(false)} className="p-5 bg-gray-100 rounded-full hover:bg-red-50 hover:text-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleCreateBooklet} className="p-12 space-y-10">
                <div className="space-y-8">
                  <div>
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-4">Subject</label>
                    <select className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={Object.values(Subject).includes(newBooklet.subject as any) ? newBooklet.subject : '__custom__'} onChange={e => {
                      const v = e.target.value;
                      if (v === '__custom__') {
                        setCustomSubject('');
                        setNewBooklet({ ...newBooklet, subject: '' });
                      } else {
                        setNewBooklet({ ...newBooklet, subject: v });
                      }
                    }}>
                      {Object.values(Subject).map(s => <option key={s} value={s}>{s}</option>)}
                      <option value="__custom__">Add new subject...</option>
                    </select>
                    {(!Object.values(Subject).includes(newBooklet.subject as any)) && (
                      <input required type="text" placeholder="Type new subject (e.g. Physics)" className="w-full bg-white border-2 border-gray-100 rounded-2xl p-4 mt-4 font-bold" value={newBooklet.subject || customSubject} onChange={e => { setCustomSubject(e.target.value); setNewBooklet({ ...newBooklet, subject: e.target.value }); }} />
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-4">Grade</label>
                    <select className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={newBooklet.grade} onChange={e => setNewBooklet({ ...newBooklet, grade: e.target.value })}>
                      {GRADELIST.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-4">Topic</label>
                    <input required type="text" placeholder="e.g. Organic Chemistry" className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={newBooklet.topic} onChange={e => setNewBooklet({ ...newBooklet, topic: e.target.value })} />
                  </div>
                </div>
                <button type="submit" className="w-full bg-gray-900 text-white font-black py-8 rounded-[2rem] text-[12px] uppercase tracking-[0.3em] shadow-2xl hover:bg-black transition-all">Finalize Asset</button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
};

export default DashboardContent;
