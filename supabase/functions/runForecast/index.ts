/// <reference lib="deno.ns" />
/// <reference lib="dom" />
// Supabase Edge Function to run parameterized BigQuery forecasting jobs.
import { serve } from 'std/server';
import { BigQuery } from 'npm:@google-cloud/bigquery';
import { createClient } from 'npm:@supabase/supabase-js';
import { z } from 'npm:zod';

const requestSchema = z.object({
  projectId: z.string().min(1),
  dataset: z.string().min(1),
  query: z.string().min(1),
  jobTimeoutSeconds: z.number().int().positive().max(120).optional(),
  userId: z.string().optional(),
});

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    : null;

const persistRun = async (payload: {
  jobId: string | null;
  query: string | null;
  startedAt: Date;
  completedAt: Date;
  durationMs: number | null;
  status: 'success' | 'error';
  dataset?: string;
  jobTimeoutSeconds?: number;
  error?: string;
  rows?: unknown[];
  userId?: string;
}) => {
  if (!supabase) return;
  try {
    await supabase.from('forecast_runs').insert({
      job_id: payload.jobId,
      query: payload.query,
      requested_at: payload.startedAt.toISOString(),
      completed_at: payload.completedAt.toISOString(),
      duration_ms: payload.durationMs,
      status: payload.status,
      params: {
        dataset: payload.dataset,
        jobTimeoutSeconds: payload.jobTimeoutSeconds,
        userId: payload.userId,
      },
      error: payload.error,
      rows: payload.rows ?? [],
      requested_by: payload.userId ?? null,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Failed to persist forecast run',
        error: String(error),
      }),
    );
  }
};

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const startedAt = new Date();
  let payload: z.infer<typeof requestSchema> | null = null;

  try {
    const body = await req.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request payload', details: validation.error.flatten() }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    payload = validation.data;
  } catch (error) {
    await persistRun({
      jobId: crypto.randomUUID(),
      query: null,
      startedAt,
      completedAt: new Date(),
      durationMs: null,
      status: 'error',
      error: `Invalid JSON: ${String(error)}`,
    });

    return new Response(JSON.stringify({ error: 'Request body must be valid JSON', details: String(error) }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const jobTimeoutMs = payload?.jobTimeoutSeconds ? payload.jobTimeoutSeconds * 1000 : undefined;

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Starting BigQuery forecast job',
      projectId: payload?.projectId,
      dataset: payload?.dataset,
      startedAt: startedAt.toISOString(),
    }),
  );

  try {
    const keyFilename = Deno.env.get('GOOGLE_APPLICATION_CREDENTIALS') ?? undefined;
    const credentialsJson = Deno.env.get('GOOGLE_APPLICATION_CREDENTIALS_JSON') ?? undefined;

    const bigQuery = new BigQuery({
      projectId: payload.projectId,
      keyFilename,
      credentials: credentialsJson ? JSON.parse(credentialsJson) : undefined,
    });

    const [job] = await bigQuery.createQueryJob({
      query: payload.query,
      location: 'US',
      defaultDataset: {
        projectId: payload.projectId,
        datasetId: payload.dataset,
      },
      jobTimeoutMs,
      labels: {
        application: 'planyt',
        feature: 'forecast',
      },
    });

    const [rows] = await job.getQueryResults({ timeoutMs: jobTimeoutMs });
    const endedAt = new Date();

    await persistRun({
      jobId: job.id ?? null,
      query: payload.query,
      startedAt,
      completedAt: endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      status: 'success',
      dataset: payload.dataset,
      jobTimeoutSeconds: payload.jobTimeoutSeconds,
      rows,
      userId: payload.userId,
    });

    console.log(
      JSON.stringify({
        level: 'info',
        message: 'BigQuery forecast job completed',
        jobId: job.id,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        rowCount: rows.length,
      }),
    );

    return new Response(
      JSON.stringify({
        jobId: job.id,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        rows,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const endedAt = new Date();

    await persistRun({
      jobId: crypto.randomUUID(),
      query: payload?.query ?? null,
      startedAt,
      completedAt: endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      status: 'error',
      dataset: payload?.dataset,
      jobTimeoutSeconds: payload?.jobTimeoutSeconds,
      error: String(error),
      userId: payload?.userId,
    });

    console.error(
      JSON.stringify({
        level: 'error',
        message: 'BigQuery forecast job failed',
        startedAt: startedAt.toISOString(),
        error: String(error),
      }),
    );

    return new Response(JSON.stringify({ error: 'Failed to run forecast job', details: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
