# PLANLYT Backend Work Package

This repository contains backend deliverables for the PLANLYT work package. The codebase focuses on three pillars:

1. **BigQuery Forecasting Integration** – secure, reusable services and Supabase Edge Function for running forecasting jobs in Google BigQuery.
2. **AI-Based Auto-Mapping** – OpenAI embedding powered column-to-field mapping with persistence to Supabase.
3. **Conversational Planning Assistant** – action handler that routes natural language requests to forecasting, scenario simulations, and history recall.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Access to Google BigQuery (service account JSON)
- Supabase project (service role key)
- OpenAI API key (for embeddings)

### Environment Variables

Create a `.env` file (see `.env.example`) and provide:

```
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
BQ_PROJECT=your-gcp-project
BQ_DATASET=analytics_dataset
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role-key
OPENAI_API_KEY=sk-...
```

Load the environment before running any scripts:

```bash
export $(grep -v '^#' .env | xargs)
```

### Install Dependencies

```bash
npm install
```

### Database Setup (Supabase)

Apply the provided migration to create required tables (`forecast_runs`, `field_mappings`):

```bash
supabase db push
```

This relies on the SQL under `supabase/migrations/20240925000000_create_forecasting_tables.sql`.

## Work Package 1 – BigQuery Forecasting

- **Reusable client**: `src/services/bigQueryClient.ts`
- **Forecast runner**: `src/services/forecastService.ts`
- **Supabase Edge Function**: `supabase/functions/runForecast/index.ts`
- **CLI runner**: `npm run generate:forecast`

Usage example:

```bash
npm run generate:forecast -- --startDate 2024-01-01 --endDate 2024-03-31 --product "Widget A"
```

The Edge Function expects a POST payload:

```json
{
  "projectId": "your-project",
  "dataset": "analytics_dataset",
  "query": "SELECT ...",
  "jobTimeoutSeconds": 60,
  "userId": "uuid-of-user"
}
```

Results (and failures) are automatically persisted to the `forecast_runs` table when Supabase credentials are available.

## Work Package 2 – AI Auto-Mapping

- Core algorithm: `src/services/autoMapping/autoMapper.ts`
- Persistence helper: `src/services/mappingRepository.ts`
- Demo harness: `npm run generate:mapping`

The auto-mapper uses OpenAI embeddings (`text-embedding-3-small`) to find the best match between CSV columns and defined field candidates, with fallbacks for common synonyms. Run the demo:

```bash
npm run generate:mapping -- --file ./samples/sample_sales.csv
```

## Work Package 3 – Conversational Planning Assistant

- Primary handler: `src/services/conversationalActions.ts`
- Forecast query builder: `src/services/forecastQueryBuilder.ts`
- CLI chat loop: `npm run demo:conversation`

The handler recognises three classes of intent:

- `forecast` – runs a BigQuery forecast using parsed timeframe/product data.
- `simulate` – applies a percentage adjustment to the latest stored forecast.
- `recall` – retrieves recent forecast runs for the user from Supabase.

Run the interactive demo:

```bash
npm run demo:conversation
```

Set `CONVERSATION_USER_ID` to scope recall/simulation requests.

## Testing & Quality

- Type safety enforced via `npm run lint` (TypeScript `--noEmit`).
- Manual demos for forecasting, auto-mapping, and conversational flow are provided.
- Logger utility (`src/utils/logger.ts`) keeps structured JSON logs suitable for local debug or observability pipelines.

## Next Steps

- Add automated unit tests (e.g., with Vitest) for action parsing and timeframe resolution.
- Wire the conversational handler into the existing frontend/chat UI.
- Expand forecasting templates and simulation models for production-grade analytics.
