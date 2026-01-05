
import React, { useState, useEffect } from 'react';
import { Booklet, CreateBookletDTO, Subject, BookletType, UserRole, User, UserStatus, Assignment } from '../types';
import * as storageService from '../services/storageService';
import { extractLibraryFromJsonOrCode } from '../services/geminiService';
import BookletCover from '../components/BookletCover';

const GRADELIST = ["Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "University"];

const Dashboard: React.FC<{
  onSelectBooklet: (id: string) => void;
  onSelectAssignment: (id: string) => void;
  onViewSubmissions: (id: string) => void;
  userRole: UserRole;
  currentUser: User;
  onLogout: () => void;
}> = ({ onSelectBooklet, onSelectAssignment, onViewSubmissions, userRole, currentUser, onLogout }) => {
  const [booklets, setBooklets] = useState<Booklet[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [view, setView] = useState<'library' | 'assignments'>('library');
    const [showCreateAssignment, setShowCreateAssignment] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingBooklet, setEditingBooklet] = useState<Booklet | null>(null);
    const [showUserManagement, setShowUserManagement] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [newBooklet, setNewBooklet] = useState<CreateBookletDTO>({ subject: Subject.MATHEMATICS, grade: 'Grade 12', topic: '', type: BookletType.WITH_SOLUTIONS });
  
  const isSuperAdmin = userRole === UserRole.SUPER_ADMIN;
  const effectiveRole = (isPreviewMode && (userRole === UserRole.STAFF || userRole === UserRole.SUPER_ADMIN)) ? UserRole.STUDENT : userRole;
  const isStaff = effectiveRole === UserRole.STAFF || effectiveRole === UserRole.SUPER_ADMIN;
  const isStudent = effectiveRole === UserRole.STUDENT;
  const normalize = (s?: string) => (s || '').toString().trim().toLowerCase();

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
      // Debug: log counts of Grade 12 Chemistry booklets
      try {
        const chem = (b || []).filter(bt => normalize(bt.grade) === normalize('Grade 12') && ((bt.subject||'').toString().toLowerCase().includes('chemistry')));
        console.log('DEBUG: Grade 12 Chemistry count (Dashboard):', chem.length, chem.map(c => ({ id: c.id, title: c.title, type: c.type, isPublished: c.isPublished })));
      } catch (e) { /* ignore */ }
      try {
        console.log('Dashboard: pulling assignments from Supabase before loading local assignments...');
        await storageService.pullAssignmentsFromRemote().catch(e => { console.warn('Dashboard: pullAssignmentsFromRemote failed', e); });
      } catch (e) {
        console.warn('Dashboard: Unexpected error pulling assignments', e);
      }
      const a = await storageService.getAssignments(isStudent ? currentUser.grade : undefined);
      setAssignments(a || []);
      if (isSuperAdmin) {
          console.log('Dashboard: Loading users for Super Admin...');
          const u = await storageService.getUsers();
          console.log('Dashboard: Loaded', (u || []).length, 'users', u);
          setUsers(u || []);
      }
    } catch (e) {
      console.error("Dashboard Sync Failed:", e);
    }
  };

  useEffect(() => { refreshData(); }, [effectiveRole]);

  const handleLibraryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setToast({ message: "AI is reading your library file...", type: 'success' });
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      let content = ev.target?.result as string;
      
      try {
        // AI-assisted extraction for .ts/.js files or complex JSON
        content = await extractLibraryFromJsonOrCode(content, file.name);
        
        const result = await storageService.importData(content);
        if (result.success) {
          setToast({ message: `Success! ${result.count} items imported.`, type: 'success' });
          setTimeout(() => window.location.reload(), 1500);
        } else {
          setToast({ message: `Sync Failed: ${result.message || "Check file format"}`, type: 'error' });
        }
      } catch (err: any) {
        setToast({ message: `Import Failed: ${err.message}`, type: 'error' });
      } finally {
        setIsImporting(false);
        setTimeout(() => setToast(null), 4000);
      }
    };
    reader.onerror = () => {
       setToast({ message: "File Read Error", type: 'error' });
       setIsImporting(false);
       setTimeout(() => setToast(null), 3000);
    };
    reader.readAsText(file);
    e.target.value = '';
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

  // Prepare sorted list: grade-descending and Grade 12 full-row behavior
  const filteredBooklets = booklets.filter(b => isStudent ? (b.grade === currentUser.grade && b.isPublished) : true);
  const gradeOrder: Record<string, number> = GRADELIST.reduce((m, g, i) => { m[g] = i; return m; }, {} as Record<string, number>);
  // Deduplicate by ID to prevent duplicate cards
  const seenIds = new Set<string>();
  const dedupedBooklets = filteredBooklets.filter(b => {
    if (seenIds.has(b.id)) return false;
    seenIds.add(b.id);
    return true;
  });
  const sortedBooklets = dedupedBooklets.slice().sort((a, b) => {
    const oa = gradeOrder[a.grade] ?? -1;
    const ob = gradeOrder[b.grade] ?? -1;
    if (oa !== ob) return ob - oa; // higher grade index first
    return (a.title || '').toString().localeCompare((b.title || '').toString());
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-in fade-in duration-500">
      {toast && (
        <div className={`fixed top-12 left-1/2 -translate-x-1/2 z-[200] px-10 py-5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl animate-bounce ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'}`}>
            {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="mb-20 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-10">
        <div className="flex items-center gap-8">
           <button id="btn-logout-main" name="btnLogoutMain" onClick={onLogout} title="Logout" className="p-5 bg-white border border-gray-100 rounded-[2rem] shadow-xl hover:text-red-500 transition-all hover:scale-110"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
           <div>
              <div className="flex items-center gap-5">
                <h1 className="text-6xl font-black text-gray-900 tracking-tighter uppercase leading-none italic">{isStaff ? 'Master' : 'Student'}</h1>
              </div>
              {isSuperAdmin && (
                <div className="flex items-center gap-3 mt-4">
                  <button id="btn-user-mgmt" name="btnUserMgmt" onClick={async () => { try { await storageService.pullUsersFromRemote(); } catch (e) { console.error('Failed to pull users before opening User Control', e); } setShowUserManagement(true); }} title="Users" className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-black transition-all shadow-xl"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
                  <a id="btn-supabase" href="https://supabase.com/dashboard/project/zqpdbmqneebjsytgkodl/editor/17484?schema=public" target="_blank" rel="noreferrer" title="Open Supabase Users Table" className="px-6 py-4 bg-yellow-500 text-white rounded-2xl hover:bg-yellow-600 transition-all shadow-xl flex items-center gap-2 font-bold text-sm uppercase tracking-wide">📊 Supabase<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
                </div>
              )}
              <p className="text-gray-400 font-black uppercase tracking-[0.5em] text-[9px] mt-2 italic opacity-60">Princeton Centre of Learning</p>
           </div>
        </div>
        
        {isStaff && (
          <div className="flex items-center gap-6">
            {/* Sync Now button for staff/admins */}
            <button
              id="btn-sync"
              name="btnSync"
              onClick={async () => {
                setToast({ message: 'Syncing all data...', type: 'success' });
                try {
                  const res = await storageService.syncAllData();
                  const msg = res.success 
                    ? `Synced! Pulled: ${(res.pullBooklets?.pulled||0)} booklets, ${(res.pullUsers?.pulled||0)} users` 
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
              className="px-6 py-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-xl font-bold text-sm uppercase tracking-wide"
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
                <button id="btn-preview" name="btnPreview" onClick={() => setIsPreviewMode(!isPreviewMode)} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border-2 transition-all ${isPreviewMode ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-400'}`}>
                   {isPreviewMode ? 'Close Portal Preview' : 'Preview Student View'}
                </button>
             )}
             {!isPreviewMode && (
               <div className="flex items-center gap-4">
                  <div className="flex bg-white border border-gray-100 rounded-[2.5rem] p-2 shadow-xl">
                     <button id="btn-export" name="btnExport" onClick={() => storageService.exportData()} title="Export" className="p-4 text-gray-400 hover:text-gray-900"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
                     <label htmlFor="file-import" className={`p-4 text-gray-400 hover:text-indigo-600 cursor-pointer border-l ${isImporting ? 'animate-spin opacity-50' : ''}`}>
                        <input id="file-import" name="fileImport" type="file" accept=".json,.ts,.js" onChange={handleLibraryUpload} className="hidden" disabled={isImporting}/>
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                     </label>
                  </div>
                  <button id="btn-new-asset" name="btnNewAsset" onClick={() => setShowCreateModal(true)} className="bg-gray-900 text-white px-10 py-5 rounded-[2rem] shadow-2xl font-black text-[11px] uppercase tracking-widest hover:bg-black transition-all">New Asset</button>
               </div>
             )}
          </div>
        )}
      </div>

      <div className="flex gap-16 mb-20 border-b-8 border-gray-100">
        <button id="nav-lib" name="navLib" onClick={() => setView('library')} className={`pb-8 text-2xl font-black uppercase tracking-tighter transition-all italic ${view === 'library' ? 'text-gray-900 border-b-[12px] border-gray-900' : 'text-gray-300'}`}>Library</button>
        <button id="nav-assess" name="navAssess" onClick={() => setView('assignments')} className={`pb-8 text-2xl font-black uppercase tracking-tighter transition-all italic ${view === 'assignments' ? 'text-indigo-600 border-b-[12px] border-indigo-600' : 'text-gray-300'}`}>Assessments</button>
      </div>

      {view === 'library' ? (
        <div className="space-y-12">
          {GRADELIST.slice().reverse().map(grade => {
            const items = sortedBooklets.filter(b => normalize(b.grade) === normalize(grade));
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
                      onUpdate={async (id, subject) => { try { await storageService.updateBookletSubject(id, subject); refreshData(); } catch(e) {} }}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {sortedBooklets.length === 0 && !isImporting && (
            <div className="py-40 text-center border-4 border-dashed border-gray-100 rounded-[4rem] bg-gray-50/50">
               <p className="text-5xl font-black text-gray-200 uppercase italic">Library Empty</p>
               <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mt-6">Create your first module or upload your library file.</p>
               {isStaff && (
                  <div className="mt-10 flex justify-center gap-4">
                      <button id="btn-manual-init" name="btnManualInit" onClick={() => setShowCreateModal(true)} className="bg-gray-900 text-white px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest">Manual Creation</button>
                      <label htmlFor="file-sync-empty" className="bg-indigo-600 text-white px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer">
                        <input id="file-sync-empty" name="fileSyncEmpty" type="file" accept=".json,.ts,.js" onChange={handleLibraryUpload} className="hidden" disabled={isImporting}/>
                        Upload Library
                      </label>
                  </div>
               )}
            </div>
          )}

          {isImporting && (
             <div className="py-40 text-center">
                <div className="w-20 h-20 border-8 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-10"></div>
                <p className="text-2xl font-black uppercase italic animate-pulse text-indigo-600">AI Sorting Library...</p>
             </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
           {assignments.length === 0 ? (
             <div className="py-40 text-center text-gray-100 font-black uppercase italic text-4xl">No Tasks Assigned</div>
           ) : (
             assignments.map(a => (
               <div key={a.id} className="bg-white p-10 rounded-[3.5rem] border-4 border-gray-50 flex flex-col md:flex-row justify-between items-center group hover:border-indigo-500 transition-all shadow-xl">
                 <div className="flex items-center gap-10">
                    <div className="w-24 h-24 bg-gray-50 text-gray-900 rounded-[2rem] flex items-center justify-center font-black text-4xl shadow-inner italic">T</div>
                    <div>
                       <h3 className="text-4xl font-black text-gray-900 uppercase tracking-tighter italic">{a.topic}</h3>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-3 italic">{a.bookletTitle} &bull; Q{a.startNum} - Q{a.endNum}</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-10 mt-8 md:mt-0">
                    {isStudent ? (
                      <button id={`btn-start-${a.id}`} name={`btnStart-${a.id}`} onClick={() => onSelectAssignment(a.id)} className="bg-indigo-600 text-white px-12 py-5 rounded-3xl font-black text-[11px] uppercase tracking-widest shadow-2xl hover:scale-105 transition-all">Start Task</button>
                    ) : (
                      <button id={`btn-review-${a.id}`} name={`btnReview-${a.id}`} onClick={() => onViewSubmissions(a.id)} className="bg-gray-900 text-white px-10 py-5 rounded-3xl font-black text-[11px] uppercase tracking-widest shadow-2xl hover:bg-black transition-all">Review Scripts</button>
                    )}
                 </div>
               </div>
             ))
           )}
        </div>
      )}

      {/* MODALS */}
      {showCreateAssignment && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/70">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-black uppercase">Create Assignment</h3>
              <button onClick={() => setShowCreateAssignment(false)} className="p-2">✕</button>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-bold">Select Booklet</label>
              <select className="w-full p-3 border" onChange={e => {
                const b = booklets.find(bb => bb.id === e.target.value);
                if (b) {
                  // Logic to handle assignment creation would go here
                  // For now, we'll just show the dropdown as requested
                }
              }}>
                <option value="">-- choose booklet --</option>
                {booklets.map(b => <option key={b.id} value={b.id}>{`${b.grade}; ${b.subject} - ${b.title}`}</option>)}
              </select>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setShowCreateAssignment(false)} className="px-4 py-2 border rounded">Cancel</button>
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
                       <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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
                        <input required type="text" className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={editingBooklet.title} onChange={e => setEditingBooklet({...editingBooklet, title: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-4">Type</label>
                        <select className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={editingBooklet.type} onChange={e => setEditingBooklet({...editingBooklet, type: e.target.value as BookletType})}>
                           <option value={BookletType.READING_ONLY}>{BookletType.READING_ONLY}</option>
                           <option value={BookletType.WITH_SOLUTIONS}>{BookletType.WITH_SOLUTIONS}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-4">Subject</label>
                        <select className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={editingBooklet.subject} onChange={e => setEditingBooklet({...editingBooklet, subject: e.target.value})}>
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
                 <button id="btn-close-users" name="btnCloseUsers" onClick={() => setShowUserManagement(false)} className="p-5 bg-gray-100 rounded-full hover:bg-red-50 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 space-y-4">
                 {users.map(u => (
                    <div key={u.id} className="bg-gray-50 p-6 rounded-[2rem] flex flex-col md:flex-row justify-between items-center gap-6 border border-gray-100">
                       <div className="flex items-center gap-6">
                          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center font-black text-xl italic">{u.name.charAt(0)}</div>
                          <div>
                             <p className="font-black text-lg uppercase italic">{u.name}</p>
                             <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{u.email} &bull; {u.role}</p>
                          </div>
                       </div>
                       <div className="flex items-center gap-4">
                          <select id={`role-${u.id}`} name={`roleSelect-${u.id}`} className="bg-white border-2 border-gray-100 rounded-xl p-3 text-[10px] font-black uppercase" value={u.role} onChange={e => handleUpdateUser(u.id, e.target.value as UserRole, u.status)}>
                             <option value={UserRole.STUDENT}>STUDENT</option>
                             <option value={UserRole.STAFF}>STAFF</option>
                             <option value={UserRole.SUPER_ADMIN}>SUPER_ADMIN</option>
                          </select>
                          <select id={`status-${u.id}`} name={`statusSelect-${u.id}`} className={`border-2 rounded-xl p-3 text-[10px] font-black uppercase ${u.status === UserStatus.AUTHORIZED ? 'bg-green-50 border-green-100 text-green-600' : 'bg-red-50 border-red-100 text-red-600'}`} value={u.status} onChange={e => handleUpdateUser(u.id, u.role, e.target.value as UserStatus)}>
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
                 <button id="btn-close-create" name="btnCloseCreate" onClick={() => setShowCreateModal(false)} className="p-5 bg-gray-100 rounded-full hover:bg-red-50 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
              <form id="form-new-module" name="formNewModule" onSubmit={handleCreateBooklet} className="p-12 space-y-10">
                 <div className="space-y-8">
                    <div>
                        <label htmlFor="select-subject" className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-4">Subject</label>
                        <select id="select-subject" name="selectSubject" className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={newBooklet.subject} onChange={e => setNewBooklet({...newBooklet, subject: e.target.value as Subject})}>
                           {Object.values(Subject).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="select-grade" className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-4">Grade</label>
                        <select id="select-grade" name="selectGrade" className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={newBooklet.grade} onChange={e => setNewBooklet({...newBooklet, grade: e.target.value})}>
                           {GRADELIST.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="input-topic" className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-4">Topic</label>
                        <input id="input-topic" name="inputTopic" required type="text" placeholder="e.g. Organic Chemistry" className="w-full bg-gray-50 border-4 border-gray-50 rounded-3xl p-6 font-black italic outline-none focus:border-indigo-600 text-xl" value={newBooklet.topic} onChange={e => setNewBooklet({...newBooklet, topic: e.target.value})} />
                    </div>
                 </div>
                 <button id="btn-submit-module" name="btnSubmitModule" type="submit" className="w-full bg-gray-900 text-white font-black py-8 rounded-[2rem] text-[12px] uppercase tracking-[0.3em] shadow-2xl hover:bg-black transition-all">Finalize Asset</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
