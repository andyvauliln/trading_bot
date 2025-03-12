import express from 'express';
import logsRouter from './logs-api';
import holdingsRouter from './bots-api';
import { config } from './config';
import { exec } from 'child_process';
import * as net from 'net';

const app = express();
const PORT = config.port;

app.use('/api', logsRouter);
app.use('/api', holdingsRouter);
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
    
    if (!portAvailable) {
      console.log(`Port ${PORT} is busy, attempting to free it...`);
      const pid = await findProcess(PORT);
      if (pid) {
        await killProcess(pid);
        console.log(`Killed process ${pid} using port ${PORT}`);
      }
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    }).on('error', async (e: any) => {
      if (e.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} still in use, retrying in 1 second...`);
        setTimeout(startServer, 1000);
      }
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

startServer(); 