#!/usr/bin/env ts-node
import { promises as fs } from 'fs';
import { resolve } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { autoMapColumns, MappingCandidate } from '../services/autoMapping/autoMapper.js';
import { logger } from '../utils/logger.js';

interface CliArgs {
  file: string;
}

const argv = yargs(hideBin(process.argv))
  .options({
    file: {
      type: 'string',
      default: './samples/sample_sales.csv',
      describe: 'Path to the CSV file to process',
    },
  })
  .parseSync() as CliArgs;

const parseCsv = (content: string) => {
  const lines = content.trim().split(/\r?\n/);
  const headers = lines.shift()?.split(',') ?? [];
  return lines.map((line) => {
    const values = line.split(',');
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header.trim()] = values[index]?.trim() ?? '';
      return acc;
    }, {});
  });
};

const candidates: MappingCandidate[] = [
  {
    id: 'sale_date',
    description: 'Transaction date when the sale occurred; ISO-8601 formatted',
    synonyms: ['date', 'transaction_date', 'order_date'],
    required: true,
  },
  {
    id: 'product',
    description: 'Product name or unique identifier sold in the transaction',
    synonyms: ['sku', 'item_name'],
    required: true,
  },
  {
    id: 'quantity',
    description: 'Number of units sold for the transaction',
    synonyms: ['qty', 'units', 'count'],
  },
  {
    id: 'revenue',
    description: 'Net revenue recorded for the transaction',
    synonyms: ['sales_amount', 'sales', 'amount'],
  },
  {
    id: 'region',
    description: 'Geographical region or market',
    synonyms: ['territory', 'market'],
  },
];

const main = async () => {
  const filePath = resolve(argv.file);
  logger.info('Running auto-mapping harness', { filePath });

  const csvContent = await fs.readFile(filePath, 'utf-8');
  const rows = parseCsv(csvContent);

  const mappings = await autoMapColumns({
    rows,
    candidates,
  });

  console.log(JSON.stringify(mappings, null, 2));
};

main().catch((error) => {
  logger.error('Auto-mapping harness failed', { error: String(error) });
  process.exitCode = 1;
});
