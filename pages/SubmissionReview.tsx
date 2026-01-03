
import React, { useState, useEffect } from 'react';
import { Assignment, Submission, User, Booklet } from '../types';
import * as storageService from '../services/storageService';
import MarkdownDisplay from '../components/MarkdownDisplay';

interface SubmissionReviewProps {
  assignmentId: string;
  onBack: () => void;
}

const SubmissionReview: React.FC<SubmissionReviewProps> = ({ assignmentId, onBack }) => {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activeSub, setActiveSub] = useState<Submission | null>(null);
  const [booklet, setBooklet] = useState<Booklet | null>(null);
  const [editingMarkIdx, setEditingMarkIdx] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const a = await storageService.getAssignmentById(assignmentId);
      if (a) {
        setAssignment(a);
        const b = await storageService.getBookletById(a.bookletId);
        if (b) setBooklet(b);
        const subs = await storageService.getSubmissions(assignmentId);
        setSubmissions(subs);
      }
    };
    load();
  }, [assignmentId]);

  const handleOverrideMark = async (ansIdx: number, newMark: number) => {
    if (!activeSub) return;
    const updatedSub = { ...activeSub };
    updatedSub.answers[ansIdx].teacherOverrideMark = newMark;
    
    // Recalculate total
    updatedSub.totalScore = updatedSub.answers.reduce((acc, ans) => {
      return acc + (ans.teacherOverrideMark !== undefined ? ans.teacherOverrideMark : (ans.aiMark || 0));
    }, 0);

    await storageService.submitWork(updatedSub);
    setActiveSub(updatedSub);
    setSubmissions(prev => prev.map(s => s.id === updatedSub.id ? updatedSub : s));
    setEditingMarkIdx(null);
  };

  const handleRecordFinal = async () => {
    if (!activeSub) return;
    const finalized = { ...activeSub, status: 'RECORDED' as const };
    await storageService.submitWork(finalized);
    setActiveSub(finalized);
    setSubmissions(prev => prev.map(s => s.id === finalized.id ? finalized : s));
    alert("Grade officially recorded.");
  };

  if (!assignment) return <div className="p-20 text-center animate-pulse">Loading Submissions...</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <header className="mb-16 flex justify-between items-center">
         <div className="flex items-center gap-6">
            <button onClick={onBack} className="p-4 bg-white border border-gray-100 rounded-3xl shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m15 18-6-6 6-6"/></svg></button>
            <div>
               <h2 className="text-4xl font-black uppercase tracking-tighter italic">{assignment.topic} - Submissions</h2>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Total Scripts Received: {submissions.length}</p>
            </div>
         </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
         <div className="space-y-4">
            {submissions.map(s => (
               <button 
                 key={s.id} 
                 onClick={() => setActiveSub(s)}
                 className={`w-full p-6 rounded-3xl border-4 text-left transition-all flex justify-between items-center ${activeSub?.id === s.id ? 'border-indigo-600 bg-white shadow-xl' : 'border-gray-100 bg-white opacity-60 hover:opacity-100'}`}
               >
                  <div>
                     <p className="font-black text-gray-900 uppercase tracking-tighter text-lg leading-none">{s.studentName}</p>
                     <p className="text-[9px] font-black uppercase tracking-widest mt-1 text-gray-400">{s.status}</p>
                  </div>
                  <div className="text-right">
                     <p className="font-black text-indigo-600 text-xl">{s.totalScore}/{s.maxScore}</p>
                  </div>
               </button>
            ))}
         </div>

         <div className="lg:col-span-2">
            {activeSub ? (
               <div className="bg-white rounded-[4rem] p-12 border-4 border-gray-100 shadow-2xl">
                  <div className="flex justify-between items-center mb-12 border-b-4 border-gray-50 pb-8">
                     <h3 className="text-4xl font-black uppercase tracking-tighter italic">{activeSub.studentName}'s Script</h3>
                     <div className="flex gap-4">
                        <span className="bg-gray-900 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl">Final Mark: {activeSub.totalScore}/{activeSub.maxScore}</span>
                        {activeSub.status !== 'RECORDED' && (
                          <button onClick={handleRecordFinal} className="bg-green-600 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-green-700 transition-all">Record Final</button>
                        )}
                     </div>
                  </div>
                  <div className="space-y-16">
                     {activeSub.answers.map((ans, i) => {
                        const q = booklet?.questions.find(item => item.id === ans.questionId);
                        const currentMark = ans.teacherOverrideMark !== undefined ? ans.teacherOverrideMark : (ans.aiMark || 0);
                        return (
                           <div key={i} className="space-y-6">
                              <div className="flex items-center gap-4">
                                 <span className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center font-black text-xs">Q{q?.number || i+1}</span>
                                 <div className="flex-1 h-0.5 bg-gray-100"></div>
                              </div>
                              <div className="grid grid-cols-2 gap-8">
                                                 <div>
                                                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Question</p>
                                                      <div className="bg-white p-6 rounded-3xl border border-gray-100 min-h-[100px]">
                                                          {q ? (
                                                             <>
                                                                <div className="prose max-w-none">
                                                                   <MarkdownDisplay content={q.extractedQuestion} />
                                                                </div>
                                                                {q.imageUrls && q.imageUrls.length > 0 && (
                                                                   <div className="mt-4">
                                                                      {q.imageUrls.map((u, idx) => <img key={idx} src={u} className="rounded-xl shadow-sm border" />)}
                                                                   </div>
                                                                )}
                                                             </>
                                                          ) : (
                                                             <p className="font-bold text-gray-900 italic">Question content unavailable.</p>
                                                          )}
                                                      </div>
                                                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 mt-4">Student Response</p>
                                                      <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 min-h-[100px]">
                                                          <p className="font-bold text-gray-900 italic leading-relaxed">"{ans.textResponse || 'No text'}"</p>
                                                          {ans.imageResponse && <img src={ans.imageResponse} className="mt-4 rounded-xl shadow-lg border-2 border-white" />}
                                                      </div>
                                                 </div>
                                 <div>
                                    <div className="flex justify-between items-center mb-4">
                                       <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Grading (Max: {q?.maxMarks || 5})</p>
                                       {activeSub.status !== 'RECORDED' && (
                                         <button onClick={() => setEditingMarkIdx(i)} className="text-[9px] font-black uppercase text-gray-400 hover:text-indigo-600">Manual Adjust</button>
                                       )}
                                    </div>
                                    <div className="bg-indigo-50/30 p-6 rounded-3xl border border-indigo-100">
                                       {editingMarkIdx === i ? (
                                         <div className="flex gap-2">
                                            <input type="number" step="0.5" className="w-20 bg-white border rounded-xl p-2 font-black" defaultValue={currentMark} onBlur={(e) => handleOverrideMark(i, parseFloat(e.target.value))} autoFocus />
                                            <span className="font-black text-xl">/ {q?.maxMarks || 5}</span>
                                         </div>
                                       ) : (
                                         <>
                                            <p className="font-black text-indigo-600 text-2xl mb-2">{currentMark}/{q?.maxMarks || 5}</p>
                                            <p className="font-bold text-gray-600 text-sm leading-relaxed italic">"{ans.aiFeedback}"</p>
                                         </>
                                       )}
                                    </div>
                                 </div>
                              </div>
                           </div>
                        );
                     })}
                  </div>
               </div>
            ) : (
               <div className="h-full flex items-center justify-center bg-white rounded-[4rem] border-4 border-dashed border-gray-100 opacity-20">
                  <p className="font-black text-4xl uppercase tracking-tighter italic">Select a script to review</p>
               </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default SubmissionReview;
