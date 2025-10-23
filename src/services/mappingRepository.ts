import { getSupabaseServiceClient } from './supabaseClient.js';
import { ColumnMapping } from './autoMapping/autoMapper.js';
import { logger } from '../utils/logger.js';

export interface PersistMappingOptions {
  tenantId: string;
  datasetId: string;
  mappings: ColumnMapping[];
}

const TABLE_NAME = 'field_mappings';

export const persistMappings = async ({ tenantId, datasetId, mappings }: PersistMappingOptions) => {
  const supabase = getSupabaseServiceClient();
  const payload = mappings.map((mapping) => ({
    tenant_id: tenantId,
    dataset_id: datasetId,
    source_column: mapping.column,
    target_field: mapping.bestMatch?.id ?? null,
    score: mapping.score,
    candidates_ranked: mapping.candidatesRanked.map(({ candidate, score }) => ({
      id: candidate.id,
      score,
    })),
  }));

  const { error } = await supabase.from(TABLE_NAME).upsert(payload, {
    onConflict: 'tenant_id,dataset_id,source_column',
  });

  if (error) {
    logger.error('Failed to persist auto-mapping results', { error: error.message });
    throw error;
  }

  logger.info('Persisted auto-mapping results', { count: payload.length });
};
