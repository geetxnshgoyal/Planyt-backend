#!/usr/bin/env ts-node
import readline from 'readline';
import { handleUserRequest } from '../services/conversationalActions.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const userId = process.env.CONVERSATION_USER_ID ?? 'demo-user';

const ask = () => {
  rl.question('You: ', async (input) => {
    if (!input.trim()) {
      rl.close();
      return;
    }

    const response = await handleUserRequest(input, userId);
    console.log('Assistant:', response.humanMessage);
    console.log('Payload:', JSON.stringify(response.payload, null, 2));
    ask();
  });
};

console.log('Conversational Planning Demo -- ask about forecasts, simulations, or recall.');
ask();
