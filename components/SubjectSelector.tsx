import React, { useEffect, useState } from 'react';
import * as storageService from '../services/storageService';
import { User } from '../types';

interface Props {
  user: User;
  onSaved?: () => void;
}

const SubjectSelector: React.FC<Props> = ({ user, onSaved }) => {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const booklets = await storageService.getBooklets();
      const uniq = Array.from(new Set((booklets || []).map(b => (b.subject || 'General').toString()).filter(Boolean))).sort();
      setSubjects(uniq);
      const existing = await storageService.getStudentSubjects(user.id);
      const sel: Record<string, boolean> = {};
      for (const s of uniq) sel[s] = existing.includes(s);
      setSelected(sel);
      setLoading(false);
    };
    load();
  }, [user.id]);

  const toggle = (s: string) => setSelected(prev => ({ ...prev, [s]: !prev[s] }));

  const handleSave = async () => {
    const pick = Object.keys(selected).filter(k => selected[k]);
    await storageService.saveStudentSubjects(user.id, pick);
    if (onSaved) onSaved();
  };

  if (loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="bg-white w-full max-w-2xl rounded-2xl p-8">
        <h3 className="text-xl font-black uppercase mb-4">Choose your subjects</h3>
        <p className="text-sm text-gray-500 mb-6">Select the subjects you're studying. We'll notify you when new booklets for these subjects are added.</p>
        <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto mb-6">
          {subjects.map(s => (
            <label key={s} className="flex items-center gap-3 p-3 rounded-lg border">
              <input type="checkbox" checked={!!selected[s]} onChange={() => toggle(s)} />
              <span className="font-bold">{s}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-black">Save</button>
        </div>
      </div>
    </div>
  );
};

export default SubjectSelector;
