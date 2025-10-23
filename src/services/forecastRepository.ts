import { getSupabaseServiceClient } from './supabaseClient.js';
import { logger } from '../utils/logger.js';

export interface ForecastRunRecord {
  jobId: string;
  query: string;
  requestedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: 'success' | 'error';
  params: Record<string, unknown>;
  rows: unknown[];
  error?: string;
  requestedBy?: string;
}

const TABLE_NAME = 'forecast_runs';

export const saveForecastRun = async (record: ForecastRunRecord) => {
  const client = getSupabaseServiceClient();
  const payload = {
    job_id: record.jobId,
    query: record.query,
    requested_at: record.requestedAt,
    completed_at: record.completedAt ?? null,
    duration_ms: record.durationMs ?? null,
    status: record.status,
    params: record.params,
    rows: record.rows,
    error: record.error ?? null,
    requested_by: record.requestedBy ?? null,
  };
  const { error } = await client.from(TABLE_NAME).insert(payload);
  if (error) {
    logger.error('Failed to persist forecast run', { error: error.message });
    throw error;
  }
  logger.info('Persisted forecast run', { jobId: record.jobId });
};
