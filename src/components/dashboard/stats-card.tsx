'use client';

import { cn } from '@/lib/utils';
import { ArrowUpRight, Minus, ArrowDownRight } from 'lucide-react';
import { motion } from 'framer-motion';
import type React from 'react';

interface StatsCardProps {
    label: string;
    value: string;
    detail: string;
    icon?: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
    className?: string;
}

export function StatsCard({ label, value, detail, icon, trend, className }: StatsCardProps) {
    return (
        <motion.div
            className={cn(
                'group surface-card hover-lift hover:border-border/80 dark:hover:border-primary/30',
                className
            )}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            whileHover={{ scale: 1.01 }}
        >
            {/* Hover gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none" />

            <div className="relative z-10 flex items-start justify-between">
                <div className="space-y-1">
                    <p className="eyebrow">
                        {label}
                    </p>
                    <motion.h3
                        className="text-2xl font-semibold tracking-tight text-foreground"
                        key={value}
                        initial={{ scale: 1.04, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.15 }}
                    >
                        {value}
                    </motion.h3>
                </div>
                {icon && (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary-ink ring-1 ring-primary/10 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/10">
                        {icon}
                    </div>
                )}
            </div>

            <div className="relative z-10 mt-4 flex items-center gap-2">
                {trend === 'up' && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success-subtle">
                        <ArrowUpRight className="h-3 w-3 text-success" />
                    </div>
                )}
                {trend === 'down' && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-danger-subtle">
                        <ArrowDownRight className="h-3 w-3 text-danger" />
                    </div>
                )}
                {trend === 'neutral' && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted/50">
                        <Minus className="h-3 w-3 text-muted-foreground" />
                    </div>
                )}
                <p className="text-sm text-muted-foreground">{detail}</p>
            </div>
        </motion.div>
    );
}
