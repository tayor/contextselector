import { initializeDb } from '../lib/db';

async function init() {
  try {
    await initializeDb();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

init(); 