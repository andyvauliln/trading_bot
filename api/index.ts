import express from 'express';
import logsRouter from './logs-api';
import holdingsRouter from './bots-api';
import historicalDataRouter from './historical-wallet-data-api';
import { config } from './config';
import { exec } from 'child_process';
import * as net from 'net';
import logger from './logger';

const app = express();
const PORT = config.port;

app.use('/api', logsRouter);
app.use('/api', holdingsRouter);
app.use('/api', historicalDataRouter);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const findProcess = (port: number): Promise<string> => {
  return new Promise((resolve) => {
    exec(`lsof -i :${port} -t`, (error, stdout) => {
      resolve(stdout.trim());
    });
  });
};


const killProcess = (pid: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    exec(`kill -9 ${pid}`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

const isPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
};

const startServer = async () => {
  try {
    const portAvailable = await isPortAvailable(PORT);
    await logger.init();
    
    if (!portAvailable) {
      console.log(`${config.name}|[startServer]|Port ${PORT} is busy, attempting to free it...`);
      const pid = await findProcess(PORT);
      if (pid) {
        await killProcess(pid);
        console.log(`${config.name}|[startServer]|Killed process ${pid} using port ${PORT}`);
      }
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`${config.name}|[startServer]| Server is running on http://0.0.0.0:${PORT}`);
    }).on('error', async (e: any) => {
      if (e.code === 'EADDRINUSE') {
        console.log(`${config.name}|[startServer]|Port ${PORT} still in use, retrying in 1 second...`);
        setTimeout(startServer, 1000);
      }
    });
  } catch (error) {
    console.error(`${config.name}|[startServer]|Error starting server:`, error);
    process.exit(1);
  }
};

startServer(); 