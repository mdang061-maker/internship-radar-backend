const app = require('./app');
const { refreshJobs } = require('./services/jobAggregatorService');

const PORT = Number(process.env.PORT) || 4000;

async function bootstrap() {
  try {
    await refreshJobs();
    console.log('Initial job cache warmed up');
  } catch (error) {
    console.warn('Could not warm job cache on startup:', error.message);
  }

  app.listen(PORT, () => {
    console.log(`Internship Radar backend listening on http://localhost:${PORT}`);
  });
}

bootstrap();
