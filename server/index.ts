import { createApp } from './app.js';
import { env, requireJwtSecret } from './config/env.js';

requireJwtSecret();

const app = createApp();

app.listen(env.port, () => {
  console.log(`bunnyfit API listening on port ${env.port} (${env.nodeEnv})`);
});
