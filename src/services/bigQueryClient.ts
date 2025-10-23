import { BigQuery, Job, QueryOptions } from '@google-cloud/bigquery';
import { appConfig } from '../config.js';
import { logger } from '../utils/logger.js';

let client: BigQuery | null = null;

export const getBigQueryClient = (): BigQuery => {
  if (!client) {
    client = new BigQuery({
      projectId: appConfig.bigQueryProject,
      keyFilename: appConfig.googleApplicationCredentials,
    });
    logger.info('Initialized BigQuery client', { projectId: appConfig.bigQueryProject });
  }
  return client;
};

export interface RunQueryOptions extends Omit<QueryOptions, 'query'> {
  query: string;
  jobTimeoutSeconds?: number;
}

export interface RunQueryResult<T = Record<string, unknown>> {
  job: Job;
  rows: T[];
}

export const runQuery = async <T = Record<string, unknown>>(options: RunQueryOptions): Promise<RunQueryResult<T>> => {
  const clientInstance = getBigQueryClient();
  const { jobTimeoutSeconds, ...queryOptions } = options;
  const timeoutMs = jobTimeoutSeconds ? jobTimeoutSeconds * 1000 : undefined;

  logger.info('Creating BigQuery job', { timeoutMs, location: queryOptions.location });

  const [job] = await clientInstance.createQueryJob(queryOptions);

  logger.info('Started BigQuery job', { jobId: job.id });

  const [rows] = await job.getQueryResults({ timeoutMs });

  logger.info('BigQuery job completed', { jobId: job.id, rowCount: rows.length });

  return {
    job,
    rows: rows as T[],
  };
};
