/**
 * `writeStudentIntake` — and specifically the compensating transaction inside
 * `replaceOwnedRows`, which had **zero** coverage.
 *
 * WHAT IS AT STAKE
 * ----------------
 * PostgREST has no multi-statement transaction, so "replace this student's
 * subjects" is a DELETE followed by an INSERT with a gap in the middle. If the
 * insert loses that race — a constraint violation, a dropped connection, a
 * statement timeout — the delete has already committed and the student's
 * subjects, activities or admissions tests are gone, permanently, with no
 * recovery path. It surfaces to the student as "couldn't save your profile",
 * which does not sound like "your subject list has been erased".
 *
 * The Phase 2 fix snapshots the rows first and puts them back when the insert
 * fails. It was shipped untested: a reviewer neutered the restore and all 1,069
 * tests stayed green. This file is that missing test.
 *
 * WHAT IS ASSERTED, AND WHY EACH ONE MATTERS
 * ------------------------------------------
 *   - the snapshot is taken BEFORE the delete (after it, it snapshots nothing
 *     and the rollback silently restores an empty list);
 *   - a failed snapshot ABORTS — the delete must not run when there is nothing
 *     to roll back to;
 *   - a failed insert restores the previous rows verbatim, ids included, and
 *     still throws (the save failed; it just did not take the data with it);
 *   - a failed RESTORE reports both failures and how many rows are at risk,
 *     because that is the one path where data really is gone and the message is
 *     all anyone will have to work from;
 *   - every delete is scoped to the caller's `profile_id`. An unscoped delete
 *     here does not read a stranger's row, it DESTROYS it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';
import { writeStudentIntake } from '@/lib/profile/persist-intake';

/* ── the double ───────────────────────────────────────────────────────────────
 * A recorder, not a simulator: it captures table, operation, payload and the
 * `.eq()` filters, in call order, and lets a test decide what each call
 * resolves to. Filters are recorded because "which rows does this DELETE
 * touch" is the security-critical half of this module.
 */

type Operation = 'select' | 'delete' | 'insert' | 'upsert';
interface Op {
  table: string;
  op: Operation;
  payload: unknown;
  filters: Array<[column: string, value: unknown]>;
}
type Outcome = { data?: unknown; error?: unknown };

const fakeClient = (respond: (op: Op) => Outcome = () => ({})) => {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      let current: Op;
      const builder: Record<string, unknown> = {};
      const begin = (op: Operation, payload: unknown) => {
        current = { table, op, payload, filters: [] };
        ops.push(current);
        return builder;
      };
      builder.select = (columns: string) => begin('select', columns);
      builder.insert = (rows: unknown) => begin('insert', rows);
      builder.upsert = (row: unknown) => begin('upsert', row);
      builder.delete = () => begin('delete', null);
      builder.eq = (column: string, value: unknown) => {
        current.filters.push([column, value]);
        return builder;
      };
      builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const outcome = respond(current);
        return Promise.resolve({ data: outcome.data ?? null, error: outcome.error ?? null }).then(
          resolve,
          reject
        );
      };
      return builder;
    }
  };
  return { client: client as unknown as SupabaseClient<Database>, ops };
};

const opsFor = (ops: Op[], table: string) => ops.filter((o) => o.table === table);
const sequence = (ops: Op[], table: string) => opsFor(ops, table).map((o) => o.op);

/* ── the payload ──────────────────────────────────────────────────────────── */

const USER = 'student-under-test';

const SUBJECTS: StudentProfilePayload['academic_input']['subject_list'] = [
  { subject_name: 'Mathematics', level: 'HL', grade_value: 7 },
  { subject_name: 'Physics', level: 'HL', grade_value: 6 },
  { subject_name: 'English', level: 'SL', grade_value: 6 }
];

const payload = (): StudentProfilePayload => ({
  personal_information: {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone: null,
    nationality: 'British',
    age: 17,
    gender: 'female',
    resident_country: 'United Kingdom',
    current_location_city: 'London',
    time_zone: 'Europe/London'
  },
  academic_input: {
    programme_type: 'IB',
    school_name: 'Demo School',
    school_country: 'United Kingdom',
    school_city: 'London',
    school_type: 'international_school',
    language_of_instruction: 'english',
    graduation_year: 2027,
    desired_start_date: null,
    intended_clusters: ['computer_science'],
    secondary_clusters: [],
    career_aspiration: 'Engineer',
    subject_list: SUBJECTS,
    ib_total_points: 40,
    ib_core_points: 2,
    ib_tok_grade: 'A',
    ib_ee_grade: 'A',
    ib_math_pathway: 'AA_HL',
    ee_subject: null,
    ee_title: null,
    ee_summary: null,
    a_level_predicted_grades: null,
    english_required: true,
    english_test_type: 'IELTS',
    english_status: 'met',
    english_score_overall: 7.5,
    admissions_tests: [{ test_type: 'UCAT', status: 'booked', score_numeric: null, percentile: null }]
  },
  lifestyle_preference: {
    teaching_style: 'academic',
    desired_location_type: 'london',
    campus_size: 'medium',
    extracurricular_interests: ['Sports/fitness'],
    other_extracurriculars: null,
    leadership_roles: [],
    commitment_level: null,
    key_activities: [],
    sat_score: null,
    act_score: null,
    intl_experience: [],
    work_experience: null,
    work_experience_summary: null,
    ambition_statement: null,
    epq_subject: null,
    epq_title: null
  },
  activities_list: [{ category: 'Sports', level: null, duration: null, highlight: null, sort_order: 0 }]
});

/** The rows already in `student_subjects` when the save starts. */
const EXISTING_SUBJECTS = [
  { id: 'row-1', profile_id: USER, subject_name: 'History', level: 'HL', grade_value: '5' },
  { id: 'row-2', profile_id: USER, subject_name: 'Biology', level: 'SL', grade_value: '4' }
];

/**
 * Succeeds at everything, and reports `EXISTING_SUBJECTS` as the current
 * contents of `student_subjects`; `overrides` replaces the outcome for
 * whichever calls a test wants to break.
 */
const respondWith = (overrides: (op: Op, nth: number) => Outcome | undefined = () => undefined) => {
  const counters = new Map<string, number>();
  return (op: Op): Outcome => {
    const key = `${op.table}:${op.op}`;
    const nth = (counters.get(key) ?? 0) + 1;
    counters.set(key, nth);

    const override = overrides(op, nth);
    if (override) return override;
    if (op.op === 'select') {
      return { data: op.table === 'student_subjects' ? EXISTING_SUBJECTS : [] };
    }
    return {};
  };
};

const FAILED_INSERT = { error: { message: 'duplicate key value violates unique constraint' } };

let warn: jest.SpyInstance;
let error: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  error = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. The order of operations. Everything else depends on it.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('replaceOwnedRows — the snapshot is taken before anything is destroyed', () => {
  it('reads, then deletes, then inserts', async () => {
    const { client, ops } = fakeClient(respondWith());

    await writeStudentIntake(client, USER, payload());

    expect(sequence(ops, 'student_subjects')).toEqual(['select', 'delete', 'insert']);
    expect(sequence(ops, 'student_activities')).toEqual(['select', 'delete', 'insert']);
    expect(sequence(ops, 'student_admissions_tests')).toEqual(['select', 'delete', 'insert']);
  });

  it('snapshots the WHOLE row, so the restore can put the ids back too', async () => {
    const { client, ops } = fakeClient(respondWith());

    await writeStudentIntake(client, USER, payload());

    // A narrowed select would restore rows with new ids, orphaning anything that
    // referenced the old ones.
    expect(opsFor(ops, 'student_subjects')[0]).toMatchObject({ op: 'select', payload: '*' });
  });

  it('a failed snapshot aborts BEFORE the delete — nothing is destroyed unrecoverably', async () => {
    const { client, ops } = fakeClient(
      respondWith((op) =>
        op.table === 'student_activities' && op.op === 'select'
          ? { error: { message: 'permission denied for table student_activities' } }
          : undefined
      )
    );

    await expect(writeStudentIntake(client, USER, payload())).rejects.toThrow(
      'permission denied for table student_activities'
    );
    // The delete is the irreversible step. If the read that feeds the rollback
    // failed, the delete must never run.
    expect(sequence(ops, 'student_activities')).toEqual(['select']);
  });

  it('a failed delete does not go on to insert the new rows', async () => {
    const { client, ops } = fakeClient(
      respondWith((op) =>
        op.table === 'student_subjects' && op.op === 'delete'
          ? { error: { message: 'deadlock detected' } }
          : undefined
      )
    );

    await expect(writeStudentIntake(client, USER, payload())).rejects.toThrow('deadlock detected');
    // Otherwise the student ends up with both the old and the new subject lists.
    expect(sequence(ops, 'student_subjects')).toEqual(['select', 'delete']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. The rollback itself — the mutation that survived the whole suite.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('replaceOwnedRows — a failed insert restores the previous rows', () => {
  it('puts back exactly what was there, byte for byte, ids included', async () => {
    const { client, ops } = fakeClient(
      respondWith((op, nth) =>
        op.table === 'student_subjects' && op.op === 'insert' && nth === 1 ? FAILED_INSERT : undefined
      )
    );

    await expect(writeStudentIntake(client, USER, payload())).rejects.toThrow(
      'duplicate key value violates unique constraint'
    );

    const subjectOps = opsFor(ops, 'student_subjects');
    expect(subjectOps.map((o) => o.op)).toEqual(['select', 'delete', 'insert', 'insert']);
    // The restore is the SNAPSHOT, not the payload being saved.
    expect(subjectOps[3].payload).toEqual(EXISTING_SUBJECTS);
  });

  it('still throws — the save failed, it just did not take the data with it', async () => {
    // Both halves matter. Swallowing the error would report a successful save of
    // rows that were rolled back; skipping the restore loses the rows.
    const { client } = fakeClient(
      respondWith((op, nth) =>
        op.table === 'student_subjects' && op.op === 'insert' && nth === 1 ? FAILED_INSERT : undefined
      )
    );

    await expect(writeStudentIntake(client, USER, payload())).rejects.toThrow(
      /duplicate key value violates unique constraint/
    );
  });

  it.each([
    ['student_activities', [{ id: 'a-1', profile_id: USER, category: 'Debate' }]],
    ['student_subjects', EXISTING_SUBJECTS],
    ['student_admissions_tests', [{ id: 't-1', profile_id: USER, test_type: 'LNAT' }]]
  ])('%s is protected, not just the one table someone tested by hand', async (table, previous) => {
    const { client, ops } = fakeClient(
      respondWith((op, nth) => {
        if (op.table === table && op.op === 'select') return { data: previous };
        if (op.table === table && op.op === 'insert' && nth === 1) return FAILED_INSERT;
        return undefined;
      })
    );

    await expect(writeStudentIntake(client, USER, payload())).rejects.toThrow();

    const restores = opsFor(ops, table).filter((o) => o.op === 'insert');
    expect(restores).toHaveLength(2);
    expect(restores[1].payload).toEqual(previous);
  });

  it('does not attempt a restore when there was nothing there to begin with', async () => {
    // `.insert([])` is a wasted round trip at best; at worst PostgREST answers it
    // with an error that masks the real one.
    const { client, ops } = fakeClient(
      respondWith((op, nth) => {
        if (op.table === 'student_subjects' && op.op === 'select') return { data: [] };
        if (op.table === 'student_subjects' && op.op === 'insert' && nth === 1) return FAILED_INSERT;
        return undefined;
      })
    );

    await expect(writeStudentIntake(client, USER, payload())).rejects.toThrow(
      'duplicate key value violates unique constraint'
    );
    expect(opsFor(ops, 'student_subjects').filter((o) => o.op === 'insert')).toHaveLength(1);
  });

  it('skips the insert entirely when the new list is empty — and restores nothing', async () => {
    // Clearing your subject list is a legitimate save. The delete IS the whole
    // operation; there is no insert to fail and therefore nothing to roll back.
    const empty = payload();
    empty.academic_input.subject_list = [];
    const { client, ops } = fakeClient(respondWith());

    await writeStudentIntake(client, USER, empty);

    expect(sequence(ops, 'student_subjects')).toEqual(['select', 'delete']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. The nasty case: the restore itself fails.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('replaceOwnedRows — when the restore ALSO fails', () => {
  const bothFail = () =>
    fakeClient(
      respondWith((op) => {
        if (op.table === 'student_subjects' && op.op === 'insert') {
          return { error: { message: 'connection to server was lost' } };
        }
        return undefined;
      })
    );

  it('reports both failures, not just the second one', async () => {
    // This is the only path where data really is gone. The thrown message is the
    // entire forensic record — if it names only the restore failure, nobody can
    // tell whether the original save was the cause or a symptom.
    const { client } = bothFail();

    await expect(writeStudentIntake(client, USER, payload())).rejects.toThrow(
      /insert failed \(connection to server was lost\) AND restoring the previous rows failed/
    );
  });

  it('names the table and how many rows are at risk', async () => {
    const { client } = bothFail();

    await expect(writeStudentIntake(client, USER, payload())).rejects.toThrow(
      /^student_subjects:/
    );
    await expect(writeStudentIntake(client, USER, payload())).rejects.toThrow(
      `${EXISTING_SUBJECTS.length} row(s) may have been lost`
    );
  });

  it('does not keep retrying — one restore attempt, then it gives up loudly', async () => {
    const { client, ops } = bothFail();

    await expect(writeStudentIntake(client, USER, payload())).rejects.toThrow();
    expect(opsFor(ops, 'student_subjects').filter((o) => o.op === 'insert')).toHaveLength(2);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Scoping. An unscoped read leaks a row; an unscoped DELETE destroys it.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('every write is scoped to the caller', () => {
  it.each(['student_subjects', 'student_activities', 'student_admissions_tests'])(
    '%s: both the snapshot and the delete filter on the caller profile_id',
    async (table) => {
      const { client, ops } = fakeClient(respondWith());

      await writeStudentIntake(client, USER, payload());

      for (const op of opsFor(ops, table)) {
        if (op.op === 'select' || op.op === 'delete') {
          expect(op.filters).toEqual([['profile_id', USER]]);
        }
      }
    }
  );

  it('the cached-match wipe is scoped too', async () => {
    const { client, ops } = fakeClient(respondWith());

    await writeStudentIntake(client, USER, payload());

    const wipe = opsFor(ops, 'student_matches').find((o) => o.op === 'delete');
    expect(wipe?.filters).toEqual([['profile_id', USER]]);
  });

  it('stamps profile_id on every inserted row and every upserted record', async () => {
    const { client, ops } = fakeClient(respondWith());

    await writeStudentIntake(client, USER, payload());

    for (const op of ops) {
      if (op.op !== 'insert') continue;
      for (const row of op.payload as Array<Record<string, unknown>>) {
        expect(row.profile_id).toBe(USER);
      }
    }
    expect(opsFor(ops, 'profiles')[0].payload).toMatchObject({ id: USER });
    for (const table of [
      'student_personal_information',
      'student_academic_input',
      'student_lifestyle_preference'
    ]) {
      expect(opsFor(ops, table)[0].payload).toMatchObject({ profile_id: USER });
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. The deliberately best-effort tail.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the best-effort tail does not fail the save', () => {
  it('a failed score write is logged, not thrown', async () => {
    const { client, ops } = fakeClient(
      respondWith((op) =>
        op.table === 'student_scores' ? { error: { message: 'scores are read-only' } } : undefined
      )
    );

    await expect(writeStudentIntake(client, USER, payload())).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    // …and the save still went on to invalidate the cached matches.
    expect(opsFor(ops, 'student_matches')).toHaveLength(1);
  });

  it('a failed match-cache wipe is warned about, not thrown', async () => {
    const { client } = fakeClient(
      respondWith((op) =>
        op.table === 'student_matches' ? { error: { message: 'statement timeout' } } : undefined
      )
    );

    await expect(writeStudentIntake(client, USER, payload())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Failed to clear cached matches after profile save',
      expect.objectContaining({ message: 'statement timeout' })
    );
  });

  it('a failed core upsert IS thrown, and stops the write there', async () => {
    // The contrast that gives the two tests above their meaning: "best effort"
    // is a property of the score and the cache wipe only.
    const { client, ops } = fakeClient(
      respondWith((op) =>
        op.table === 'student_academic_input' ? { error: { message: 'null value in column' } } : undefined
      )
    );

    await expect(writeStudentIntake(client, USER, payload())).rejects.toThrow('null value in column');
    expect(opsFor(ops, 'student_subjects')).toHaveLength(0);
  });
});
