import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { appConfig } from '../config.js';
import { logger } from '../utils/logger.js';

let client: SupabaseClient | null = null;

export const getSupabaseServiceClient = (): SupabaseClient => {
  if (!appConfig.supabaseUrl || !appConfig.supabaseServiceRoleKey) {
    throw new Error('Supabase configuration is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (!client) {
    client = createClient(appConfig.supabaseUrl, appConfig.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
      },
    });
    logger.info('Initialized Supabase service client');
  }

  return client;
};
