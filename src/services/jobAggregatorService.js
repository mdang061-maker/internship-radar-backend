const axios = require('axios');
const greenhouseBoards = require('../data/greenhouseBoards');
const {
  compactList,
  normalizeMuseJob,
  normalizeRemoteOkJob,
  normalizeGreenhouseJob
} = require('../utils/normalize');

const client = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Internship-Radar/1.0'
  }
});

const CACHE_TTL_MS = 5 * 60 * 1000;

const state = {
  jobs: [],
  fetchedAt: null,
  expiresAt: 0
};

async function fetchMuseJobs() {
  const pageNumbers = [1, 2];
  const responses = await Promise.allSettled(
    pageNumbers.map((page) =>
      client.get(`https://www.themuse.com/api/public/jobs?page=${page}&descending=true`)
    )
  );

  return responses
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value.data?.results || [])
    .map(normalizeMuseJob);
}

async function fetchRemoteOkJobs() {
  const response = await client.get('https://remoteok.com/api');
  const rows = Array.isArray(response.data) ? response.data.slice(1) : [];
  return rows.filter((item) => item && item.id && item.position).map(normalizeRemoteOkJob);
}

async function fetchGreenhouseJobs() {
  const results = await Promise.allSettled(
    greenhouseBoards.map((board) =>
      client
        .get(`https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`)
        .then((response) =>
          (response.data?.jobs || []).map((job) => normalizeGreenhouseJob(job, board.token, board.company))
        )
    )
  );

  return results
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);
}

async function refreshJobs() {
  const [muse, remoteOk, greenhouse] = await Promise.allSettled([
    fetchMuseJobs(),
    fetchRemoteOkJobs(),
    fetchGreenhouseJobs()
  ]);

  const jobs = [muse, remoteOk, greenhouse]
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .filter((job) => job && job.id);

  state.jobs = dedupeJobs(jobs);
  state.fetchedAt = new Date().toISOString();
  state.expiresAt = Date.now() + CACHE_TTL_MS;

  return state.jobs;
}

function dedupeJobs(jobs) {
  const seen = new Set();

  return jobs.filter((job) => {
    const key = `${job.sourceKey}:${job.externalId}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function getAllJobs({ forceRefresh = false } = {}) {
  if (!forceRefresh && state.jobs.length && Date.now() < state.expiresAt) {
    return state.jobs;
  }

  const jobs = await refreshJobs();

  if (!jobs.length && state.jobs.length) {
    return state.jobs;
  }

  return jobs;
}

async function getJobs(filters = {}) {
  const {
    search,
    source,
    location,
    page = 1,
    limit = 20,
    remote,
    forceRefresh = false
  } = filters;

  const jobs = await getAllJobs({ forceRefresh });
  const normalizedSearch = String(search || '').trim().toLowerCase();
  const normalizedSource = String(source || '').trim().toLowerCase();
  const normalizedLocation = String(location || '').trim().toLowerCase();
  const remoteOnly = String(remote || '').trim().toLowerCase() === 'true';

  let filtered = jobs.filter((job) => {
    const matchesSearch = !normalizedSearch
      || [job.title, job.company, job.location, job.description, ...(job.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    const matchesSource = !normalizedSource
      || job.sourceKey === normalizedSource
      || job.source.toLowerCase().includes(normalizedSource);
    const matchesLocation = !normalizedLocation || job.location.toLowerCase().includes(normalizedLocation);
    const matchesRemote = !remoteOnly || job.remote;

    return matchesSearch && matchesSource && matchesLocation && matchesRemote;
  });

  filtered = filtered.sort(
    (left, right) => new Date(right.postedAt || 0).getTime() - new Date(left.postedAt || 0).getTime()
  );

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const startIndex = (safePage - 1) * safeLimit;
  const items = filtered.slice(startIndex, startIndex + safeLimit);

  return {
    items,
    pagination: {
      total: filtered.length,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(filtered.length / safeLimit))
    },
    sources: compactList(jobs.map((job) => job.source)),
    cache: {
      fetchedAt: state.fetchedAt,
      expiresAt: new Date(state.expiresAt || Date.now()).toISOString()
    }
  };
}

async function getJobById(jobId) {
  const jobs = await getAllJobs();
  return jobs.find((job) => job.id === jobId) || null;
}

function getCacheMeta() {
  return {
    totalJobs: state.jobs.length,
    fetchedAt: state.fetchedAt,
    expiresAt: state.expiresAt ? new Date(state.expiresAt).toISOString() : null
  };
}

module.exports = {
  getAllJobs,
  getJobs,
  getJobById,
  getCacheMeta,
  refreshJobs
};
