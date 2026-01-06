import React, { useState, useEffect, useMemo } from 'react';
import { Assignment, Submission, Question, Booklet, User, StudentAnswer, UserRole } from '../types';
import * as storageService from '../services/storageService';
import { markStudentWork } from '../services/geminiService';
import MarkdownDisplay from '../components/MarkdownDisplay';

interface AssignmentPortalProps {
  id: string;
  mode: 'work' | 'review';
  currentUser: User;
  onBack: () => void;
}

const AssignmentPortal: React.FC<AssignmentPortalProps> = ({ id, mode, currentUser, onBack }) => {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [booklet, setBooklet] = useState<Booklet | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [currentAnswers, setCurrentAnswers] = useState<Record<string, { text: string, img: string }>>({});
   const [answerModes, setAnswerModes] = useState<Record<string, 'type' | 'upload'>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
   const [ocrWarnings, setOcrWarnings] = useState<Record<string,string>>({});
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [isWindowFocused, setIsWindowFocused] = useState(true);

  const isStaff = currentUser.role === UserRole.STAFF || currentUser.role === UserRole.SUPER_ADMIN;
   const isDesktop = typeof (window as any).electron !== 'undefined' && !!(window as any).electron.getCameraSnapshot;
   const hasWebCamera = typeof navigator !== 'undefined' && !!(navigator.mediaDevices && (navigator.mediaDevices as any).getUserMedia);
   const canUseCamera = isDesktop || hasWebCamera;

  useEffect(() => {
    const load = async () => {
      const a = await storageService.getAssignmentById(id);
      if (a) {
        setAssignment(a);
        const b = await storageService.getBookletById(a.bookletId);
        if (b) setBooklet(b);
        const existing = await storageService.getSubmissions(id, currentUser.id);
        if (existing.length > 0) setSubmission(existing[0]);
      }
    };
    load();

    const onFocus = () => setIsWindowFocused(true);
    const onBlur = () => setIsWindowFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [id, currentUser.id]);

   useEffect(() => {
      if (currentUser && !(currentUser.role === UserRole.STAFF || currentUser.role === UserRole.SUPER_ADMIN)) {
         const onCopy = (e: ClipboardEvent) => { e.preventDefault(); alert('Copy is disabled for assessment integrity.'); };
         const onPaste = (e: ClipboardEvent) => { e.preventDefault(); alert('Paste is disabled. Type your answer directly.'); };
         window.addEventListener('copy', onCopy as any);
         window.addEventListener('paste', onPaste as any);
         window.addEventListener('cut', onCopy as any);
         return () => {
            window.removeEventListener('copy', onCopy as any);
            window.removeEventListener('paste', onPaste as any);
            window.removeEventListener('cut', onCopy as any);
         };
      }
   }, [currentUser]);

  const questions = useMemo(() => {
    if (!booklet || !assignment) return [];
    return booklet.questions
      .filter(q => q.topic === assignment.topic && q.number >= assignment.startNum && q.number <= assignment.endNum)
      .sort((a, b) => a.number - b.number);
  }, [booklet, assignment]);

  const handleImageUpload = (qId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
             const dataUrl = ev.target?.result as string;
             setCurrentAnswers(prev => ({ ...prev, [qId]: { ...prev[qId], img: dataUrl, text: '' } }));
             setAnswerModes(m => ({ ...m, [qId]: 'upload' }));
             // run OCR to detect typed text (client-side)
             try {
                const t = (window as any).Tesseract;
                if (t && t.recognize) {
                   t.recognize(dataUrl, 'eng', { logger: m => {} }).then((res: any) => {
                      const text = (res && res.data && res.data.text) ? res.data.text : '';
                      // Heuristic: if OCR text length > 30 chars or contains multiple words, flag it
                      const cleaned = (text || '').replace(/\s+/g, ' ').trim();
                      if (cleaned.length > 30) {
                         setOcrWarnings(w => ({ ...w, [qId]: cleaned.substring(0, 200) }));
                      } else {
                         setOcrWarnings(w => { const nw = { ...w }; delete nw[qId]; return nw; });
                      }
                   }).catch(() => {
                      // ignore OCR failures but clear any previous warning
                      setOcrWarnings(w => { const nw = { ...w }; delete nw[qId]; return nw; });
                   });
                }
             } catch (err) {
                // no-op
             }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!assignment) return;
    if (!confirm("Submit your work for AI grading?")) return;
    
    setIsSubmitting(true);
    const answers: StudentAnswer[] = [];
    let totalScore = 0;
    let maxPossibleScore = 0;
    
    try {
            for (const q of questions) {
                  const resp = currentAnswers[q.id] || { text: '', img: '' };
                  const mode = answerModes[q.id] || (resp.img ? 'upload' : 'type');
                  // validation per user requirement
                  if (mode === 'upload') {
                     if (!resp.img) throw new Error(`Question ${q.number}: Please upload a handwritten image for upload mode.`);
                     if ((resp.text || '').trim().length > 0) throw new Error(`Question ${q.number}: Uploaded submissions must not contain typed text.`);
                     if (ocrWarnings[q.id]) throw new Error(`Question ${q.number}: Uploaded image appears to contain typed text — please replace with handwritten work.`);
                  } else {
                     if (!(resp.text || '').trim()) throw new Error(`Question ${q.number}: Please type your answer in typing mode.`);
                     if (resp.img) throw new Error(`Question ${q.number}: Typed submissions must not include uploaded images.`);
                  }

                  const aiResult = await markStudentWork(
                     q.extractedQuestion, 
                     q.generatedSolution || "", 
                     resp.text, 
                     q.maxMarks || 5, 
                     resp.img
                  );

                  answers.push({
                        questionId: q.id,
                        textResponse: resp.text,
                        imageResponse: resp.img,
                        aiMark: aiResult.score,
                        aiFeedback: aiResult.feedback
                  });
                  totalScore += aiResult.score;
                  maxPossibleScore += (q.maxMarks || 5);
            }
        
        const sub: Submission = {
            id: crypto.randomUUID(),
            assignmentId: id,
            studentId: currentUser.id,
            studentName: currentUser.name,
            answers,
            totalScore,
            maxScore: maxPossibleScore,
            status: 'MARKED',
            submittedAt: Date.now()
        };
        
        await storageService.submitWork(sub);
        setSubmission(sub);
    } catch (err) {
        alert("Grading engine failed.");
    } finally {
        setIsSubmitting(false);
    }
  };

  if (!assignment || !booklet) return <div className="p-20 text-center font-black animate-pulse text-gray-300">INITIALIZING WORKPLACE...</div>;

  if (submission) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20">
         <div className="bg-white rounded-[4rem] p-16 shadow-2xl text-center border-t-[16px] border-indigo-600">
            <div className="w-32 h-32 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner">
               <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 className="text-6xl font-black uppercase tracking-tighter mb-4 italic">Work Submitted</h2>
            <p className="text-xl text-gray-400 font-bold uppercase tracking-widest mb-12">Total Mark: <span className="text-indigo-600">{submission.totalScore} / {submission.maxScore}</span></p>
            <div className="space-y-8 text-left mb-16">
               {submission.answers.map((ans, i) => (
                 <div key={i} className="bg-gray-50 p-8 rounded-3xl border border-gray-100">
                    <p className="font-black uppercase tracking-widest text-[10px] text-gray-400 mb-2">Q{i + 1} Result</p>
                    <p className="font-bold text-gray-900 leading-relaxed italic">"{ans.aiFeedback}"</p>
                 </div>
               ))}
            </div>
            <button onClick={onBack} className="bg-gray-900 text-white px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Return to Library</button>
         </div>
      </div>
    );
  }

  const currentQ = questions[activeQuestionIdx];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
      <header className="bg-white border-b sticky top-0 z-50 py-6 shadow-sm">
         <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
            <div className="flex items-center gap-6">
               <button onClick={onBack} className="p-3 bg-gray-100 text-gray-900 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m15 18-6-6 6-6"/></svg></button>
               <div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter italic leading-none">{assignment.topic}</h2>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">Assignment Portal &bull; {booklet.grade}</p>
               </div>
            </div>
            <div className="flex gap-2">
               {questions.map((_, i) => (
                 <button 
                    key={i} 
                    onClick={() => setActiveQuestionIdx(i)} 
                    className={`w-10 h-10 rounded-xl font-black text-xs flex items-center justify-center transition-all ${activeQuestionIdx === i ? 'bg-indigo-600 text-white shadow-lg scale-110' : (currentAnswers[questions[i].id]?.text || currentAnswers[questions[i].id]?.img) ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}
                 >
                    {i + 1}
                 </button>
               ))}
            </div>
         </div>
      </header>

      <main 
        className={`max-w-7xl mx-auto px-6 py-12 transition-all duration-500 ${!isWindowFocused && !isStaff ? 'blurred-inactive' : ''}`}
        onContextMenu={e => !isStaff && e.preventDefault()}
      >
        {currentQ ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
             <div className="space-y-8">
                <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-gray-100 min-h-[600px] flex flex-col secure-content" style={{ position: 'relative', userSelect: isStaff ? 'auto' : 'none' }}>
                   <div className="flex justify-between items-center mb-10">
                      <span className="bg-gray-900 text-white px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest">Task {activeQuestionIdx + 1}</span>
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Allocation: {currentQ.maxMarks} Marks</span>
                   </div>
                   <div className="flex-1 overflow-y-auto space-y-6">
                       {currentQ.imageUrls.map((url, i) => (
                          <img key={i} src={url} className="w-full h-auto rounded-3xl border border-gray-50 shadow-sm" alt="Resource" />
                       ))}
                       <div className="prose prose-xl max-w-none pt-6 border-t border-gray-50">
                          <MarkdownDisplay content={currentQ.extractedQuestion} />
                       </div>
                   </div>
                   {/* Watermark to discourage screenshots and linking: lightweight, per-user timestamped stamp */}
                   {!isStaff && (
                     <div style={{ position: 'absolute', left: 12, top: 12, opacity: 0.06, pointerEvents: 'none', fontSize: 12, fontWeight: 800 }}>
                       {`${currentUser.email || currentUser.name} • ${new Date().toLocaleString()}`}
                     </div>
                   )}
                </div>
             </div>

             <div className="space-y-8">
                <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-indigo-50 h-full flex flex-col">
                   <div className="mb-10 flex justify-between items-end">
                       <label htmlFor={`answer-text-${currentQ.id}`} className="text-3xl font-black uppercase tracking-tighter italic">Student Workplace</label>
                       <div className="h-1 w-20 bg-indigo-100 rounded-full"></div>
                   </div>
                   
                   <div className="flex-1 flex flex-col gap-8">
                       <div className="flex-1 relative">
                                        <textarea 
                             id={`answer-text-${currentQ.id}`}
                             name={`studentAnswer-${currentQ.id}`}
                             placeholder="Type your solution steps or final answer here... (Copy-Paste is disabled)"
                             className="w-full h-full p-10 bg-gray-50 border-2 border-gray-100 rounded-[2.5rem] font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all text-xl resize-none placeholder:text-gray-200"
                             value={currentAnswers[currentQ.id]?.text || ''}
                             onPaste={(e) => {
                               e.preventDefault();
                               alert("Integrity Alert: Direct typing is required.");
                             }}
                                           onCopy={(e) => { e.preventDefault(); alert('Copy disabled.'); }}
                                           onChange={e => {
                                              // typing sets mode to 'type' and clears any uploaded image for that question
                                              setAnswerModes(m => ({ ...m, [currentQ.id]: 'type' }));
                                              setCurrentAnswers(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], text: e.target.value, img: '' } }));
                                           }}
                           />
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <label htmlFor={`upload-handwriting-${currentQ.id}`} className={`cursor-pointer group p-8 rounded-[2rem] border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 ${currentAnswers[currentQ.id]?.img ? 'bg-green-50 border-green-200' : 'bg-indigo-50/30 border-indigo-100 hover:bg-indigo-50'}`}>
                             <input id={`upload-handwriting-${currentQ.id}`} name={`uploadImg-${currentQ.id}`} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(currentQ.id, e)} disabled={answerModes[currentQ.id] === 'type'} />
                             {currentAnswers[currentQ.id]?.img ? (
                                <div className="w-full flex flex-col items-center gap-3">
                                   <img src={currentAnswers[currentQ.id].img} alt="Uploaded handwriting" className="w-44 h-32 object-contain rounded-lg border" />
                                   <div className="flex gap-3">
                                      <button type="button" onClick={async () => {
                                         // Retake: prefer camera capture, otherwise open file picker
                                         try {
                                            if (canUseCamera) {
                                               let dataUrl: string | null = null;
                                               if ((window as any).electron && typeof (window as any).electron.getCameraSnapshot === 'function') {
                                                  dataUrl = await (window as any).electron.getCameraSnapshot();
                                               } else if (hasWebCamera) {
                                                  const stream = await (navigator.mediaDevices as any).getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                                                  const track = stream.getVideoTracks()[0];
                                                  const video = document.createElement('video');
                                                  video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
                                                  await new Promise(res => { video.onloadedmetadata = () => { video.play(); res(null); }; });
                                                  const canvas = document.createElement('canvas');
                                                  canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
                                                  const ctx = canvas.getContext('2d');
                                                  if (!ctx) throw new Error('Canvas unsupported');
                                                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                                                  dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                                                  try { track.stop(); } catch(_) {}
                                                  stream.getTracks().forEach((t: any) => { try { t.stop(); } catch(_) {} });
                                               }
                                               if (dataUrl) {
                                                  setCurrentAnswers(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], img: dataUrl, text: '' } }));
                                                  setAnswerModes(m => ({ ...m, [currentQ.id]: 'upload' }));
                                                  setOcrWarnings(w => { const nw = { ...w }; delete nw[currentQ.id]; return nw; });
                                                  return;
                                               }
                                            }
                                            // Fallback to file picker
                                            const input = document.getElementById(`upload-handwriting-${currentQ.id}`) as HTMLInputElement | null;
                                            if (input) input.click();
                                         } catch (err) {
                                            console.error('Retake failed', err);
                                            alert('Retake failed.');
                                         }
                                      }} className="px-3 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm">Retake</button>

                                      <button type="button" onClick={() => {
                                         setCurrentAnswers(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], img: '' } }));
                                         setAnswerModes(m => ({ ...m, [currentQ.id]: undefined as any }));
                                         setOcrWarnings(w => { const nw = { ...w }; delete nw[currentQ.id]; return nw; });
                                      }} className="px-3 py-2 bg-white border rounded-lg font-bold text-sm">Remove</button>
                                   </div>
                                </div>
                             ) : (
                                <div className="flex flex-col items-center gap-2">
                                   <p className="font-black uppercase tracking-widest text-[10px] text-center">Capture Handwriting</p>
                                   {canUseCamera && !isStaff && (
                                      <button type="button" onClick={async () => {
                                         try {
                                            let dataUrl: string | null = null;
                                            if ((window as any).electron && typeof (window as any).electron.getCameraSnapshot === 'function') {
                                               dataUrl = await (window as any).electron.getCameraSnapshot();
                                            } else if (hasWebCamera) {
                                               // Browser fallback: capture a single frame via getUserMedia
                                               const stream = await (navigator.mediaDevices as any).getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                                               const track = stream.getVideoTracks()[0];
                                               const video = document.createElement('video');
                                               video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
                                               await new Promise(res => { video.onloadedmetadata = () => { video.play(); res(null); }; });
                                               const canvas = document.createElement('canvas');
                                               canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
                                               const ctx = canvas.getContext('2d');
                                               if (!ctx) throw new Error('Canvas unsupported');
                                               ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                                               dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                                               try { track.stop(); } catch(_) {}
                                               stream.getTracks().forEach((t: any) => { try { t.stop(); } catch(_) {} });
                                            }
                                            if (dataUrl) {
                                               setCurrentAnswers(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], img: dataUrl, text: '' } }));
                                               setAnswerModes(m => ({ ...m, [currentQ.id]: 'upload' }));
                                               setOcrWarnings(w => { const nw = { ...w }; delete nw[currentQ.id]; return nw; });
                                            } else {
                                               alert('Camera capture failed or was denied.');
                                            }
                                         } catch (err) {
                                            console.error(err);
                                            alert('Camera capture failed.');
                                         }
                                      }} className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm">Use Camera</button>
                                   )}
                                </div>
                             )}
                                   {ocrWarnings[currentQ.id] && (
                                      <div className="mt-3 text-xs text-red-600 font-bold">Warning: Uploaded image appears to contain typed text — please upload handwritten work instead.</div>
                                   )}
                          </label>

                          <div className="flex flex-col gap-4">
                                           <div className="flex items-center gap-3 mb-4">
                                              <button type="button" onClick={() => { setAnswerModes(m => ({ ...m, [currentQ.id]: 'type' })); setCurrentAnswers(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], img: '' } })); }} className={`px-4 py-2 rounded-xl font-black text-xs ${answerModes[currentQ.id] === 'type' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>Type</button>
                                              <button type="button" onClick={() => { setAnswerModes(m => ({ ...m, [currentQ.id]: 'upload' })); setCurrentAnswers(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], text: '' } })); }} className={`px-4 py-2 rounded-xl font-black text-xs ${answerModes[currentQ.id] === 'upload' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Upload</button>
                                              <span className="text-[11px] text-gray-400 ml-3">Select how you will submit.</span>
                                           </div>
                             {activeQuestionIdx < questions.length - 1 ? (
                                <button onClick={() => setActiveQuestionIdx(v => v + 1)} className="flex-1 bg-gray-900 text-white font-black py-8 rounded-[2rem] text-xs uppercase tracking-widest shadow-xl">Next Question</button>
                             ) : (
                                <button onClick={handleSubmit} disabled={isSubmitting} className="flex-1 bg-indigo-600 text-white font-black py-8 rounded-[2rem] text-xs uppercase tracking-widest shadow-2xl animate-pulse disabled:opacity-50">
                                   {isSubmitting ? 'GRADING...' : 'FINISH'}
                                </button>
                             )}
                          </div>
                       </div>
                   </div>
                </div>
             </div>
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default AssignmentPortal;