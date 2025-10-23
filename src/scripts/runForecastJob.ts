#!/usr/bin/env ts-node
import { promises as fs } from 'fs';
import { resolve } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Job } from '@google-cloud/bigquery';
import { appConfig } from '../config.js';
import { getBigQueryClient } from '../services/bigQueryClient.js';
import { logger } from '../utils/logger.js';

interface ForecastCliArgs {
  startDate: string;
  endDate: string;
  product?: string;
  template?: string;
  projectId?: string;
  dataset?: string;
  timeout?: number;
  location?: string;
}

const argv = yargs(hideBin(process.argv))
  .options({
    startDate: { type: 'string', demandOption: true, describe: 'ISO date for forecast range start' },
    endDate: { type: 'string', demandOption: true, describe: 'ISO date for forecast range end' },
    product: { type: 'string', describe: 'Optional product filter' },
    template: {
      type: 'string',
      default: './sql/forecast_template.sql',
      describe: 'Path to the SQL template file',
    },
    projectId: { type: 'string', describe: 'Override BigQuery project ID' },
    dataset: { type: 'string', describe: 'Override BigQuery dataset ID' },
    timeout: { type: 'number', describe: 'Job timeout in seconds (max 120)' },
    location: { type: 'string', default: 'US', describe: 'BigQuery dataset location' },
  })
  .parseSync() as ForecastCliArgs;

const enforceTimeout = (timeout?: number) => {
  if (!timeout) return undefined;
  if (timeout > 120) {
    throw new Error('Job timeout cannot exceed 120 seconds');
  }
  return timeout;
};

const replaceTemplateTokens = (template: string, replacements: Record<string, string>) => {
  let sql = template;
  for (const [token, value] of Object.entries(replacements)) {
    sql = sql.replace(new RegExp(`{{\\s*${token}\\s*}}`, 'g'), value);
  }
  return sql;
};

const pollJobUntilDone = async (job: Job, maxWaitMs: number) => {
  const started = Date.now();
  let backoffMs = 1000;
  while (Date.now() - started < maxWaitMs) {
    const [metadata] = await job.getMetadata();
    const state = metadata.status?.state;

    logger.info('Polling BigQuery job', { jobId: job.id, state });

    if (state === 'DONE') {
      if (metadata.status?.errorResult) {
        throw new Error(`BigQuery job failed: ${JSON.stringify(metadata.status.errorResult)}`);
      }
      return metadata;
    }

    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, backoffMs));
    backoffMs = Math.min(backoffMs * 2, 8000);
  }

  throw new Error('BigQuery job did not complete within the allotted time (60s)');
};

const main = async () => {
  const timeout = enforceTimeout(argv.timeout);

  const templatePath = resolve(argv.template ?? './sql/forecast_template.sql');
  const sqlTemplate = await fs.readFile(templatePath, 'utf-8');

  const projectId = argv.projectId ?? appConfig.bigQueryProject;
  const dataset = argv.dataset ?? appConfig.bigQueryDataset;

  const query = replaceTemplateTokens(sqlTemplate, {
    project_id: projectId,
    dataset,
  });

  logger.info('Submitting forecast job', { projectId, dataset, timeout, location: argv.location });

  const bigQuery = getBigQueryClient();
  const [job] = await bigQuery.createQueryJob({
    query,
    location: argv.location ?? 'US',
    defaultDataset: {
      projectId,
      datasetId: dataset,
    },
    params: {
      start_date: argv.startDate,
      end_date: argv.endDate,
      product: argv.product ?? null,
    },
    jobTimeoutMs: timeout ? timeout * 1000 : undefined,
  });

  await pollJobUntilDone(job, 60_000);

  const [rows] = await job.getQueryResults({ maxResults: 10 });
  const rowsPreview = rows.slice(0, 10);
  const metadata = job.metadata;

  const summary = {
    jobId: job.id,
    status: metadata.status?.state,
    rowsPreview,
  };

  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  logger.error('Forecast job failed', { error: String(error) });
  process.exitCode = 1;
});
