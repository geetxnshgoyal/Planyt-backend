# Work Package Delivery Checklist

## WP1 – BigQuery Integration

- [x] Shared BigQuery client with credential management (`src/services/bigQueryClient.ts`).
- [x] Forecast runner with reusable query builder (`src/services/forecastService.ts`, `src/services/forecastQueryBuilder.ts`).
- [x] Supabase Edge Function with validation, logging, and persistence (`supabase/functions/runForecast/index.ts`).
- [x] CLI script for templated forecasting jobs (`src/scripts/runForecastJob.ts`).
- [x] Supabase migration for `forecast_runs` table.

## WP2 – AI Auto-Mapping

- [x] Embedding-driven column matcher with synonym fallbacks (`src/services/autoMapping/autoMapper.ts`).
- [x] Mapping persistence helper for Supabase (`src/services/mappingRepository.ts`).
- [x] Sample CSV + mapping harness (`samples/sample_sales.csv`, `src/apps/runAutoMapping.ts`).

## WP3 – Conversational Planning AI

- [x] Action classifier + handler for forecast/simulate/recall (`src/services/conversationalActions.ts`).
- [x] Scenario simulation leveraging latest forecast history.
- [x] Prompt templates for LLM orchestration.
- [x] CLI chat demo (`src/apps/runConversationDemo.ts`).

## Observability & Docs

- [x] Structured logger (`src/utils/logger.ts`).
- [x] README with setup steps and usage.
- [x] Supabase migrations for persistence.

Pending / Suggested Enhancements:

- Integrate automated tests for parsing utilities.
- Add API layer to expose conversational handler over REST or Supabase functions.
- Implement fine-grained access control for Supabase tables.
