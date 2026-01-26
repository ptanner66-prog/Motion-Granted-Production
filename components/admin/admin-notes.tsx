'use client';

/**
 * Admin Notes System (Task 72)
 *
 * Internal notes system for orders.
 *
 * Features:
 * - Add notes to any order
 * - Notes visible only to admins
 * - Timestamp and author on each note
 * - Pin important notes
 * - Search notes
 *
 * Source: Chunk 10, Task 72 - P2 Pre-Launch
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  MessageSquare,
  Pin,
  PinOff,
  Trash2,
  Send,
  Search,
  Clock,
  User,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface AdminNote {
  id: string;
  orderId: string;
  authorId: string;
  authorName: string;
  content: string;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminNotesPanelProps {
  orderId: string;
}

interface AdminNoteRow {
  id: string;
  order_id: string;
  note: string;
  created_by: string;
  pinned: boolean | null;
  created_at: string;
  updated_at: string | null;
  profiles: { full_name: string } | null;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

export async function addNote(
  orderId: string,
  content: string
): Promise<AdminNote | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Get user profile for author name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const { data, error } = await supabase
    .from('order_notes')
    .insert({
      order_id: orderId,
      note: content,
      created_by: user.id,
      is_internal: true,
      pinned: false,
    })
    .select()
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    orderId: data.order_id,
    authorId: data.created_by,
    authorName: profile?.full_name || 'Admin',
    content: data.note,
    pinned: data.pinned || false,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at || data.created_at),
  };
}

export async function updateNote(
  noteId: string,
  content: string
): Promise<AdminNote | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('order_notes')
    .update({
      note: content,
      updated_at: new Date().toISOString(),
    })
    .eq('id', noteId)
    .select()
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    orderId: data.order_id,
    authorId: data.created_by,
    authorName: 'Admin',
    content: data.note,
    pinned: data.pinned || false,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at || data.created_at),
  };
}

export async function deleteNote(noteId: string): Promise<boolean> {
  const supabase = createClient();

  const { error } = await supabase
    .from('order_notes')
    .delete()
    .eq('id', noteId);

  return !error;
}

export async function togglePinNote(noteId: string): Promise<AdminNote | null> {
  const supabase = createClient();

  // Get current state
  const { data: current } = await supabase
    .from('order_notes')
    .select('pinned')
    .eq('id', noteId)
    .single();

  if (!current) return null;

  const { data, error } = await supabase
    .from('order_notes')
    .update({
      pinned: !current.pinned,
      updated_at: new Date().toISOString(),
    })
    .eq('id', noteId)
    .select()
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    orderId: data.order_id,
    authorId: data.created_by,
    authorName: 'Admin',
    content: data.note,
    pinned: data.pinned || false,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at || data.created_at),
  };
}

export async function getNotesForOrder(orderId: string): Promise<AdminNote[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('order_notes')
    .select(`
      id,
      order_id,
      note,
      created_by,
      pinned,
      created_at,
      updated_at,
      profiles:created_by (
        full_name
      )
    `)
    .eq('order_id', orderId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row: AdminNoteRow) => ({
    id: row.id,
    orderId: row.order_id,
    authorId: row.created_by,
    authorName: row.profiles?.full_name || 'Admin',
    content: row.note,
    pinned: row.pinned || false,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at || row.created_at),
  }));
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AdminNotesPanel({ orderId }: AdminNotesPanelProps) {
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch notes
  const fetchNotes = useCallback(async () => {
    setLoading(true);
    const fetchedNotes = await getNotesForOrder(orderId);
    setNotes(fetchedNotes);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Handle add note
  const handleAddNote = async () => {
    if (!newNote.trim() || submitting) return;

    setSubmitting(true);
    const note = await addNote(orderId, newNote.trim());

    if (note) {
      setNotes((prev) => [note, ...prev]);
      setNewNote('');
    }

    setSubmitting(false);
  };

  // Handle delete
  const handleDelete = async (noteId: string) => {
    if (!confirm('Delete this note?')) return;

    const success = await deleteNote(noteId);
    if (success) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    }
  };

  // Handle pin toggle
  const handleTogglePin = async (noteId: string) => {
    const updated = await togglePinNote(noteId);
    if (updated) {
      setNotes((prev) =>
        prev
          .map((n) => (n.id === noteId ? updated : n))
          .sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return b.createdAt.getTime() - a.createdAt.getTime();
          })
      );
    }
  };

  // Filter notes by search
  const filteredNotes = searchQuery
    ? notes.filter((n) =>
        n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.authorName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : notes;

  // Format date
  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white rounded-lg border shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900">Internal Notes</h3>
          <span className="text-sm text-gray-500">({notes.length})</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="pl-8 pr-3 py-1.5 text-sm border rounded-md w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Add new note */}
      <div className="px-4 py-3 border-b bg-gray-50">
        <div className="flex gap-2">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            className="flex-1 px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleAddNote();
              }
            }}
          />
          <button
            onClick={handleAddNote}
            disabled={!newNote.trim() || submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Press Cmd+Enter to submit</p>
      </div>

      {/* Notes list */}
      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-8 text-center text-gray-500">
            Loading notes...
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">
            {searchQuery ? 'No notes match your search' : 'No notes yet'}
          </div>
        ) : (
          filteredNotes.map((note) => (
            <div
              key={note.id}
              className={`px-4 py-3 hover:bg-gray-50 ${
                note.pinned ? 'bg-yellow-50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {note.pinned && (
                      <Pin className="w-3 h-3 text-yellow-600" />
                    )}
                    <span className="text-sm font-medium text-gray-900">
                      {note.authorName}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(note.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {note.content}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleTogglePin(note.id)}
                    className="p-1 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded"
                    title={note.pinned ? 'Unpin' : 'Pin'}
                  >
                    {note.pinned ? (
                      <PinOff className="w-4 h-4" />
                    ) : (
                      <Pin className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AdminNotesPanel;
