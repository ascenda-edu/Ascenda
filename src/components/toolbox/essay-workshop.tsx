'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import {
  ChevronDown, Bold, Italic, List, ListOrdered, Undo, Redo,
  GripVertical, RotateCcw, Copy, Check, PenTool, ArrowLeft,
  Users, ChevronRight,
  FileText, Sparkles, PanelRightOpen, PanelRightClose, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { stagger, childFade } from '@/lib/motion';
import type { EssayBuildingBlock, EssayPrompt, BlockCategory, ActivityEntry } from '@/lib/data/student-demo-data';
import { EssayAIPanel } from './essay-ai-panel';
import { CATEGORY_CONFIG, CATEGORY_ORDER } from '@/lib/config/toolbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/* ─── Config ─────────────────────────────────────────────────────────────── */

const PLATFORMS = ['UCAS', 'Common App', 'UC PIQs', 'Custom'] as const;
type Platform = (typeof PLATFORMS)[number];
const PLATFORM_LIMITS: Record<Platform, { unit: 'characters' | 'words'; max: number; tip: string }> = {
  'UCAS': { unit: 'characters', max: 4000, tip: 'Characters incl. spaces' },
  'Common App': { unit: 'words', max: 650, tip: 'Sweet spot: 600–650' },
  'UC PIQs': { unit: 'words', max: 350, tip: 'Strict 350 word limit' },
  'Custom': { unit: 'words', max: 1000, tip: 'Your own target' },
};

/* ─── Component ──────────────────────────────────────────────────────────── */

interface EssayWorkshopProps {
  blocks: EssayBuildingBlock[];
  prompts: EssayPrompt[];
  activities?: ActivityEntry[];
}

export function EssayWorkshop({ blocks, prompts, activities = [] }: EssayWorkshopProps) {
  const [platform, setPlatform] = useState<Platform>('UCAS');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<BlockCategory>>(new Set());
  const [showActivities, setShowActivities] = useState(false);
  const [showAI, setShowAI] = useState(true);
  const [leftTab, setLeftTab] = useState<'blocks' | 'prompts'>('blocks');
  const [confirmClear, setConfirmClear] = useState(false);

  const limit = PLATFORM_LIMITS[platform];

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: `Start writing your ${platform} essay…` }),
      // Count only — no hard `limit`. Platform limits are advisory (see onUpdate
      // + the over-limit status bar); a hard limit silently swallowed input on
      // non-UCAS platforms whose word target maps to far more than 4000 chars.
      CharacterCount,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-full px-8 py-6 text-foreground text-[0.9375rem] leading-[1.8]',
      },
    },
    onUpdate: ({ editor }) => {
      // Word limits are advisory: content is never rejected or undone (that
      // silently destroyed pastes). The over-limit state is surfaced in the
      // count + status bar instead.
      setDrafts((prev) => ({ ...prev, [platform]: editor.getText() }));
    },
  });

  const editorText = editor?.getText() ?? '';
  const wordCount = editorText.trim().split(/\s+/).filter(Boolean).length;
  const charCount = editorText.length;
  const current = limit.unit === 'words' ? wordCount : charCount;
  const ratio = limit.max > 0 ? current / limit.max : 0;
  const overBy = Math.max(0, current - limit.max);

  const filteredPrompts = useMemo(
    () => prompts.filter((p) => p.platform === platform || platform === 'Custom'),
    [prompts, platform]
  );

  // Persist drafts
  useEffect(() => { try { const s = localStorage.getItem('ascenda-essay-drafts'); if (s) setDrafts(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { if (Object.keys(drafts).length > 0) localStorage.setItem('ascenda-essay-drafts', JSON.stringify(drafts)); }, [drafts]);
  useEffect(() => {
    if (!editor) return;
    const t = drafts[platform] ?? '';
    if (t !== editor.getText()) {
      const paragraphs = t.split(/\n\n+/).filter(Boolean);
      const html = paragraphs.length > 0
        ? paragraphs.map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
        : '';
      editor.commands.setContent(html);
    }
  }, [platform, editor, drafts]);

  // Keep the empty-editor placeholder in step with the active platform. The
  // Placeholder extension is configured once at editor creation, so we mutate
  // its option and dispatch an empty transaction to force ProseMirror to
  // recompute the placeholder decoration.
  useEffect(() => {
    if (!editor) return;
    const placeholderExt = editor.extensionManager.extensions.find((e) => e.name === 'placeholder');
    if (!placeholderExt) return;
    placeholderExt.options.placeholder = `Start writing your ${platform} essay…`;
    editor.view.dispatch(editor.state.tr);
  }, [platform, editor]);

  const toggleBlock = (id: string) => { setSelectedBlocks((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const insertBlock = useCallback((block: EssayBuildingBlock) => { if (!editor) return; editor.chain().focus().insertContent(`<p><em>[${block.label}]</em> ${block.detail || block.label}</p>`).run(); setSelectedBlocks((prev) => new Set(prev).add(block.id)); }, [editor]);
  const toggleCat = (cat: BlockCategory) => { setCollapsedCats((prev) => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; }); };
  const handleCopy = () => { navigator.clipboard.writeText(editorText); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const handleClear = () => setConfirmClear(true);
  const confirmClearEssay = () => {
    editor?.commands.clearContent();
    setDrafts((prev) => ({ ...prev, [platform]: '' }));
    setConfirmClear(false);
  };
  const handleDownload = () => {
    const blob = new Blob([editorText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `essay-${platform.toLowerCase().replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {/* Mobile notice — essay workshop is desktop-optimised */}
      <div className="flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-200/50 px-4 py-2 text-xs font-medium text-amber-700 lg:hidden">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        Essay Workshop works best on a larger screen. You can still read and edit below.
      </div>
      {/* ── Top chrome ──────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-border/60 px-4 h-12 shrink-0 bg-card/80 backdrop-blur-sm">
        <Link href="/toolbox" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-xs font-medium hidden sm:inline">Toolbox</span>
        </Link>

        <div className="w-px h-5 bg-border/50" />

        <div className="flex items-center gap-1">
          <PenTool className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Essay Workshop</span>
        </div>

        {/* Platform switcher */}
        <div className="flex gap-0.5 bg-muted/40 p-0.5 rounded-lg ml-4">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={cn(
                'rounded-md px-3 py-1 text-[0.6875rem] font-semibold transition-[color,background-color,box-shadow]',
                platform === p ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >{p}</button>
          ))}
        </div>

        <span className="text-[0.625rem] text-muted-foreground/60 hidden md:inline">{limit.tip}</span>

        <div className="ml-auto flex items-center gap-3">
          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="relative h-7 w-7">
              <svg className="h-7 w-7 -rotate-90" viewBox="0 0 28 28">
                <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/20" />
                <circle cx="14" cy="14" r="11" fill="none" strokeWidth="2" strokeLinecap="round"
                  strokeDasharray={`${Math.min(ratio, 1) * 69.12} 69.12`}
                  className={cn('transition-all duration-500', ratio < 0.8 ? 'stroke-emerald-500' : ratio < 0.95 ? 'stroke-amber-500' : 'stroke-rose-500')}
                />
              </svg>
            </div>
            <span className={cn('text-xs font-semibold tabular-nums', ratio < 0.8 ? 'text-emerald-600' : ratio < 0.95 ? 'text-amber-600' : 'text-rose-600')}>
              {current.toLocaleString()}/{limit.max.toLocaleString()}
            </span>
            <span className="text-[0.625rem] text-muted-foreground hidden sm:inline">{limit.unit}</span>
          </div>

          <div className="w-px h-5 bg-border/50" />

          {/* AI toggle */}
          <button
            onClick={() => setShowAI(!showAI)}
            aria-expanded={showAI}
            aria-label={showAI ? 'Hide AI panel' : 'Show AI panel'}
            className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
              showAI ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')}
          >
            {showAI ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            <Sparkles className="h-3 w-3" />
            <span className="hidden sm:inline">AI</span>
          </button>
        </div>
      </header>

      {/* ── Main workspace ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
        <aside className="w-64 xl:w-72 border-r border-border/50 flex flex-col bg-card/50 shrink-0 hidden lg:flex">
          {/* Tab switcher */}
          <div className="flex border-b border-border/50">
            <button onClick={() => setLeftTab('blocks')} className={cn('flex-1 px-3 py-2.5 text-[0.6875rem] font-semibold transition-colors', leftTab === 'blocks' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground')}>
              Blocks ({blocks.length})
            </button>
            <button onClick={() => setLeftTab('prompts')} className={cn('flex-1 px-3 py-2.5 text-[0.6875rem] font-semibold transition-colors', leftTab === 'prompts' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground')}>
              Prompts ({filteredPrompts.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
            {leftTab === 'blocks' && (
              <div className="space-y-3">
                {CATEGORY_ORDER.map((cat) => {
                  const catBlocks = blocks.filter((b) => b.category === cat);
                  if (catBlocks.length === 0) return null;
                  const cfg = CATEGORY_CONFIG[cat];
                  const CatIcon = cfg.icon;
                  const isCollapsed = collapsedCats.has(cat);
                  return (
                    <div key={cat}>
                      <button onClick={() => toggleCat(cat)} className="flex items-center gap-1.5 w-full text-left mb-1 group">
                        <div className={cn('flex h-5 w-5 items-center justify-center rounded-md', cfg.bg)}><CatIcon className={cn('h-3 w-3', cfg.color)} /></div>
                        <span className={cn('text-[0.6875rem] font-semibold flex-1', cfg.color)}>{cfg.label}</span>
                        <span className="text-[0.625rem] text-muted-foreground/50">{catBlocks.length}</span>
                        <ChevronDown className={cn('h-3 w-3 text-muted-foreground/40 transition-transform', isCollapsed && '-rotate-90')} />
                      </button>
                      <AnimatePresence initial={false}>
                        {!isCollapsed && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <motion.div className="space-y-0.5 pb-2" variants={stagger} initial="hidden" animate="show">
                              {catBlocks.map((block) => {
                                const isSel = selectedBlocks.has(block.id);
                                return (
                                  <motion.div key={block.id} variants={childFade} className="group/b">
                                    <button
                                      onClick={() => toggleBlock(block.id)}
                                      onDoubleClick={() => insertBlock(block)}
                                      draggable onDragStart={() => setDraggedBlock(block.id)} onDragEnd={() => setDraggedBlock(null)}
                                      className={cn('w-full text-left rounded-lg px-2.5 py-1.5 text-[0.75rem] transition-[color,background-color,box-shadow,opacity]', isSel ? 'bg-primary/5 ring-1 ring-primary/15' : 'hover:bg-muted/40', draggedBlock === block.id && 'opacity-40 select-none')}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <GripVertical className="h-3 w-3 text-muted-foreground/20 opacity-0 group-hover/b:opacity-100 transition-opacity shrink-0" />
                                        <span className="font-medium text-foreground flex-1 truncate">{block.label}</span>
                                        {isSel && <Check className="h-3 w-3 text-primary shrink-0" />}
                                      </div>
                                      {isSel && block.detail && (
                                        <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-1 text-[0.6875rem] text-muted-foreground leading-relaxed pl-[18px] overflow-hidden">{block.detail}</motion.p>
                                      )}
                                    </button>
                                  </motion.div>
                                );
                              })}
                            </motion.div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {/* Activities */}
                {activities.length > 0 && (
                  <div>
                    <button onClick={() => setShowActivities(!showActivities)} className="flex items-center gap-1.5 w-full text-left mb-1">
                      <div className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-500/10"><Users className="h-3 w-3 text-sky-600" /></div>
                      <span className="text-[0.6875rem] font-semibold flex-1 text-sky-600">Activities</span>
                      <span className="text-[0.625rem] text-muted-foreground/50">{activities.length}</span>
                      <ChevronDown className={cn('h-3 w-3 text-muted-foreground/40 transition-transform', !showActivities && '-rotate-90')} />
                    </button>
                    <AnimatePresence initial={false}>
                      {showActivities && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="space-y-0.5 pb-2">
                            {activities.map((act) => (
                              <button key={act.id} onClick={() => { if (!editor) return; editor.chain().focus().insertContent(`<p><em>[${act.name}]</em> ${act.role} at ${act.organization} — ${act.description}</p>`).run(); }}
                                className="w-full text-left rounded-lg px-2.5 py-1.5 text-[0.75rem] hover:bg-muted/40 transition-colors group/act">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-foreground flex-1 truncate">{act.name}</span>
                                  <ChevronRight className="h-3 w-3 text-muted-foreground/20 group-hover/act:text-sky-500 transition-colors shrink-0" />
                                </div>
                                <p className="text-[0.625rem] text-muted-foreground truncate">{act.role} · {act.organization}</p>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            )}

            {leftTab === 'prompts' && (
              <div className="space-y-2">
                {filteredPrompts.length === 0 ? (
                  <p className="text-[0.6875rem] text-muted-foreground/60 py-4 text-center">No prompts for {platform} yet.</p>
                ) : filteredPrompts.map((prompt) => (
                  <button key={prompt.id} onClick={() => setExpandedPrompt(expandedPrompt === prompt.id ? null : prompt.id)}
                    className="w-full text-left rounded-xl border border-border/40 p-3 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.75rem] font-medium text-foreground leading-snug">{prompt.title}</span>
                      <ChevronDown className={cn('h-3 w-3 text-muted-foreground/40 transition-transform shrink-0', expandedPrompt === prompt.id && 'rotate-180')} />
                    </div>
                    <AnimatePresence>
                      {expandedPrompt === prompt.id && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <p className="text-[0.6875rem] text-muted-foreground mt-2 leading-relaxed">{prompt.prompt}</p>
                          {prompt.relatedBlockIds.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {prompt.relatedBlockIds.map((id) => { const b = blocks.find((bl) => bl.id === id); return b ? (
                                <button key={id} onClick={(e) => { e.stopPropagation(); insertBlock(b); }} className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] font-semibold text-primary hover:bg-primary/20 transition-colors">+ {b.label}</button>
                              ) : null; })}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected summary */}
          {selectedBlocks.size > 0 && (
            <div className="p-3 border-t border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[0.625rem] font-semibold text-muted-foreground">{selectedBlocks.size} block{selectedBlocks.size > 1 ? 's' : ''} selected</p>
                <button
                  onClick={() => setSelectedBlocks(new Set())}
                  className="text-[0.625rem] font-medium text-muted-foreground hover:text-rose-500 transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {blocks.filter((b) => selectedBlocks.has(b.id)).map((b) => (
                  <button key={b.id} onClick={() => insertBlock(b)} className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] font-semibold text-primary hover:bg-primary/20 transition-colors" title="Click to insert">{b.label}</button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── CENTER: Editor ───────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-0.5 px-4 h-10 border-b border-border/40 bg-card/30 shrink-0">
            <TBtn icon={Bold} active={editor?.isActive('bold') ?? false} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold" />
            <TBtn icon={Italic} active={editor?.isActive('italic') ?? false} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic" />
            <Sep />
            <TBtn icon={List} active={editor?.isActive('bulletList') ?? false} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list" />
            <TBtn icon={ListOrdered} active={editor?.isActive('orderedList') ?? false} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered list" />
            <Sep />
            <TBtn icon={Undo} active={false} onClick={() => editor?.chain().focus().undo().run()} title="Undo" disabled={!editor?.can().undo()} />
            <TBtn icon={Redo} active={false} onClick={() => editor?.chain().focus().redo().run()} title="Redo" disabled={!editor?.can().redo()} />
            <div className="flex-1" />
            <button onClick={handleCopy} className="flex items-center gap-1 rounded-md px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!editorText.trim()}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Download as .txt"
            >
              <Download className="h-3 w-3" /> Export
            </button>
            <button onClick={handleClear} className="flex items-center gap-1 rounded-md px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 transition-colors">
              <RotateCcw className="h-3 w-3" /> Clear
            </button>
          </div>

          {/* Editor surface */}
          <div
            className={cn('flex-1 overflow-y-auto bg-card', draggedBlock && 'select-none')}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={(e) => { e.preventDefault(); if (draggedBlock) { const b = blocks.find((bl) => bl.id === draggedBlock); if (b) insertBlock(b); } }}
          >
            <div className="max-w-3xl mx-auto">
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* Bottom status + progress */}
          <div className="shrink-0 border-t border-border/30 bg-card/50">
            <div className="flex items-center justify-between px-4 py-1.5">
              <div className="flex items-center gap-3">
                <span className={cn('text-[0.6875rem] font-semibold tabular-nums', ratio < 0.8 ? 'text-emerald-600' : ratio < 0.95 ? 'text-amber-600' : 'text-rose-600')}>
                  {current.toLocaleString()} <span className="font-normal text-muted-foreground">/ {limit.max.toLocaleString()} {limit.unit}</span>
                </span>
                {overBy > 0 && (
                  <span role="status" className="text-[0.625rem] font-semibold text-rose-500">
                    {overBy.toLocaleString()} {limit.unit} over the {limit.max.toLocaleString()}-{limit.unit === 'words' ? 'word' : 'character'} limit
                  </span>
                )}
                {overBy === 0 && ratio >= 0.95 && <span className="text-[0.625rem] font-semibold text-rose-500 motion-safe:animate-pulse">At limit</span>}
                {ratio >= 0.8 && ratio < 0.95 && <span className="text-[0.625rem] text-amber-500">Getting close</span>}
              </div>
              <span className="text-[0.625rem] text-muted-foreground/50">{limit.tip}</span>
            </div>
            <div className="h-0.5 bg-muted/20">
              <motion.div
                className={cn('h-full', ratio < 0.8 ? 'bg-emerald-500' : ratio < 0.95 ? 'bg-amber-500' : 'bg-rose-500')}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(ratio * 100, 100)}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </div>
        </main>

        {/* ── RIGHT: AI Panel ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {showAI && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="border-l border-border/50 bg-card/50 hidden lg:flex flex-col overflow-hidden shrink-0"
            >
              <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
                <EssayAIPanel
                  essay={editorText}
                  platform={platform}
                  selectedBlocks={blocks.filter((b) => selectedBlocks.has(b.id))}
                  onInsertText={(text) => {
                    if (!editor) return;
                    const paragraphs = text.split(/\n\n+/).filter(Boolean);
                    const html = paragraphs.map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
                    editor.chain().focus().insertContent(html).run();
                  }}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Clear-essay confirmation — replaces the OS window.confirm */}
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-sm">
          <div className="p-5 space-y-4">
            <DialogHeader>
              <DialogTitle>Clear your {platform} essay?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This also removes the saved draft and can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmClearEssay}>
                Clear essay
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function TBtn({ icon: Icon, active, onClick, title, disabled }: { icon: typeof Bold; active: boolean; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} aria-pressed={active}
      className={cn('flex h-7 w-7 items-center justify-center rounded-md transition-colors', active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground', disabled && 'opacity-25 cursor-not-allowed')}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function Sep() { return <div className="w-px h-4 bg-border/40 mx-0.5" />; }
