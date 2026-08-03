import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { DataError, reportDataError } from '@/lib/data/errors';
import { parseJsonBody } from '@/lib/api/guards';
import { requireAdminUser } from '../admin-guard';
import { templateTableMap, validateTemplateRows, type TemplateKey } from './validation';

export async function POST(request: Request) {
  try {
    const supabase = await createRouteHandlerSupabaseClient();

    // Role check + its error handling live in ../admin-guard: the `error` from
    // the profiles lookup used to be discarded here, so an unreadable profiles
    // table denied every admin in silence.
    const { user, response } = await requireAdminUser(supabase, 'import');
    if (!user) return response;

    // A malformed body is a 400, not a 500 caught by the outer try.
    const body = await parseJsonBody<{ template?: unknown; rows?: unknown }>(request);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    // `rows` arrives from a client-side CSV parse, so it is untrusted input of
    // unknown SHAPE, not just unknown content — `validateTemplateRows` assumed
    // an array and a non-array body reached it as a TypeError/500.
    const rows = Array.isArray(body.rows) ? body.rows : body.rows === undefined ? [] : null;
    if (rows === null) {
      return NextResponse.json({ error: 'rows must be an array.' }, { status: 400 });
    }

    const parsedTemplate = typeof body.template === 'string' ? (body.template as TemplateKey) : undefined;
    // Per-row zod validation + the 5000-row cap live in ./validation.ts.
    const validation = validateTemplateRows(parsedTemplate, rows);
    if (validation.error) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const table = templateTableMap[parsedTemplate as TemplateKey];
    const onConflictKey = parsedTemplate === 'requirements' ? 'program_id' : 'id';

    const { error } = await supabase
      .from(table)
      .upsert(validation.rows! as never, { onConflict: onConflictKey });

    if (error) {
      // Was `{ error: error.message }` — PostgREST names the table, the
      // constraint and the policy that refused. Log the detail, return the
      // class of failure.
      // The context names the TEMPLATE (our vocabulary), not the table it maps
      // to — `DataError.context` is returned to the caller.
      const failure = reportDataError(`admin.import.${parsedTemplate}`, error);
      return NextResponse.json({ error: failure.message }, { status: 500 });
    }

    return NextResponse.json({ count: validation.rows!.length });
  } catch (error) {
    // Same reasoning: an unexpected throw here is as likely to be a driver error
    // as anything else, and `error.message` is not ours to forward.
    const failure =
      error instanceof DataError ? error : reportDataError('admin.import.unexpected', error);
    return NextResponse.json({ error: failure.message }, { status: 500 });
  }
}
