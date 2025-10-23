import { appConfig } from '../config.js';

export interface ForecastQueryParams {
  startDate: string;
  endDate: string;
  product?: string;
  table?: string;
  projectId?: string;
  dataset?: string;
}

/**
 * Builds a forecasting SQL query using the shared dataset.
 * Uses BigQuery scripting constructs to prepare aggregated metrics.
 */
export const buildForecastQuery = (params: ForecastQueryParams): string => {
  const tableName = params.table ?? 'sample_sales';
  const projectId = params.projectId ?? appConfig.bigQueryProject;
  const dataset = params.dataset ?? appConfig.bigQueryDataset;

  return `
    WITH historical AS (
      SELECT
        DATE(sale_date) AS sale_date,
        product,
        SUM(quantity) AS total_quantity,
        SUM(revenue) AS total_revenue
      FROM \`${projectId}.${dataset}.${tableName}\`
      WHERE sale_date BETWEEN @start_date AND @end_date
        ${params.product ? 'AND product = @product' : ''}
      GROUP BY sale_date, product
    ),
    summary AS (
      SELECT
        product,
        SUM(total_revenue) AS revenue_sum,
        AVG(total_revenue) AS revenue_avg
      FROM historical
      GROUP BY product
    )
    SELECT
      h.sale_date,
      h.product,
      h.total_quantity,
      h.total_revenue,
      s.revenue_sum AS forecast_sum,
      s.revenue_avg AS forecast_mean
    FROM historical h
    JOIN summary s USING (product)
    ORDER BY h.sale_date;
  `;
};
