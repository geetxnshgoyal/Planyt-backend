import { getOpenAiClient } from '../openaiClient.js';
import { logger } from '../../utils/logger.js';

export interface CsvRow {
  [column: string]: unknown;
}

export interface MappingCandidate {
  id: string;
  description: string;
  synonyms?: string[];
  required?: boolean;
}

export interface ColumnMapping {
  column: string;
  bestMatch: MappingCandidate | null;
  score: number;
  candidatesRanked: Array<{ candidate: MappingCandidate; score: number }>;
}

export interface AutoMapConfig {
  rows: CsvRow[];
  candidates: MappingCandidate[];
  model?: string;
  topK?: number;
}

const cosineSimilarity = (a: number[], b: number[]): number => {
  const dotProduct = a.reduce((acc, value, index) => acc + value * b[index], 0);
  const normA = Math.sqrt(a.reduce((acc, value) => acc + value * value, 0));
  const normB = Math.sqrt(b.reduce((acc, value) => acc + value * value, 0));
  return dotProduct / (normA * normB);
};

const buildColumnContext = (column: string, rows: CsvRow[], sampleSize = 5): string => {
  const values = rows
    .map((row) => row[column])
    .filter((value) => value !== undefined && value !== null)
    .slice(0, sampleSize)
    .map((value) => String(value));

  return `Column: ${column}\nSample Values: ${values.join(', ')}`;
};

const buildCandidateContext = (candidate: MappingCandidate): string => {
  const synonyms = candidate.synonyms?.length ? `Synonyms: ${candidate.synonyms.join(', ')}` : '';
  return `Field: ${candidate.id}\nDescription: ${candidate.description}\n${synonyms}`;
};

export const autoMapColumns = async (config: AutoMapConfig): Promise<ColumnMapping[]> => {
  if (!config.rows.length) {
    throw new Error('Cannot auto-map columns without sample rows.');
  }

  const model = config.model ?? 'text-embedding-3-small';
  const openai = getOpenAiClient();

  const columns = Object.keys(config.rows[0] ?? {});
  const columnContexts = columns.map((column) => buildColumnContext(column, config.rows));
  const candidateContexts = config.candidates.map((candidate) => buildCandidateContext(candidate));

  logger.info('Requesting embeddings for columns and candidates', {
    columnCount: columns.length,
    candidateCount: candidateContexts.length,
    model,
  });

  const [columnEmbeddings, candidateEmbeddings] = await Promise.all([
    openai.embeddings.create({ model, input: columnContexts }),
    openai.embeddings.create({ model, input: candidateContexts }),
  ]);

  return columns.map((column, columnIndex) => {
    const columnVector = columnEmbeddings.data[columnIndex].embedding;

    const ranked = candidateEmbeddings.data
      .map((embedding, candidateIndex) => {
        const candidateVector = embedding.embedding;
        const score = cosineSimilarity(columnVector, candidateVector);
        return { candidate: config.candidates[candidateIndex], score };
      })
      .sort((a, b) => b.score - a.score);

    const best = ranked[0] ?? null;

    // Helpful fallback heuristic in case embeddings are inconclusive.
    if (best && best.score < 0.6) {
      const normalizedColumn = column.toLowerCase().replace(/[_\s]/g, '');
      const fallback = ranked.find(({ candidate }) => {
        if (candidate.id.toLowerCase().replace(/[_\s]/g, '') === normalizedColumn) return true;
        return candidate.synonyms?.some(
          (synonym) => synonym.toLowerCase().replace(/[_\s]/g, '') === normalizedColumn,
        );
      });
      if (fallback) {
        return {
          column,
          bestMatch: fallback.candidate,
          score: Math.max(best.score, 0.6),
          candidatesRanked: ranked,
        };
      }
    }

    return {
      column,
      bestMatch: best ? best.candidate : null,
      score: best ? best.score : 0,
      candidatesRanked: ranked,
    };
  });
};
