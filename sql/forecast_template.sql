SELECT
  DATE(sale_date) AS sale_date,
  product,
  SUM(quantity) AS total_quantity,
  SUM(revenue) AS total_revenue,
  AVG(revenue) AS avg_revenue
FROM `{{project_id}}.{{dataset}}.sample_sales`
WHERE sale_date BETWEEN @start_date AND @end_date
  AND (@product IS NULL OR product = @product)
GROUP BY sale_date, product
ORDER BY sale_date ASC;
