import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { templateTableMap, validateTemplateRows, type TemplateKey } from './validation';

export async function POST(request: Request) {
  try {
    const supabase = await createRouteHandlerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { template, rows = [] } = await request.json();
    const parsedTemplate = template as TemplateKey | undefined;
    const validation = validateTemplateRows(parsedTemplate, rows);
    if (validation.error) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const table = templateTableMap[parsedTemplate as TemplateKey];
    const onConflictKey = parsedTemplate === 'requirements' ? 'program_id' : 'id';

    const { error } = await supabase.from(table).upsert(validation.rows! as any, { onConflict: onConflictKey });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ count: validation.rows!.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
