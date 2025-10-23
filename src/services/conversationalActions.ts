import { buildForecastQuery } from './forecastQueryBuilder.js';
import { runForecastJob } from './forecastService.js';
import { saveForecastRun } from './forecastRepository.js';
import { getSupabaseServiceClient } from './supabaseClient.js';
import { logger } from '../utils/logger.js';

export type ConversationalAction = 'forecast' | 'simulate' | 'recall' | 'unknown';

export interface ActionResponse<T = unknown> {
  action: ConversationalAction;
  status: 'ok' | 'error';
  payload: T | null;
  humanMessage: string;
}

interface TimeframeResult {
  startDate: string;
  endDate: string;
  granularity: 'day' | 'month';
}

const CLASSIFIERS: Record<ConversationalAction, RegExp> = {
  forecast: /(forecast|predict|projection|estimate)/i,
  simulate: /(simulate|what if|scenario|impact|adjust)/i,
  recall: /(recall|past|previous|history|show)/i,
  unknown: /.^/, // never matches
};

const classifyAction = (text: string): ConversationalAction => {
  const entry = Object.entries(CLASSIFIERS).find(([action, regex]) => action !== 'unknown' && regex.test(text));
  return (entry?.[0] as ConversationalAction) ?? 'unknown';
};

const formatDate = (date: Date): string => date.toISOString().split('T')[0];

const startOfQuarter = (date: Date) => {
  const month = date.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
};

const addMonths = (date: Date, months: number) => {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
};

const parseTimeframe = (text: string): TimeframeResult => {
  const lower = text.toLowerCase();
  const now = new Date();

  if (/next quarter/.test(lower)) {
    const nextQuarterStart = addMonths(startOfQuarter(now), 3);
    return {
      startDate: formatDate(nextQuarterStart),
      endDate: formatDate(addMonths(nextQuarterStart, 3)),
      granularity: 'month',
    };
  }

  if (/next month/.test(lower)) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return {
      startDate: formatDate(start),
      endDate: formatDate(addMonths(start, 1)),
      granularity: 'day',
    };
  }

  const quarterMatch = lower.match(/q([1-4])\s*(20\d{2})/);
  if (quarterMatch) {
    const quarter = Number(quarterMatch[1]);
    const year = Number(quarterMatch[2]);
    const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
    return {
      startDate: formatDate(start),
      endDate: formatDate(addMonths(start, 3)),
      granularity: 'month',
    };
  }

  const yearMatch = lower.match(/(20\d{2})/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    const start = new Date(Date.UTC(year, 0, 1));
    return {
      startDate: formatDate(start),
      endDate: formatDate(new Date(Date.UTC(year + 1, 0, 1))),
      granularity: 'month',
    };
  }

  // Default: trailing 90 days
  const end = now;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 90);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
    granularity: 'day',
  };
};

const parseProduct = (text: string): string | undefined => {
  const match = text.match(/for ([\w\s-]+)/i);
  if (match) {
    return match[1].trim();
  }
  return undefined;
};

const safeSupabaseClient = () => {
  try {
    return getSupabaseServiceClient();
  } catch (error) {
    logger.warn('Supabase client unavailable', { error: String(error) });
    return null;
  }
};

const handleForecast = async (userText: string, userId: string): Promise<ActionResponse> => {
  const timeframe = parseTimeframe(userText);
  const product = parseProduct(userText);
  const sql = buildForecastQuery({
    startDate: timeframe.startDate,
    endDate: timeframe.endDate,
    product,
  });

  logger.info('Running conversational forecast', {
    userId,
    startDate: timeframe.startDate,
    endDate: timeframe.endDate,
    product,
  });

  const startedAt = new Date();
  const result = await runForecastJob({
    query: sql,
    params: {
      start_date: timeframe.startDate,
      end_date: timeframe.endDate,
      product: product ?? null,
    },
    labels: {
      action: 'forecast',
      requested_by: userId,
    },
  });

  const completedAt = new Date();

  try {
    await saveForecastRun({
      jobId: result.jobId,
      query: sql,
      requestedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      status: 'success',
      params: {
        product,
        startDate: timeframe.startDate,
        endDate: timeframe.endDate,
      },
      rows: result.rows,
      requestedBy: userId,
    });
  } catch (error) {
    logger.warn('Failed to persist forecast run from conversational handler', { error: String(error) });
  }

  return {
    action: 'forecast',
    status: 'ok',
    payload: {
      rows: result.rows,
      jobId: result.jobId,
      timeframe,
    },
    humanMessage: `Forecast ready for ${product ?? 'all products'} between ${timeframe.startDate} and ${timeframe.endDate}.`,
  };
};

const simulateAdjustment = (value: number, changePercent: number, direction: 'increase' | 'decrease'): number => {
  if (Number.isNaN(value)) return value;
  const factor = changePercent / 100;
  return direction === 'increase' ? value * (1 + factor) : value * (1 - factor);
};

const handleSimulation = async (userText: string, userId: string): Promise<ActionResponse> => {
  const percentageMatch = userText.match(/(increase|decrease)[^\d]*(\d+(?:\.\d+)?)%/i);
  const direction = percentageMatch?.[1]?.toLowerCase() === 'decrease' ? 'decrease' : 'increase';
  const percentage = percentageMatch ? Number(percentageMatch[2]) : 10;

  const supabase = safeSupabaseClient();
  if (!supabase) {
    return {
      action: 'simulate',
      status: 'error',
      payload: null,
      humanMessage: 'Simulation requires Supabase connectivity to fetch the last forecast run.',
    };
  }

  const { data, error } = await supabase
    .from('forecast_runs')
    .select('rows')
    .eq('requested_by', userId)
    .order('requested_at', { ascending: false })
    .limit(1);

  if (error || !data?.[0]) {
    return {
      action: 'simulate',
      status: 'error',
      payload: null,
      humanMessage: 'No recent forecast available to simulate. Run a forecast first.',
    };
  }

  const baselineRows = (data[0].rows as Array<Record<string, unknown>>) ?? [];
  const simulatedRows = baselineRows.map((row) => {
    const baseValue = Number(row.forecast_sum ?? row.forecast_revenue ?? row.total_revenue ?? row.revenue ?? 0);
    const simulatedValue = simulateAdjustment(baseValue, percentage, direction);
    return {
      ...row,
      simulated_revenue: Number(simulatedValue.toFixed(2)),
      adjustment_percent: direction === 'increase' ? percentage : -percentage,
    };
  });

  return {
    action: 'simulate',
    status: 'ok',
    payload: {
      simulatedRows,
      changePercent: direction === 'increase' ? percentage : -percentage,
    },
    humanMessage: `Applied a ${direction} of ${percentage}% to the most recent forecast results.`,
  };
};

const handleRecall = async (userId: string): Promise<ActionResponse> => {
  const supabase = safeSupabaseClient();
  if (!supabase) {
    return {
      action: 'recall',
      status: 'error',
      payload: null,
      humanMessage: 'Unable to access forecast history because Supabase credentials are not configured.',
    };
  }

  const { data, error } = await supabase
    .from('forecast_runs')
    .select('job_id, requested_at, status, rows')
    .eq('requested_by', userId)
    .order('requested_at', { ascending: false })
    .limit(5);

  if (error) {
    logger.error('Failed to recall forecast history', { error: error.message });
    return {
      action: 'recall',
      status: 'error',
      payload: null,
      humanMessage: 'Could not retrieve your past forecasts right now.',
    };
  }

  return {
    action: 'recall',
    status: 'ok',
    payload: data,
    humanMessage: `Found ${data?.length ?? 0} recent forecasts for your account.`,
  };
};

export const handleUserRequest = async (userText: string, userId: string): Promise<ActionResponse> => {
  const action = classifyAction(userText);

  try {
    switch (action) {
      case 'forecast':
        return await handleForecast(userText, userId);
      case 'simulate':
        return await handleSimulation(userText, userId);
      case 'recall':
        return await handleRecall(userId);
      default:
        return {
          action: 'unknown',
          status: 'error',
          payload: null,
          humanMessage: "I couldn't match that request to a known action. Try asking for a forecast, simulation, or your previous runs.",
        };
    }
  } catch (error) {
    logger.error('Conversational action handler failed', { error: String(error), action });
    return {
      action,
      status: 'error',
      payload: null,
      humanMessage: 'Something went wrong while processing your request. Please try again.',
    };
  }
};

export const promptTemplates = {
  forecast: `You are preparing parameters for a demand forecast. Extract product name, timeframe (start & end dates), and any filters from: "{{user_text}}".`,
  simulate: `You are preparing a simulation scenario. Identify the direction (increase/decrease) and the percentage change from: "{{user_text}}".`,
  recall: `You are preparing a recall request. Determine what historical results the user is seeking from: "{{user_text}}".`,
};
