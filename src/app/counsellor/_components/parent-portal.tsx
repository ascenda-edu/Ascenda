'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Send, Check, CheckCheck, MessageSquare, Clock, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ParentContact, ParentMessage } from '@/lib/counsellor/types';

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'text-sky-600', bg: 'bg-sky-500/10', dot: 'bg-sky-500' },
  'needs-response': { label: 'Needs response', color: 'text-amber-600', bg: 'bg-amber-500/10', dot: 'bg-amber-500' },
  resolved: { label: 'Resolved', color: 'text-emerald-600', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500' },
} as const;

const TEMPLATES = [
  { id: 'deadline_reminder', label: 'Deadline Reminder', content: 'I wanted to remind you that an important deadline is approaching for [student]. Please ensure all required materials are submitted on time.' },
  { id: 'progress_update', label: 'Progress Update', content: 'I\'m writing to update you on [student]\'s application progress. Everything is on track and we\'re moving forward as planned.' },
  { id: 'meeting_request', label: 'Meeting Request', content: 'I\'d like to schedule a meeting to discuss [student]\'s university options and next steps. Would you be available this week?' },
];

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const fullDateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

interface ParentPortalProps {
  contacts: ParentContact[];
  messagesByContact: Record<string, ParentMessage[]>;
}

export function ParentPortal({ contacts, messagesByContact }: ParentPortalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(contacts[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [composeText, setComposeText] = useState('');
  const [localMessages, setLocalMessages] = useState<ParentMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const filteredContacts = useMemo(
    () => contacts.filter((c) => !search || c.parentName.toLowerCase().includes(search.toLowerCase()) || c.studentName.toLowerCase().includes(search.toLowerCase())),
    [contacts, search]
  );

  const selectedContact = contacts.find((c) => c.id === selectedId);

  const messages = useMemo(() => {
    if (!selectedId) return [];
    const stored = messagesByContact[selectedId] ?? [];
    const local = localMessages.filter((m) => m.parentContactId === selectedId);
    return [...stored, ...local].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedId, localMessages, messagesByContact]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const body = composeText.trim();
    if (!body || !selectedId || !selectedContact) return;
    const optimistic: ParentMessage = {
      id: `pm-local-${Date.now()}`,
      parentContactId: selectedId,
      studentId: selectedContact.studentId,
      sender: 'counsellor',
      content: body,
      date: new Date().toISOString(),
      read: false,
      template: null,
    };
    setLocalMessages((prev) => [...prev, optimistic]);
    setComposeText('');

    try {
      const res = await fetch('/api/counsellor/parent-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: selectedId, body }),
      });
      if (res.ok) {
        const { message } = await res.json();
        setLocalMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? { ...message, studentId: selectedContact.studentId } : m))
        );
      } else {
        setLocalMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      }
    } catch {
      setLocalMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
  };

  const applyTemplate = (template: typeof TEMPLATES[number]) => {
    const name = selectedContact?.studentName ?? 'the student';
    setComposeText(template.content.replace('[student]', name));
  };

  const needsResponse = contacts.filter((c) => c.status === 'needs-response').length;

  return (
    <div className="grid gap-0 lg:grid-cols-[320px,1fr] min-h-[480px] sm:min-h-[560px] lg:h-[650px] overflow-hidden rounded-2xl border border-border bg-card">
      {/* Left: Contact directory */}
      <div className="border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search parent or student..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {needsResponse > 0 && (
            <p className="mt-2 text-[10px] text-amber-600 font-semibold">{needsResponse} awaiting your response</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredContacts.map((contact) => {
            const statusCfg = STATUS_CONFIG[contact.status];
            const isSelected = selectedId === contact.id;
            return (
              <button
                key={contact.id}
                onClick={() => setSelectedId(contact.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border/50 transition-colors',
                  isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn('h-2 w-2 rounded-full shrink-0', statusCfg.dot)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{contact.flagEmoji}</span>
                      <span className="text-sm font-semibold text-foreground truncate">{contact.parentName}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{contact.relationship} of {contact.studentName}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{dateFormatter.format(new Date(contact.lastContacted))}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Message thread */}
      <div className="flex flex-col">
        {selectedContact ? (
          <>
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{selectedContact.parentName}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedContact.relationship} of {selectedContact.flagEmoji} {selectedContact.studentName}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span
                  className="inline-flex max-w-[220px] items-center gap-1 truncate"
                  title={selectedContact.email}
                >
                  <Mail className="h-3 w-3 shrink-0" /> {selectedContact.email}
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_CONFIG[selectedContact.status].bg, STATUS_CONFIG[selectedContact.status].color)}>
                  {STATUS_CONFIG[selectedContact.status].label}
                </span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => {
                const isCounsellor = msg.sender === 'counsellor';
                return (
                  <div key={msg.id} className={cn('flex', isCounsellor ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm',
                      isCounsellor
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted text-foreground rounded-bl-md'
                    )}>
                      <p>{msg.content}</p>
                      <div className={cn('flex items-center gap-1 mt-1', isCounsellor ? 'justify-end' : 'justify-start')}>
                        <span className={cn('text-[10px]', isCounsellor ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                          {fullDateFormatter.format(new Date(msg.date))}
                        </span>
                        {isCounsellor && msg.read && <CheckCheck className="h-3 w-3 text-primary-foreground/60" />}
                        {msg.template && (
                          <span className={cn('rounded px-1 text-[8px] font-semibold', isCounsellor ? 'bg-primary-foreground/10 text-primary-foreground/60' : 'bg-muted-foreground/10 text-muted-foreground')}>
                            template
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick templates */}
            <div className="px-4 py-2 border-t border-border/50 flex gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="rounded-full bg-muted/50 px-3 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Compose */}
            <div className="p-3 border-t border-border flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                className="flex-1 rounded-xl border border-border bg-background px-4 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleSend}
                disabled={!composeText.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            <div className="text-center space-y-2">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p>Select a parent to view messages</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
