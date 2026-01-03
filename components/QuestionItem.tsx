
import React, { useState, useCallback } from 'react';
import { Question, BookletType, Difficulty } from '../types';
import MarkdownDisplay from './MarkdownDisplay';

interface QuestionItemProps {
  question: Question;
  bookletType: BookletType;
  variant: 'question' | 'solution'; 
  isFirstInList?: boolean; 
   onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Question>) => void;
  onScrollTo?: (id: string) => void;
  onRegenerate?: () => void;
   isStaff?: boolean;
}

const QuestionItem: React.FC<QuestionItemProps> = ({ 
  question, 
  bookletType, 
  variant, 
  onDelete, 
  onUpdate,
  onRegenerate
   , isStaff = false
}) => {
  const [isEditingSolution, setIsEditingSolution] = useState(false);
  const [editA, setEditA] = useState(question.generatedSolution || '');
  const [markingRows, setMarkingRows] = useState<{ step: string, marks: string }[]>([{ step: '', marks: '' }]);
  const [showSheetPreview, setShowSheetPreview] = useState(false);

  const handleSaveSolution = () => {
    onUpdate(question.id, { generatedSolution: editA });
    setIsEditingSolution(false);
  };

  const addRow = () => setMarkingRows([...markingRows, { step: '', marks: '' }]);
  
  const injectTable = () => {
    let table = "\n\n| Marking Step | Allocation |\n| :--- | :--- |\n";
    markingRows.forEach(row => {
      if (row.step || row.marks) table += `| ${row.step} | ${row.marks} |\n`;
    });
    setEditA(prev => prev + table);
    setMarkingRows([{ step: '', marks: '' }]);
    setShowSheetPreview(true);
  };

  if (variant === 'question') {
    return (
      <div id={`question-${question.id}`} className="mb-24 grid grid-cols-1 lg:grid-cols-2 gap-12 group/q print:block">
        {/* BLOCK A: THE RESOURCE */}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <span className="bg-gray-900 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xs shadow-lg">Q{question.number}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 italic">{question.topic}</span>
            </div>
                  {isStaff && (
                     <div className="flex gap-2 print:hidden opacity-0 group-hover/q:opacity-100 transition-opacity">
                        <button onClick={() => onDelete(question.id)} className="text-gray-300 hover:text-red-500 p-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                     </div>
                  )}
          </div>
          <div className="bg-white rounded-[2.5rem] overflow-hidden border border-gray-100 shadow-xl">
             {question.imageUrls.map((url, idx) => (
                <img key={idx} src={url} alt="Resource" className="w-full h-auto object-contain" />
             ))}
          </div>
          <div className="bg-gray-50/80 p-10 rounded-3xl border border-gray-100 shadow-inner">
             {question.isProcessing ? (
                 <div className="flex items-center gap-4 animate-pulse">
                     <div className="w-4 h-4 bg-indigo-500 rounded-full animate-bounce"></div>
                     <span className="text-xs font-black uppercase tracking-widest text-indigo-500">AI Analysing Text & Solving...</span>
                 </div>
             ) : (
                <MarkdownDisplay content={question.extractedQuestion} className="text-sm leading-relaxed" />
             )}
          </div>
        </div>

        {/* BLOCK B: THE MEMORANDUM */}
        {bookletType === BookletType.WITH_SOLUTIONS && (
          <div className="bg-white rounded-[3rem] p-10 border-4 border-indigo-50 shadow-2xl flex flex-col print:hidden">
             <div className="flex justify-between items-center mb-8">
                <div>
                   <h4 className="text-lg font-black uppercase tracking-tighter italic leading-none">Memorandum Block</h4>
                   <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-widest">Q{question.number} Solution Data</p>
                </div>
                <div className="flex gap-2">
                   {isEditingSolution ? (
                      <button onClick={handleSaveSolution} className="bg-indigo-600 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all">Done Editing</button>
                   ) : (
                      <>
                        {onRegenerate && (
                             <button onClick={onRegenerate} title="Regenerate with AI" className="p-4 bg-gray-50 text-indigo-600 rounded-2xl hover:bg-indigo-100 hover:text-indigo-700 transition-all shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                             </button>
                        )}
                        <button onClick={() => setIsEditingSolution(true)} className="p-4 bg-gray-50 text-indigo-600 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                      </>
                   )}
                </div>
             </div>

             <div className="flex-1 overflow-y-auto">
                {isEditingSolution ? (
                   <div className="space-y-8">
                      <div className="flex gap-4">
                         <button onClick={() => setShowSheetPreview(false)} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${!showSheetPreview ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>Editor Mode</button>
                         <button onClick={() => setShowSheetPreview(true)} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${showSheetPreview ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>Live Preview</button>
                      </div>

                      {showSheetPreview ? (
                        <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100 min-h-[300px]">
                            <MarkdownDisplay content={editA || "_No content drafted yet._"} />
                        </div>
                      ) : (
                        <textarea 
                          value={editA} 
                          onChange={e => setEditA(e.target.value)} 
                          placeholder="Draft marking steps or notes..."
                          className="w-full h-[300px] p-8 bg-gray-50 border-2 border-gray-100 rounded-3xl font-mono text-sm outline-none focus:border-indigo-500 transition-all resize-none shadow-inner"
                        />
                      )}
                      
                      {/* SHEET ASSISTANT */}
                      <div className="bg-indigo-50/40 p-8 rounded-3xl border border-indigo-100">
                         <div className="flex justify-between items-center mb-6">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 italic">Sheet-Style Marking Assistant</p>
                            <button onClick={addRow} className="p-2 bg-indigo-600 text-white rounded-lg shadow-md hover:scale-110 transition-transform"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
                         </div>
                         <div className="space-y-3 mb-6">
                            {markingRows.map((row, i) => (
                               <div key={i} className="flex gap-3">
                                  <input 
                                    placeholder="Step description (e.g. Factorization)" 
                                    className="flex-1 p-3 border-2 border-white rounded-xl text-xs font-bold shadow-sm focus:border-indigo-300 outline-none" 
                                    value={row.step} 
                                    onChange={e => {
                                      const n = [...markingRows]; n[i].step = e.target.value; setMarkingRows(n);
                                    }} 
                                  />
                                  <input 
                                    placeholder="Marks" 
                                    className="w-20 p-3 border-2 border-white rounded-xl text-xs font-black text-center shadow-sm focus:border-indigo-300 outline-none" 
                                    value={row.marks} 
                                    onChange={e => {
                                      const n = [...markingRows]; n[i].marks = e.target.value; setMarkingRows(n);
                                    }} 
                                  />
                               </div>
                            ))}
                         </div>
                         <button onClick={injectTable} className="w-full py-4 bg-white border-2 border-indigo-100 text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-indigo-600 hover:text-white transition-all">Compile into Memo Block</button>
                      </div>
                   </div>
                ) : (
                   <div className="prose prose-sm max-w-none pt-4">
                      {question.isProcessing ? (
                         <div className="p-10 text-center animate-pulse">
                            <p className="text-4xl font-black text-gray-200 uppercase italic">Computing...</p>
                            <p className="text-[10px] font-black text-indigo-400 mt-4 uppercase tracking-widest">Generative AI is solving this problem.</p>
                         </div>
                      ) : (
                         <MarkdownDisplay content={question.generatedSolution || "_Draft memorandum required._"} />
                      )}
                   </div>
                )}
             </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default React.memo(QuestionItem);
