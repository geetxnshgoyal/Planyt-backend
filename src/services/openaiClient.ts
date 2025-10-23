import OpenAI from 'openai';
import { appConfig } from '../config.js';
import { logger } from '../utils/logger.js';

let client: OpenAI | null = null;

export const getOpenAiClient = (): OpenAI => {
  if (!appConfig.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is required to use embedding features.');
  }

  if (!client) {
    client = new OpenAI({ apiKey: appConfig.openAiApiKey });
    logger.info('Initialized OpenAI client');
  }

  return client;
};
