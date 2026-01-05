
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Booklet, Question, BookletType, UserRole } from '../types';
import * as storageService from '../services/storageService';
import { processImageWithGemini, optimizeBookletContent, formatTextWithAI } from '../services/geminiService';
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
  const [isDirty, setIsDirty] = useState(false);
  const initialUpdatedAt = useRef<number | null>(null);

  const isStaff = userRole === UserRole.STAFF || userRole === UserRole.SUPER_ADMIN;

  const loadBooklet = async (isInitial = false) => {
     const data = await storageService.getBookletById(bookletId);
     if (data) {
        setBooklet(data);
        // Only auto-set topic on initial load if not already set
        if (isInitial && !currentTopic) {
            const lastQ = data.questions[data.questions.length - 1];
            setCurrentTopic(lastQ?.topic || data.topic);
            setCurrentTerm(lastQ?.term || 'Term 1');
          initialUpdatedAt.current = data.updatedAt || null;
          setIsDirty(false);
        }
     }
  };

  // Warn on window/tab close if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    loadBooklet(true);
  }, [bookletId]);

  const groupedQuestions = useMemo(() => {
    if (!booklet) return {};
    const groups: Record<string, Question[]> = {};

    // Determine topic order by first appearance in the booklet.questions array
    const topicsOrder: string[] = [];
    for (const q of booklet.questions) {
      const t = q.topic || booklet.topic || 'General';
      if (!topicsOrder.includes(t)) topicsOrder.push(t);
    }

    // For each topic in appearance order, collect its questions and sort by `number`
    for (const t of topicsOrder) {
      const list = booklet.questions.filter(q => (q.topic || booklet.topic || 'General') === t)
        .slice()
        .sort((a, b) => (a.number || 0) - (b.number || 0));
      groups[t] = list;
    }

    return groups;
  }, [booklet]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !booklet) return;
    const files = Array.from(e.target.files) as File[];
    const activeTopic = (currentTopic || booklet.topic || '').trim();
    
    if (!activeTopic) {
      alert("Please enter a Topic name in the input field before uploading units.");
      return;
    }

    setIsProcessing(true);
    setProcessStatus(`Reading ${files.length} files...`);

    try {
      const newQuestions: Question[] = [];
      for (const file of files) {
        const base64 = await new Promise<string>((res) => {
          const r = new FileReader();
          r.readAsDataURL(file);
          r.onload = () => res(r.result as string);
        });
        
        const now = Date.now();
        newQuestions.push({
          id: crypto.randomUUID(), 
          topic: activeTopic, 
          term: currentTerm, 
          number: 0, // assigned by storage
          maxMarks: 0,
          imageUrls: [base64], 
          extractedQuestion: "AI Analyzing...", 
          generatedSolution: null,
          isProcessing: true, 
          includeImage: true,
          createdAt: now
        });
      }

      setProcessStatus(`Saving ${newQuestions.length} placeholders...`);
      await storageService.addQuestionsToBooklet(bookletId, newQuestions);
      await loadBooklet(); 
      setIsDirty(false);

      // Step 2: Solve with AI sequentially
      for (let i = 0; i < newQuestions.length; i++) {
        const q = newQuestions[i];
        setProcessStatus(`AI Solving Unit ${i + 1} of ${newQuestions.length}...`);
        const aiResp = await processImageWithGemini(q.imageUrls, i + 1, booklet.type);
        
        await storageService.updateQuestionInBooklet(bookletId, q.id, {
            extractedQuestion: aiResp.questionText,
            generatedSolution: aiResp.solutionMarkdown,
            maxMarks: aiResp.totalMarks,
            isProcessing: false
        });
        await loadBooklet();
        setIsDirty(false);
      }
    } catch (err) { 
      console.error("Upload failure:", err); 
      setProcessStatus("Upload Failed.");
    } finally {
      setIsProcessing(false);
      setProcessStatus('');
    }
  };

  const handleOptimize = async () => {
    if (!booklet || booklet.questions.length === 0) return;
    setIsProcessing(true);
    setProcessStatus('AI Agent: Optimizing Booklet Uniformity...');
    try {
      const optimized = await optimizeBookletContent(booklet.title, booklet.questions);
      for (const optQ of optimized) {
        await storageService.updateQuestionInBooklet(bookletId, optQ.id, {
          extractedQuestion: optQ.extractedQuestion,
          generatedSolution: optQ.generatedSolution,
          maxMarks: optQ.maxMarks
        });
      }
      await loadBooklet();
      setProcessStatus('Optimization Complete!');
    } catch (err) {
      console.error("Optimization failure:", err);
      setProcessStatus("Optimization Failed.");
    }
    setTimeout(() => {
      setIsProcessing(false);
      setProcessStatus('');
    }, 2000);
  };

  if (!booklet) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-30 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
              <button onClick={async () => {
                if (isDirty && booklet) {
                  const save = confirm('You have unsaved changes. Save changes before exiting? Click OK to save, Cancel to stay.');
                  if (save) {
                    setIsProcessing(true);
                    setProcessStatus('Saving booklet...');
                    try {
                      await storageService.updateBooklet(booklet);
                      setIsDirty(false);
                      setProcessStatus('Saved');
                      setTimeout(() => setProcessStatus(''), 1000);
                    } catch (e) {
                      console.error('Save failed', e);
                      setProcessStatus('Save Failed');
                      setTimeout(() => setProcessStatus(''), 2000);
                      setIsProcessing(false);
                      return;
                    }
                    setIsProcessing(false);
                  } else {
                    return;
                  }
                }
                onBack();
              }} className="p-3 bg-gray-900 text-white rounded-2xl flex items-center gap-2 pr-6 shadow-xl">
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
              <input type="text" placeholder="Topic..." className="bg-white border rounded-xl px-4 py-2 text-[11px] font-bold w-40" value={currentTopic} onChange={e => { setCurrentTopic(e.target.value); setIsDirty(true); }} />
              <label className="cursor-pointer bg-indigo-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all">
                <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
                Add Units
              </label>
              <button
                onClick={async () => {
                  if (!booklet) return;
                  setIsProcessing(true);
                  setProcessStatus('Saving booklet...');
                  try {
                    await storageService.updateBooklet(booklet);
                    setProcessStatus('Saved');
                    setTimeout(() => setProcessStatus(''), 1200);
                  } catch (e) {
                    console.error('Save failed', e);
                    setProcessStatus('Save Failed');
                    setTimeout(() => setProcessStatus(''), 2000);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                className="bg-yellow-500 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-yellow-600 transition-all"
              >
                Save Booklet
              </button>
              <button 
                onClick={handleOptimize}
                className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                AI Agent
              </button>
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
        <div className="space-y-32">
            {Object.entries(groupedQuestions).map(([topicName, questions]) => (
              <div key={topicName} className="space-y-12">
                <div className="border-b-4 border-gray-900 pb-4 mb-12">
                  <h2 className="text-4xl font-black uppercase italic tracking-tighter text-gray-900">{topicName}</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 mt-2">{questions.length} Units in this topic</p>
                </div>
                
                <div className="space-y-24">
                  {questions.map(q => (
                    <div id={`q-${q.id}`} key={q.id}>
                      <QuestionItem 
                        question={q} 
                        bookletType={booklet.type} 
                        variant="question" 
                        onDelete={async (id) => { if(confirm("Remove?")) { await storageService.removeQuestionFromBooklet(booklet.id, id); await loadBooklet(); setIsDirty(false); } }} 
                        onUpdate={async (id, updates) => { await storageService.updateQuestionInBooklet(booklet.id, id, updates); await loadBooklet(); setIsDirty(false); }}
                        isStaff={isStaff}
                        onAIFormat={async (id, field) => {
                          const q = booklet.questions.find(x => x.id === id);
                          if (!q) return;
                          setProcessStatus(`AI Agent: Formatting ${field === 'extractedQuestion' ? 'Question' : 'Solution'}...`);
                          setIsProcessing(true);
                          try {
                            const currentText = q[field] || '';
                            const formatted = await formatTextWithAI(currentText, field === 'extractedQuestion' ? 'question' : 'solution');
                            await storageService.updateQuestionInBooklet(booklet.id, id, { [field]: formatted });
                            await loadBooklet();
                          } catch (e) {
                            console.error(e);
                          }
                          setIsProcessing(false);
                          setProcessStatus('');
                        }}
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
                </div>
              </div>
            ))}
            
            {Object.keys(groupedQuestions).length === 0 && (
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
