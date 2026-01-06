
import React, { useState, useEffect } from 'react';
import Dashboard from './pages/DashboardContent.tsx';
import BookletEditor from './pages/BookletEditor.tsx';
import AssignmentPortal from './pages/AssignmentPortal.tsx';
import SubmissionReview from './pages/SubmissionReview.tsx';
import { initStorage, registerUser, loginUser, hasAnyUsers, checkAndSeedDatabase, factoryReset, resetPassword, syncBooklets, createBooklet } from './services/storageService';
import * as storageService from './services/storageService';
import SubjectSelector from './components/SubjectSelector';
import { User, UserRole, UserStatus, CreateBookletDTO, BookletType } from './types';

// Expose storageService globally for debugging
if (typeof window !== 'undefined') {
  (window as any).storageService = storageService;
}

const GRADELIST = ["Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "University"];

const App: React.FC = () => {
  const [activeBookletId, setActiveBookletId] = useState<string | null>(null);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [reviewAssignmentId, setReviewAssignmentId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authTab, setAuthTab] = useState<'signin' | 'register'>('signin');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', grade: 'Grade 12', rememberMe: true });
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPwdResetModal, setShowPwdResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showSubjectSelector, setShowSubjectSelector] = useState(false);
  const [notifMessage, setNotifMessage] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState("Initializing Core...");
  const GEMINI_KEY = (process.env.GEMINI_API_KEY || process.env.API_KEY) as string | undefined;
  const [showReset, setShowReset] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  useEffect(() => {
    const init = async () => {
      const timer = setTimeout(() => setShowReset(true), 5000);
      try {
        setLoadStatus("Opening Local Databases...");
        await initStorage();
        setLoadStatus("Verifying Identity Tokens...");
        const saved = localStorage.getItem('pcl_user');
        if (saved) {
          try {
            setCurrentUser(JSON.parse(saved));
          } catch (e) {
            localStorage.removeItem('pcl_user');
          }
        }
        setLoadStatus("Checking Enrollment Status...");
        const exists = await hasAnyUsers();
        setIsFirstRun(!exists);
        if (!exists) setAuthTab('register');
        setLoadStatus("Sync Complete.");
        
        // Seed library in background (don't block login)
        checkAndSeedDatabase().catch(e => console.warn('Background seed error:', e));

        // Expose debug helper to create a sample booklet from the renderer console
        try {
          (window as any).DEBUG_createSampleBooklet = async () => {
            const dto: CreateBookletDTO = { subject: 'Physics' as any, grade: 'Grade 11', topic: 'DEBUG Topic', type: BookletType.WITH_SOLUTIONS };
            const b = await createBooklet(dto, 'DEV');
            console.log('DEBUG_createSampleBooklet:', b);
            return b;
          };
        } catch (e) {
          // ignore in environments where window isn't available
        }
      } catch (err) {
        console.error("Critical System Init Error:", err);
        setLoadStatus("Initialization Error.");
        setShowReset(true);
      } finally {
        clearTimeout(timer);
        setTimeout(() => setIsInitialized(true), 500);
      }
    };
    init();
  }, []);

  // When a user is present and is a student, show subject selector if they haven't chosen subjects
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const setup = async () => {
      if (!currentUser) return;
      if (currentUser.role === UserRole.STUDENT) {
        const subs = await storageService.getStudentSubjects(currentUser.id);
        if (!subs || subs.length === 0) setShowSubjectSelector(true);

        // initial check for new booklets
        const newOnes = await storageService.checkForNewBookletsForUser(currentUser.id);
        if (newOnes && newOnes.length > 0) {
          setNotifMessage(`New booklets available for your subjects (${newOnes.length})`);
        }

        // periodic check every 60s
        intervalId = setInterval(async () => {
          try {
            const found = await storageService.checkForNewBookletsForUser(currentUser.id);
            if (found && found.length > 0) {
              setNotifMessage(`New booklets available for your subjects (${found.length})`);
            }
          } catch (e) {
            // ignore
          }
        }, 60000);
      }
    };
    setup();
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [currentUser]);

  // Listen for submission changes and notify relevant users
  useEffect(() => {
    if (!currentUser) return;
    const handler = (ev: any) => {
      try {
        const sub: any = ev.detail?.submission;
        if (!sub) return;
        // If current user is staff, notify on new SUBMITTED submissions
        if (currentUser.role === UserRole.STAFF || currentUser.role === UserRole.SUPER_ADMIN) {
          if (sub.status === 'SUBMITTED') {
            setNotifMessage(`New submission from ${sub.studentName}`);
          } else {
            setNotifMessage(`Submission updated: ${sub.studentName}`);
          }
        }
        // If current user is the student, notify when their submission is MARKED or RECORDED
        if (currentUser.role === UserRole.STUDENT && sub.studentId === currentUser.id) {
          if (sub.status === 'MARKED' || sub.status === 'RECORDED') {
            setNotifMessage('Your submission has been graded.');
          }
        }
      } catch (e) {
        // ignore
      }
    };
    window.addEventListener('submission:changed', handler as EventListener);
    return () => window.removeEventListener('submission:changed', handler as EventListener);
  }, [currentUser]);

  // Global refresh shortcut: Ctrl/Cmd+R or F5 (ignore when typing)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName || '';
      const isEditable = active?.getAttribute && (active.getAttribute('contenteditable') === 'true' || tag === 'INPUT' || tag === 'TEXTAREA' || (active as any).isContentEditable);
      if (isEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        window.location.reload();
      }
      if (e.key === 'F5') {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      let user: User;
      if (authTab === 'signin' && !isFirstRun) {
        user = await loginUser(authForm.email, authForm.password);
      } else {
        user = await registerUser(authForm.name, authForm.email, authForm.password, authForm.grade);
      }
      setCurrentUser(user);
      if (authForm.rememberMe) {
        localStorage.setItem('pcl_user', JSON.stringify(user));
      }
        // Background sync after login/register
        syncBooklets().catch(e => console.warn('Background sync failed', e));
      setIsFirstRun(false); 
    } catch (err: any) { 
      setAuthError(err.message || "Authentication rejected."); 
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveBookletId(null);
    setActiveAssignmentId(null);
    setReviewAssignmentId(null);
    localStorage.removeItem('pcl_user');
    hasAnyUsers().then(exists => setIsFirstRun(!exists));
  };

  const handleFactoryReset = async () => {
    if(confirm("Factory Reset?")) {
        await factoryReset();
        window.location.reload();
    }
  };

  if (!isInitialized) return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-white text-center">
      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="font-black uppercase tracking-[0.5em] text-[10px] text-indigo-400 mt-8">{loadStatus}</p>
      {showReset && <button onClick={handleFactoryReset} className="mt-12 text-red-500 uppercase text-[9px]">Reset System</button>}
    </div>
  );

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-gray-100">
           <div className="bg-gray-900 p-12 text-center">
             <div className="w-20 h-20 bg-white text-gray-900 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl"><span className="font-black text-3xl italic">PCL</span></div>
             <h2 className="text-white text-3xl font-black uppercase tracking-tighter italic">Academic Portal</h2>
           </div>
           {!isFirstRun && (
             <div className="flex bg-gray-50">
                <button onClick={() => setAuthTab('signin')} className={`flex-1 py-6 text-[10px] font-black uppercase tracking-widest ${authTab === 'signin' ? 'bg-white text-gray-900 border-b-4 border-gray-900' : 'text-gray-400'}`}>Sign In</button>
                <button onClick={() => setAuthTab('register')} className={`flex-1 py-6 text-[10px] font-black uppercase tracking-widest ${authTab === 'register' ? 'bg-white text-gray-900 border-b-4 border-gray-900' : 'text-gray-400'}`}>Join</button>
             </div>
           )}
           <form onSubmit={handleAuth} className="p-10 space-y-6">
              {authError && <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-100 text-center">{authError}</div>}
              {(authTab === 'register' || isFirstRun) && (
                <>
                  <input required type="text" placeholder="Name" className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 font-bold" value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} />
                  {!isFirstRun && (
                    <select className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 font-bold" value={authForm.grade} onChange={e => setAuthForm({...authForm, grade: e.target.value})}>
                      {GRADELIST.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                </>
              )}
              <input required type="email" placeholder="Email" className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 font-bold" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} />
              <div className="relative">
                <input required type={showAuthPassword ? 'text' : 'password'} placeholder="Password" className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 font-bold" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
                <button type="button" onClick={() => setShowAuthPassword(s => !s)} aria-label="Toggle password visibility" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black uppercase text-gray-500">
                  {showAuthPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={authForm.rememberMe} onChange={e => setAuthForm({...authForm, rememberMe: e.target.checked})} />
                  <span className="text-[12px] font-black uppercase">Remember me</span>
                </label>
                {authTab === 'signin' && (
                  <button type="button" onClick={() => { setShowPwdResetModal(true); setResetEmail(authForm.email || ''); setResetMsg(null); }} className="text-indigo-600 text-[12px] font-black uppercase">Forgot password?</button>
                )}
              </div>
              <button type="submit" className="w-full bg-gray-900 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest shadow-xl">{isFirstRun ? 'Initialize' : (authTab === 'signin' ? 'Enter' : 'Request')}</button>
           </form>
           {showPwdResetModal && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
               <div className="bg-white rounded-2xl p-8 w-full max-w-md">
                 <h3 className="text-xl font-black uppercase mb-4">Reset Password</h3>
                 {resetMsg && <div className="mb-4 text-sm">{resetMsg}</div>}
                 <input type="email" placeholder="Your account email" className="w-full p-3 border rounded mb-3" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
                 <div className="relative mb-3">
                   <input type={showResetPassword ? 'text' : 'password'} placeholder="New password" className="w-full p-3 border rounded" value={resetNewPassword} onChange={e => setResetNewPassword(e.target.value)} />
                   <button type="button" onClick={() => setShowResetPassword(s => !s)} aria-label="Toggle new password visibility" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black uppercase text-gray-500">{showResetPassword ? 'Hide' : 'Show'}</button>
                 </div>
                 <div className="relative mb-3">
                   <input type={showResetPassword ? 'text' : 'password'} placeholder="Confirm new password" className="w-full p-3 border rounded" value={resetConfirmPassword} onChange={e => setResetConfirmPassword(e.target.value)} />
                   <button type="button" onClick={() => setShowResetPassword(s => !s)} aria-label="Toggle confirm password visibility" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black uppercase text-gray-500">{showResetPassword ? 'Hide' : 'Show'}</button>
                 </div>
                 <div className="flex gap-3 justify-end">
                   <button onClick={() => setShowPwdResetModal(false)} className="px-4 py-2 border rounded">Cancel</button>
                   <button onClick={async () => {
                     setResetMsg(null);
                     if (!resetEmail) { setResetMsg('Enter your email.'); return; }
                     if (!resetNewPassword) { setResetMsg('Enter a new password.'); return; }
                     if (resetNewPassword !== resetConfirmPassword) { setResetMsg('Passwords do not match.'); return; }
                     try {
                       await resetPassword(resetEmail, resetNewPassword);
                       setResetMsg('Password reset successful. You may now sign in.');
                       setShowPwdResetModal(false);
                       setAuthTab('signin');
                       setAuthForm({ ...authForm, email: resetEmail });
                     } catch (err: any) {
                       setResetMsg(err.message || 'Reset failed.');
                     }
                   }} className="px-4 py-2 bg-indigo-600 text-white rounded">Reset</button>
                 </div>
               </div>
             </div>
           )}
        </div>
      </div>
    );
  }

  // Show a clear banner if Gemini API key is missing so users understand AI won't work
  const missingAIKey = !GEMINI_KEY || GEMINI_KEY.trim().length === 0;

  if (currentUser.status === UserStatus.PENDING) {
    return <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center"><h2 className="text-5xl font-black uppercase tracking-tighter italic">Verifying Identity</h2><p className="mt-4">Account pending approval.</p><button onClick={handleLogout} className="mt-8 text-xs font-black uppercase tracking-widest text-gray-400">Sign Out</button></div>;
  }

  // If preview mode is active for staff users, pass a student-profile copy to child pages
  const effectiveUserForPages = currentUser && isPreviewMode && (currentUser.role === UserRole.STAFF || currentUser.role === UserRole.SUPER_ADMIN)
    ? { ...currentUser, role: UserRole.STUDENT }
    : currentUser;

  if (activeAssignmentId) return <AssignmentPortal id={activeAssignmentId} mode="work" currentUser={effectiveUserForPages!} onBack={() => setActiveAssignmentId(null)} />;
  if (reviewAssignmentId) return <SubmissionReview assignmentId={reviewAssignmentId} onBack={() => setReviewAssignmentId(null)} />;
  if (activeBookletId) return <BookletEditor bookletId={activeBookletId} onBack={() => setActiveBookletId(null)} userRole={currentUser.role} />;

  return (
    <>
      {missingAIKey && (
        <div className="fixed inset-x-0 top-0 z-50 bg-red-600 text-white text-center py-2 font-black text-sm">AI Disabled — GEMINI_API_KEY is not set. Set the env var to enable AI features.</div>
      )}
      {currentUser && (currentUser.role === UserRole.STAFF || currentUser.role === UserRole.SUPER_ADMIN) && (
        <div style={{ position: 'fixed', right: 18, top: 18, zIndex: 9999 }}>
          <button onClick={() => setIsPreviewMode(v => !v)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl shadow-lg font-black text-xs uppercase">
            {isPreviewMode ? 'Exit Student Portal' : 'Enter Student Portal'}
          </button>
        </div>
      )}
      {notifMessage && (
        <div className="fixed left-4 bottom-4 z-50">
          <div className="bg-indigo-600 text-white px-4 py-3 rounded-lg shadow-lg font-bold">
            {notifMessage} <button onClick={() => setNotifMessage(null)} className="ml-3 underline">Dismiss</button>
          </div>
        </div>
      )}

      {currentUser && currentUser.role === UserRole.STUDENT && showSubjectSelector && (
        <SubjectSelector user={currentUser} onSaved={() => setShowSubjectSelector(false)} />
      )}
      <Dashboard onSelectBooklet={setActiveBookletId} onSelectAssignment={setActiveAssignmentId} onViewSubmissions={setReviewAssignmentId} userRole={currentUser.role} currentUser={effectiveUserForPages!} onLogout={handleLogout} isPreviewMode={isPreviewMode} setIsPreviewMode={setIsPreviewMode} />
    </>
  );
};

export default App;
