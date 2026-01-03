
import React from 'react';
import { Booklet, BookletType } from '../types';
import { GRADE_THEMES, SUBJECT_PATTERNS } from '../constants';

interface BookletCoverProps {
  booklet: Booklet;
  onClick?: () => void;
  className?: string;
  onUpdate?: (id: string, subject: string) => void;
  isStaff?: boolean;
}

const BookletCover: React.FC<BookletCoverProps> = ({ booklet, onClick, className, onUpdate, isStaff = false }) => {
  const theme = GRADE_THEMES[booklet.grade] || GRADE_THEMES['default'];
  const bgColor = booklet.type === BookletType.WITH_SOLUTIONS ? theme.main : theme.alt;
  const pattern = SUBJECT_PATTERNS[booklet.subject] || '';

  return (
    <div 
      onClick={onClick}
      className={`relative w-full aspect-[3/4] min-h-[320px] min-w-[360px] mx-auto md:col-span-2 lg:col-span-1 xl:col-span-1 rounded-r-2xl rounded-l-sm shadow-xl overflow-hidden cursor-pointer hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 group ${className || ''}`}
      style={{ backgroundColor: '#fff' }} 
    >
      {/* Grade 12 quick subject markers */}
      {booklet.grade === 'Grade 12' && onUpdate && (
        <div style={{ position: 'absolute', right: 12, top: 12, zIndex: 60 }} className="flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); onUpdate(booklet.id, 'Physics'); }} title="Mark Physics (red)" className="w-8 h-8 rounded-full shadow-md flex items-center justify-center" style={{ backgroundColor: '#be123c', color: '#fff' }}>P</button>
          <button onClick={(e) => { e.stopPropagation(); onUpdate(booklet.id, 'Chemistry'); }} title="Mark Chemistry (black)" className="w-8 h-8 rounded-full shadow-md flex items-center justify-center" style={{ backgroundColor: '#000000', color: '#fff' }}>C</button>
        </div>
      )}
      {/* Spine effect */}
      <div className="absolute left-0 top-0 bottom-0 w-4 bg-black/10 z-30 shadow-[inset_-1px_0_2px_rgba(0,0,0,0.1)]"></div>
      
      {/* Geometric Sidebar for Cards */}
        <div className="absolute left-0 top-0 bottom-0 w-16 z-20 overflow-hidden bg-white/10 backdrop-blur-sm flex flex-col items-center py-8 gap-6">
          <div className="w-8 h-8 rotate-45 shrink-0 shadow-sm" style={{ backgroundColor: theme.main }}></div>
          <div className="w-8 h-8 rotate-45 shrink-0 shadow-sm bg-gray-900"></div>
          <div className="w-8 h-8 rotate-45 shrink-0 shadow-sm" style={{ backgroundColor: theme.alt }}></div>
          <div className="w-8 h-8 rotate-45 shrink-0 shadow-sm bg-gray-400 opacity-20"></div>
          <div className="w-8 h-8 rotate-45 shrink-0 shadow-sm" style={{ backgroundColor: theme.main }}></div>
          <div className="w-8 h-8 rotate-45 shrink-0 shadow-sm bg-gray-900"></div>
        </div>

      {/* Background with Theme Color and Pattern */}
      <div 
        className="absolute inset-0 z-0 transition-colors duration-500" 
        style={{ backgroundColor: bgColor }}
      ></div>
      
      <div 
        className="absolute inset-0 z-10 opacity-20 mix-blend-overlay" 
          style={{ backgroundImage: pattern, backgroundSize: '28px 28px' }}
      ></div>

      {/* Content Area */}
        <div className="absolute inset-0 z-20 p-8 flex flex-col justify-between text-white pl-20">
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] font-black tracking-widest uppercase bg-white/20 px-3 py-1.5 rounded backdrop-blur-md border border-white/20">
              {booklet.grade}
            </span>
            {!booklet.isPublished && isStaff && (
              <span className="text-[9px] font-black tracking-widest uppercase bg-red-500/90 px-2 py-1 rounded shadow-lg">Draft</span>
            )}
          </div>
          <h2 className="text-2xl md:text-3xl font-black leading-[1.05] tracking-tighter uppercase italic line-clamp-4 drop-shadow-lg">
            {booklet.title}
          </h2>
          
          <div className="mt-4">
            {(() => {
              const subj = (booklet.subject || '').toString();
              let badgeBg = 'rgba(0,0,0,0.3)';
              let textColor = '#ffffff';
              if (booklet.grade === 'Grade 12') {
                if (subj.toLowerCase().includes('physics')) {
                  badgeBg = theme.main; // red for physics
                  textColor = '#ffffff';
                } else if (subj.toLowerCase().includes('chemistry')) {
                  badgeBg = '#000000'; // black for chemistry
                  textColor = '#ffffff';
                }
              }
              return (
                <span style={{ backgroundColor: badgeBg, color: textColor }} className="text-[12px] md:text-[13px] font-black uppercase tracking-widest px-4 py-2 rounded-lg backdrop-blur-sm inline-block">
                  {booklet.subject || 'General'}
                </span>
              );
            })()}
          </div>
        </div>

        <div className="space-y-4">
           <div className="bg-white/10 backdrop-blur-xl p-3 rounded-2xl border border-white/10 shadow-inner">
              <h3 className="font-serif text-[11px] font-bold tracking-tight opacity-90 italic">Academic Series</h3>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[8px] uppercase tracking-[0.4em] font-black opacity-60">PCL ASSET</p>
                <div className="h-0.5 w-8 bg-white/30 rounded-full"></div>
              </div>
           </div>

           <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/90">
                <span className="truncate max-w-[100px]">{booklet.compiler}</span>
                <span className="shrink-0">{booklet.questions.length} Units</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default BookletCover;
