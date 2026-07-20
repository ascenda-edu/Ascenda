'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, MessageSquare, ListTree,
  Loader2, Copy, Check, ChevronDown, RefreshCw, CheckCircle2, Wand2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import type { EssayBuildingBlock } from '@/lib/data/student-demo-data';

type Action = 'feedback' | 'outline';

interface EssayAIPanelProps {
  essay: string;
  platform: string;
  selectedBlocks: EssayBuildingBlock[];
  allBlocks: EssayBuildingBlock[];
  onInsertText?: (text: string) => void;
}

const ACTIONS: { key: Action; label: string; icon: typeof Sparkles; description: string; color: string }[] = [
  { key: 'feedback', label: 'Get Feedback', icon: MessageSquare, description: 'AI reviews your draft with specific rewrites', color: 'text-violet-500 bg-violet-500/10' },
  { key: 'outline', label: 'Suggest Outline', icon: ListTree, description: 'Generate essay structure from your blocks', color: 'text-emerald-500 bg-emerald-500/10' },
];

export function EssayAIPanel({ essay, platform, selectedBlocks, allBlocks, onInsertText }: EssayAIPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (resultRef.current && loading) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [result, loading]);

  const lastRunRef = useRef<number>(0);

  const runAction = useCallback(async (action: Action, block?: EssayBuildingBlock) => {
    const now = Date.now();
    if (now - lastRunRef.current < 1500) return;
    lastRunRef.current = now;

    setLoading(true);
    setDone(false);
    setResult('');
    setError(null);
    setActiveAction(action);

    try {
      // Build rich student context from all available data
      const selectedDetails = selectedBlocks
        .map((b) => `- ${b.label}${b.detail ? `: ${b.detail}` : ''}`)
        .join('\n');

      const studentContext = [
        selectedBlocks.length > 0 ? `Selected building blocks:\n${selectedDetails}` : '',
        essay && essay.trim().length > 20 ? `Current essay draft (${essay.trim().split(/\s+/).length} words) is included separately.` : '',
      ].filter(Boolean).join('\n');

      const body: Record<string, unknown> = {
        action,
        platform,
        studentContext,
        essay: essay && essay.trim().length > 0 ? essay : undefined,
      };

      if (action === 'feedback') {
        if (!essay || essay.trim().length < 20) {
          setError('Write at least a few sentences in the editor before requesting feedback.');
          setLoading(false);
          return;
        }
      }

      if (action === 'outline') {
        if (selectedBlocks.length === 0) {
          setError('Select at least one building block from the left panel first.');
          setLoading(false);
          return;
        }
        body.blocks = selectedBlocks.map((b) => ({ label: b.label, detail: b.detail }));
      }

      const res = await fetch('/api/essay-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setError(err.error ?? 'Something went wrong');
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('No response stream');
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              setResult((prev) => prev + parsed.text);
            }
            if (parsed.error) {
              setError(parsed.error);
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setLoading(false);
    }
  }, [essay, platform, selectedBlocks]);

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsert = () => {
    if (onInsertText && result) {
      onInsertText(result);
    }
  };

  const essayWordCount = essay.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.15em] w-full"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10">
          <Sparkles className="h-3 w-3 text-primary" />
        </div>
        <span className="text-primary">AI Essay Assistant</span>
        <span className="text-[0.5625rem] font-bold text-primary/60 bg-primary/5 px-1.5 py-0.5 rounded-full">LIVE</span>
        <ChevronDown className={cn('h-3 w-3 text-primary/60 ml-auto transition-transform', isOpen && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3">
              {/* Status indicator */}
              <div className="rounded-lg bg-muted/30 px-3 py-2 text-[0.6875rem] text-muted-foreground space-y-0.5">
                <p>
                  <span className="font-semibold text-foreground">{essayWordCount}</span> words in editor
                  {essayWordCount < 5 && ' — start writing to enable feedback'}
                </p>
                <p>
                  <span className="font-semibold text-foreground">{selectedBlocks.length}</span> blocks selected
                  {selectedBlocks.length === 0 && ' — select blocks for outline'}
                </p>
              </div>

              {/* Action buttons */}
              {ACTIONS.map(({ key, label, icon: Icon, description, color }) => {
                const disabled = loading ||
                  (key === 'feedback' && essayWordCount < 5) ||
                  (key === 'outline' && selectedBlocks.length === 0);

                return (
                  <button
                    key={key}
                    onClick={() => {
                      runAction(key);
                    }}
                    disabled={disabled}
                    className={cn(
                      'w-full text-left rounded-xl border border-border/50 p-3 transition-colors group',
                      disabled
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:border-primary/20 hover:bg-muted/20',
                      activeAction === key && result && 'border-primary/30 bg-primary/[0.03]'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg transition-transform group-hover:scale-110', color)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.8125rem] font-semibold text-foreground">{label}</p>
                        <p className="text-[0.6875rem] text-muted-foreground leading-snug">{description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Loading indicator */}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="font-medium">
                    {activeAction === 'feedback' ? 'Reading your essay...' : 'Building outline...'}
                  </span>
                </div>
              )}

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-rose-200/50 bg-rose-500/5 p-3 space-y-2"
                >
                  <p className="text-xs text-rose-600">{error}</p>
                  {activeAction && (
                    <button
                      onClick={() => runAction(activeAction)}
                      className="flex items-center gap-1 text-[0.6875rem] font-medium text-rose-600 hover:text-rose-700 transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" /> Retry
                    </button>
                  )}
                </motion.div>
              )}

              {/* Result */}
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {done && !loading && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      <p className="text-[0.6875rem] font-semibold text-muted-foreground uppercase tracking-wider">
                        {activeAction === 'feedback' ? 'Feedback' : 'Outline'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {done && !loading && activeAction && (
                        <button
                          onClick={() => runAction(activeAction)}
                          className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[0.625rem] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                          title="Run again"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Re-run
                        </button>
                      )}
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[0.625rem] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                      >
                        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                      {activeAction === 'outline' && onInsertText && (
                        <button
                          onClick={handleInsert}
                          className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[0.625rem] font-medium text-primary hover:bg-primary/20 transition-colors"
                        >
                          <Wand2 className="h-3 w-3" />
                          Insert
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    ref={resultRef}
                    className="max-h-[60vh] overflow-y-auto rounded-xl border border-border/50 bg-card p-4 scrollbar-thin"
                  >
                    {/* react-markdown escapes raw HTML — model output built from
                        student-controlled essay text must never hit innerHTML. */}
                    <div className="prose prose-sm dark:prose-invert max-w-none text-[0.8125rem] leading-relaxed [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-[0.8125rem] [&_h2]:font-semibold [&_h3]:text-[0.8125rem] [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1">
                      <ReactMarkdown>{result}</ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
