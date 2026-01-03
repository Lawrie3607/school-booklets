
import React, { useState, useEffect, useMemo } from 'react';
import { Booklet, Question, BookletType, UserRole } from '../types';
import * as storageService from '../services/storageService';
import { processImageWithGemini } from '../services/geminiService';
import QuestionItem from '../components/QuestionItem';
import { GRADE_THEMES } from '../constants';

interface BookletEditorProps {
  bookletId: string;
  onBack: () => void;
  userRole: UserRole;
}

const TERMS = ["Term 1", "Term 2", "Term 3", "Term 4"];

const BookletEditor: React.FC<BookletEditorProps> = ({ bookletId, onBack, userRole }) => {
  const [booklet, setBooklet] = useState<Booklet | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [showPlanner, setShowPlanner] = useState(false);
  
  const [currentTopic, setCurrentTopic] = useState<string>('');
  const [currentTerm, setCurrentTerm] = useState<string>('Term 1');

  const isStaff = userRole === UserRole.STAFF || userRole === UserRole.SUPER_ADMIN;

  const loadBooklet = async () => {
     const data = await storageService.getBookletById(bookletId);
     if (data) {
        setBooklet(data);
        if (!currentTopic) {
            const lastQ = data.questions[data.questions.length - 1];
            setCurrentTopic(lastQ?.topic || data.topic);
            setCurrentTerm(lastQ?.term || 'Term 1');
        }
     }
  };

  useEffect(() => {
    loadBooklet();
  }, [bookletId]);

  const sortedQuestions = useMemo(() => {
    if (!booklet) return [];
    return [...booklet.questions].sort((a, b) => a.number - b.number);
  }, [booklet]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !booklet) return;
    const files = Array.from(e.target.files) as File[];
    setIsProcessing(true);
    const activeTopic = currentTopic || booklet.topic;

    for (const file of files) {
      setProcessStatus(`Uploading: ${file.name}`);
      try {
        const base64 = await new Promise<string>((res) => {
          const r = new FileReader();
          r.readAsDataURL(file);
          r.onload = () => res(r.result as string);
        });
        
        // Step 1: Add as a placeholder with sequential number
        const now = Date.now();
        const newQ: Question = {
          id: crypto.randomUUID(), 
          topic: activeTopic, 
          term: currentTerm, 
          number: booklet.questions.length + 1, 
          maxMarks: 0,
          imageUrls: [base64], 
          extractedQuestion: "AI Analyzing...", 
          generatedSolution: null,
          isProcessing: true, 
          includeImage: true,
          createdAt: now
        };
        
        // This triggers storage and automatic renumbering
        await storageService.addQuestionToBooklet(bookletId, newQ);
        await loadBooklet(); 

        // Step 2: Solve with AI
        setProcessStatus(`AI Solving Question ${newQ.number}...`);
        const aiResp = await processImageWithGemini([base64], newQ.number, booklet.type);
        
        if (aiResp.error) {
           setProcessStatus(`AI Error: ${aiResp.error}`);
        }

        await storageService.updateQuestionInBooklet(bookletId, newQ.id, {
            extractedQuestion: aiResp.questionText,
            generatedSolution: aiResp.solutionMarkdown,
            maxMarks: aiResp.totalMarks,
            isProcessing: false
        });
        await loadBooklet();
      } catch (err) { 
        console.error("Upload failure:", err); 
        setProcessStatus("Upload Failed.");
      }
    }
    setIsProcessing(false);
    setProcessStatus('');
  };

  if (!booklet) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-30 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-3 bg-gray-900 text-white rounded-2xl flex items-center gap-2 pr-6 shadow-xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m15 18-6-6 6-6"/></svg>
              <span className="text-[10px] font-black uppercase tracking-widest">Exit</span>
            </button>
            <div className="border-l-2 border-gray-100 pl-6">
              <h1 className="font-black text-gray-900 uppercase tracking-tighter italic">{booklet.title}</h1>
            </div>
          </div>

          {isStaff && (
            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-[2rem] border border-gray-100">
              <select className="bg-white border rounded-xl px-3 py-2 text-[11px] font-bold" value={currentTerm} onChange={e => setCurrentTerm(e.target.value)}>
                {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="text" placeholder="Topic..." className="bg-white border rounded-xl px-4 py-2 text-[11px] font-bold w-40" value={currentTopic} onChange={e => setCurrentTopic(e.target.value)} />
              <label className="cursor-pointer bg-indigo-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all">
                <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
                Add Units
              </label>
            </div>
          )}
        </div>
      </header>

      {isProcessing && (
        <div className="fixed bottom-10 right-10 z-50 bg-gray-900 text-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4 font-black text-[10px] uppercase tracking-widest">
           <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
           {processStatus}
        </div>
      )}

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-24">
            {sortedQuestions.map(q => (
              <div id={`q-${q.id}`} key={q.id}>
                <QuestionItem 
                  question={q} 
                  bookletType={booklet.type} 
                  variant="question" 
                  onDelete={async (id) => { if(confirm("Remove?")) { await storageService.removeQuestionFromBooklet(booklet.id, id); loadBooklet(); } }} 
                  onUpdate={async (id, updates) => { await storageService.updateQuestionInBooklet(booklet.id, id, updates); loadBooklet(); }}
                  isStaff={isStaff}
                  onRegenerate={async () => {
                     setProcessStatus(`Regenerating Q${q.number}`);
                     setIsProcessing(true);
                     const aiResp = await processImageWithGemini(q.imageUrls, q.number, booklet.type);
                     await storageService.updateQuestionInBooklet(booklet.id, q.id, {
                       extractedQuestion: aiResp.questionText,
                       generatedSolution: aiResp.solutionMarkdown,
                       maxMarks: aiResp.totalMarks,
                       isProcessing: false
                     });
                     await loadBooklet();
                     setIsProcessing(false);
                  }}
                />
              </div>
            ))}
            
            {sortedQuestions.length === 0 && (
              <div className="py-40 text-center border-4 border-dashed rounded-[4rem] border-gray-100">
                <p className="text-4xl font-black text-gray-200 uppercase italic">Empty Module</p>
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mt-4">Upload question images to begin sequence.</p>
              </div>
            )}
        </div>
      </main>
      {/* Bottom-right Year Planner button */}
      <div className="fixed bottom-8 right-8 z-40">
        <button onClick={() => setShowPlanner(true)} className="bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-xl font-black uppercase text-[12px]">Year Planner</button>
      </div>

      {showPlanner && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-black uppercase">Year Planner</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowPlanner(false)} className="px-3 py-2 border rounded">Close</button>
                <button onClick={() => { setShowPlanner(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="px-3 py-2 bg-gray-900 text-white rounded">Back to Editor</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {TERMS.map(term => {
                const topics = Array.from(new Set(booklet.questions.filter(q => (q.term || 'Term 1') === term).map(q => q.topic || booklet.topic))).filter(t => t && t.trim().length>0);
                return (
                  <div key={term} className="p-4 border rounded">
                    <h3 className="font-black uppercase mb-3">{term}</h3>
                    {topics.length === 0 ? <p className="text-sm text-gray-400">No topics assigned.</p> : (
                      <ul className="space-y-2">
                        {topics.map(t => (
                          <li key={t}>
                            <button onClick={() => {
                              // find first question matching term+topic
                              const q = booklet.questions.find(q2 => (q2.term || 'Term 1') === term && (q2.topic || booklet.topic) === t);
                              if (q) {
                                setShowPlanner(false);
                                const el = document.getElementById(`q-${q.id}`);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }} className="text-indigo-600 hover:underline">{t}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookletEditor;
