'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/* ─── Static mock data shown in the animation ─── */
const UNIVERSITIES = [
  { name: 'Imperial College London', flag: '🇬🇧', programme: 'MEng Mechanical Engineering', score: 92, status: 'Strong match' as const },
  { name: 'ETH Zürich', flag: '🇨🇭', programme: 'BSc Mechanical Engineering', score: 78, status: 'Good match' as const },
  { name: 'TU Delft', flag: '🇳🇱', programme: 'BSc Mechanical Engineering', score: 95, status: 'Safety' as const },
  { name: 'EPFL', flag: '🇨🇭', programme: 'BSc Mechanical Engineering', score: 82, status: 'Good match' as const },
];

const DEADLINES = [
  { uni: 'Imperial', label: 'UCAS deadline', days: 12, color: 'bg-rose-500' },
  { uni: 'ETH Zürich', label: 'Application open', days: 28, color: 'bg-amber-500' },
  { uni: 'TU Delft', label: 'Documents due', days: 45, color: 'bg-sky-500' },
];

const GRADES = ['7', '7', '6', '6', '5', '6'];
const SUBJECTS = ['Phy', 'Mat', 'Che', 'Eng', 'Fre', 'Eco'];

function statusColor(status: string) {
  if (status === 'Strong match') return 'text-emerald-600 bg-emerald-500/10';
  if (status === 'Good match') return 'text-sky-600 bg-sky-500/10';
  return 'text-violet-600 bg-violet-500/10';
}

function scoreBarColor(score: number) {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 75) return 'bg-sky-500';
  return 'bg-amber-500';
}

/* ─── Animated counter ─── */
function AnimatedScore({ target, delay }: { target: number; delay: number }) {
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) { setValue(target); return; }
    const timeout = setTimeout(() => {
      let frame: number;
      const start = performance.now();
      const duration = 800;
      const animate = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(eased * target));
        if (t < 1) frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(frame);
    }, delay);
    return () => clearTimeout(timeout);
  }, [target, delay, reduced]);

  return <span className="tabular-nums">{value}%</span>;
}

/* ─── Main component ─── */
export function DemoPreview() {
  const shouldReduceMotion = useReducedMotion();
  const [phase, setPhase] = useState(0); // 0=typing, 1=scores, 2=timeline

  useEffect(() => {
    if (shouldReduceMotion) { setPhase(2); return; }
    const t1 = setTimeout(() => setPhase(1), 1800);
    const t2 = setTimeout(() => setPhase(2), 3600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [shouldReduceMotion]);

  // Restart the animation every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      setPhase(0);
      setTimeout(() => setPhase(1), 1800);
      setTimeout(() => setPhase(2), 3600);
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Predicted grades input bar */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60 mb-2">
          Predicted IB Grades
        </p>
        <div className="flex gap-1.5">
          {GRADES.map((grade, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-lg bg-muted/60 border border-border/40 py-1.5 text-center"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15, duration: 0.3 }}
            >
              <p className="text-[9px] text-muted-foreground/50 font-medium">{SUBJECTS[i]}</p>
              <AnimatePresence mode="wait">
                {phase >= 0 && (
                  <motion.p
                    key={grade}
                    className="text-base font-bold text-foreground tabular-nums"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.15 + 0.6, type: 'spring', stiffness: 400 }}
                  >
                    {grade}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
          <motion.div
            className="flex items-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            <div className="rounded-lg bg-primary px-3 py-2.5 text-[11px] font-semibold text-primary-foreground shadow-sm">
              37
            </div>
          </motion.div>
        </div>
      </div>

      {/* Fit scores */}
      <AnimatePresence>
        {phase >= 1 && (
          <motion.div
            className="px-4 pb-3 flex-1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60 mb-2">
              Fit Scores
            </p>
            <div className="space-y-2">
              {UNIVERSITIES.map((uni, i) => (
                <motion.div
                  key={uni.name}
                  className="flex items-center gap-2.5 rounded-xl bg-muted/30 border border-border/30 px-3 py-2"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.12, duration: 0.4, ease: 'easeOut' }}
                >
                  <span className="text-sm shrink-0">{uni.flag}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-foreground truncate">{uni.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${scoreBarColor(uni.score)}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${uni.score}%` }}
                          transition={{ delay: i * 0.12 + 0.3, duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-foreground w-8 text-right">
                        <AnimatedScore target={uni.score} delay={(i * 120) + 300} />
                      </span>
                    </div>
                  </div>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusColor(uni.status)}`}>
                    {uni.status}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline peek */}
      <AnimatePresence>
        {phase >= 2 && (
          <motion.div
            className="px-4 pb-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60 mb-2">
              Next Actions
            </p>
            <div className="space-y-1.5">
              {DEADLINES.map((d, i) => (
                <motion.div
                  key={d.uni}
                  className="flex items-center gap-2 text-[11px]"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.3 }}
                >
                  <span className={`h-2 w-2 rounded-full ${d.color} shrink-0`} />
                  <span className="font-semibold text-foreground">{d.uni}</span>
                  <span className="text-muted-foreground/60">—</span>
                  <span className="text-muted-foreground truncate flex-1">{d.label}</span>
                  <span className="font-bold text-foreground tabular-nums shrink-0">{d.days}d</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
