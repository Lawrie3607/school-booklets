import React, { useEffect, useState } from 'react';
import { Notification } from '../types';
import * as storage from '../services/storageService';
import { User } from '../types';

interface Props {
  currentUser: User;
  onOpenAssignment: (id: string) => void;
}

const NotificationCenter = ({ currentUser, onOpenAssignment }: Props) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);

  const load = async () => {
    try {
      const n = await storage.getNotificationsForUser(currentUser.id);
      setItems(n || []);
    } catch (e) {
      console.warn('Failed to load notifications', e);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    load();
    const handler = (ev: any) => load();
    window.addEventListener('notification:changed', handler as EventListener);
    return () => window.removeEventListener('notification:changed', handler as EventListener);
  }, [currentUser]);

  const handleOpen = async (n: Notification) => {
    // mark read and possibly open assignment
    try { await storage.markNotificationRead(n.id); } catch (_) {}
    if (n.data && n.data.assignmentId) {
      onOpenAssignment(n.data.assignmentId as string);
      try { await storage.archiveNotification(n.id); } catch(_) {}
      setOpen(false);
    }
    load();
  };

  return (
    <div>
      <div style={{ position: 'fixed', right: 18, top: 18, zIndex: 9999 }}>
        <button onClick={() => { setOpen(v => !v); load(); }} className="px-3 py-2 bg-yellow-400 text-black rounded-xl shadow font-bold text-xs">
          Notifications ({items.length})
        </button>
      </div>

      {open && (
        <div style={{ position: 'fixed', right: 18, top: 60, zIndex: 10000, width: 360 }}>
          <div className="bg-white shadow-lg rounded-lg p-3 border">
            <div className="font-bold mb-2">Notifications</div>
            {items.length === 0 && <div className="text-sm text-gray-600">No notifications</div>}
            <div className="space-y-2 max-h-72 overflow-auto">
              {items.map(n => (
                <div key={n.id} className="p-2 border rounded hover:bg-gray-50 cursor-pointer" onClick={() => handleOpen(n)}>
                  <div className="font-semibold">{n.title}</div>
                  {n.body && <div className="text-sm text-gray-600">{n.body}</div>}
                  <div className="text-xs text-gray-400">{new Date(n.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right">
              <button onClick={() => { setOpen(false); }} className="text-sm underline">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
