
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [newBooklet, setNewBooklet] = useState<CreateBookletDTO>({ subject: Subject.MATHEMATICS, grade: 'Grade 12', topic: '', type: BookletType.WITH_SOLUTIONS });
  
  const isSuperAdmin = userRole === UserRole.SUPER_ADMIN;
  const effectiveRole = (isPreviewMode && (userRole === UserRole.STAFF || userRole === UserRole.SUPER_ADMIN)) ? UserRole.STUDENT : userRole;
  const isStaff = effectiveRole === UserRole.STAFF || effectiveRole === UserRole.SUPER_ADMIN;
  const isStudent = effectiveRole === UserRole.STUDENT;

  const refreshData = async () => {
    try {
      const b = await storageService.getBooklets();
      setBooklets(b || []);
      const a = await storageService.getAssignments(isStudent ? currentUser.grade : undefined);
      setAssignments(a || []);
      if (isSuperAdmin) {
          const u = await storageService.getUsers();
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
                {isSuperAdmin && (
                   <button id="btn-user-mgmt" name="btnUserMgmt" onClick={() => setShowUserManagement(true)} title="Users" className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-black transition-all shadow-xl"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
                )}
              </div>
              <p className="text-gray-400 font-black uppercase tracking-[0.5em] text-[9px] mt-2 italic opacity-60">Princeton Centre of Learning</p>
           </div>
        </div>
        
        {isStaff && (
          <div className="flex items-center gap-6">
             <button id="btn-preview" name="btnPreview" onClick={() => setIsPreviewMode(!isPreviewMode)} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border-2 transition-all ${isPreviewMode ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-400'}`}>
                {isPreviewMode ? 'Close Portal Preview' : 'Preview Student View'}
             </button>
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-16">
            {booklets.filter(b => isStudent ? (b.grade === currentUser.grade && b.isPublished && b.type === BookletType.READING_ONLY) : true).map(b => (
              <BookletCover key={b.id} booklet={b} isStaff={isStaff} onClick={() => onSelectBooklet(b.id)} />
            ))}
            {booklets.length === 0 && !isImporting && (
              <div className="col-span-full py-40 text-center border-4 border-dashed border-gray-100 rounded-[4rem] bg-gray-50/50">
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
               <div className="col-span-full py-40 text-center">
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
