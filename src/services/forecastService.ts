import { Job } from '@google-cloud/bigquery';
import { runQuery, RunQueryResult } from './bigQueryClient.js';
import { logger } from '../utils/logger.js';

export interface ForecastJobInput {
  query: string;
  location?: string;
  jobTimeoutSeconds?: number;
  labels?: Record<string, string>;
  params?: Record<string, unknown>;
}

export interface ForecastJobResult<T = Record<string, unknown>> {
  jobId: string;
  statistics?: Job['metadata']['statistics'];
  rows: T[];
}

/**
 * Runs a forecasting BigQuery job and returns typed results.
 * Callers can pass a custom SQL query; prefer parameterized queries to avoid SQL injection.
 */
export const runForecastJob = async <T = Record<string, unknown>>(
  input: ForecastJobInput,
): Promise<ForecastJobResult<T>> => {
  const startedAt = Date.now();
  const queryOptions = {
    query: input.query,
    location: input.location ?? 'US',
    jobTimeoutSeconds: input.jobTimeoutSeconds,
    labels: input.labels,
    params: input.params,
  };

  logger.info('Running forecast job', { location: queryOptions.location });

  const { job, rows }: RunQueryResult<T> = await runQuery(queryOptions);

  const endedAt = Date.now();
  const durationMs = endedAt - startedAt;

  logger.info('Forecast job finished', {
    jobId: job.id,
    durationMs,
  });

  return {
    jobId: job.id ?? 'unknown',
    statistics: job.metadata?.statistics,
    rows,
  };
};
