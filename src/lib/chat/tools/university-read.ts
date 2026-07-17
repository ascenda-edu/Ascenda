// University lookup READ tool. Executed inline by the tool loop (no
// confirmation) under the user-scoped client. Like the other read tools,
// execute() MUST NOT throw — a failed lookup returns an { error } payload the
// model can see, never a broken stream. The catalogue is public, so no RLS
// scoping applies here (universities/programs are readable in every mode).

import { Type, type FunctionDeclaration } from '@google/genai';
import { resolveUniversityIds } from '../tools';
import type { ChatWidget, UniversityHit } from '../widgets';
import type { ReadTool, ToolContext } from './types';

const getUniversityInfoDeclaration: FunctionDeclaration = {
  name: 'get_university_info',
  description:
    'Look up live catalogue data for ONE specific university by name — ranking, acceptance rate, tuition range, size, and a few of its programmes. Use when the user asks about a specific university ("tell me about Imperial", "how selective is Oxford", "what does MIT cost"). The result is rendered to the user as a card. Never invent figures — if no match is found, say so.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'The university name, e.g. "Imperial College" or "MIT".' },
    },
    required: ['name'],
  },
};

type UniRow = {
  id: string;
  name: string | null;
  city: string | null;
  country: string | null;
  rank_overall: number | null;
  rank_source: string | null;
  acceptance_rate_pct: number | null;
  intl_tuition_low: number | null;
  intl_tuition_high: number | null;
  currency: string | null;
  number_of_students: number | null;
};

type ProgramRow = { id: string; course_name: string | null; study_level: string | null };

const getUniversityInfo: ReadTool = {
  kind: 'read',
  name: 'get_university_info',
  modes: ['student', 'counsellor'],
  declaration: getUniversityInfoDeclaration,
  statusLabel: 'Looking up the university…',
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { error: 'Provide a university name.' };

      const ids = await resolveUniversityIds(ctx.supabase as never, name);
      if (ids.length === 0) {
        return { error: `No university matching "${name}" in the catalogue.` };
      }
      const id = ids[0];

      const { data: uni, error } = await ctx.supabase
        .from('universities')
        .select(
          'id,name,city,country,rank_overall,rank_source,acceptance_rate_pct,intl_tuition_low,intl_tuition_high,currency,number_of_students'
        )
        .eq('id', id)
        .maybeSingle();

      if (error || !uni) {
        return { error: `Could not load "${name}" right now.` };
      }
      const row = uni as unknown as UniRow;

      const { data: programData } = await ctx.supabase
        .from('programs')
        .select('id,course_name,study_level')
        .eq('university_id', id)
        .limit(3);
      const programs = ((programData ?? []) as unknown as ProgramRow[]).map((p) => ({
        id: p.id,
        course: p.course_name ?? 'Programme',
        level: p.study_level ?? null,
      }));

      return {
        university: {
          id: row.id,
          name: row.name ?? name,
          city: row.city ?? null,
          country: row.country ?? '—',
          rankOverall: row.rank_overall ?? null,
          rankSource: row.rank_source ?? null,
          acceptanceRatePct: row.acceptance_rate_pct ?? null,
          tuitionLow: row.intl_tuition_low ?? null,
          tuitionHigh: row.intl_tuition_high ?? null,
          currency: row.currency ?? null,
          students: row.number_of_students ?? null,
        },
        programs,
      };
    } catch {
      return { error: 'Could not look up that university right now.' };
    }
  },
  toWidgets: (result): ChatWidget[] | null => {
    const uni = (result as { university?: Record<string, unknown> }).university;
    if (!uni || typeof uni !== 'object') return null;
    const programs =
      (result as { programs?: Array<{ id: string; course: string; level: string | null }> })
        .programs ?? [];
    const item: UniversityHit = {
      id: String(uni.id),
      name: String(uni.name ?? 'University'),
      city: (uni.city as string | null) ?? null,
      country: String(uni.country ?? '—'),
      rankOverall: (uni.rankOverall as number | null) ?? null,
      rankSource: (uni.rankSource as string | null) ?? null,
      acceptanceRatePct: (uni.acceptanceRatePct as number | null) ?? null,
      tuitionLow: (uni.tuitionLow as number | null) ?? null,
      tuitionHigh: (uni.tuitionHigh as number | null) ?? null,
      currency: (uni.currency as string | null) ?? null,
      students: (uni.students as number | null) ?? null,
      programs: programs.slice(0, 3),
    };
    return [{ kind: 'universities', items: [item] }];
  },
};

export const UNIVERSITY_READ_TOOLS: ReadTool[] = [getUniversityInfo];
