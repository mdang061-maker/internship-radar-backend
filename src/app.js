const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs/promises');
const path = require('path');
const {
  STORAGE_DIR,
  getUsers,
  saveUsers,
  getProfiles,
  saveProfiles,
  getSavedJobs,
  saveSavedJobs,
  getCvs,
  saveCvs,
  getOrCreateDemoUser
} = require('./services/storageService');
const { calculateMatchScore } = require('./services/matchService');
const { generateRecommendations, generateNotifications } = require('./services/recommendationService');
const { getJobs, getJobById, getCacheMeta } = require('./services/jobAggregatorService');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024
  }
});

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function pickUserIdFromRequest(req) {
  const authHeader = req.headers.authorization || '';

  if (authHeader.startsWith('Bearer demo-')) {
    return authHeader.replace('Bearer demo-', '').trim() || 'demo-user';
  }

  return req.headers['x-demo-user-id'] || 'demo-user';
}

async function attachDemoUser(req, res, next) {
  try {
    const userId = pickUserIdFromRequest(req);
    req.user = await getOrCreateDemoUser(userId);
    next();
  } catch (error) {
    next(error);
  }
}

function sanitizeFilename(fileName = 'cv.txt') {
  return fileName.replace(/[^a-z0-9._-]/gi, '_');
}

async function getUserContext(userId) {
  const [profiles, savedJobsMap, cvs] = await Promise.all([getProfiles(), getSavedJobs(), getCvs()]);

  return {
    profile: profiles[userId] || {
      userId,
      fullName: '',
      headline: '',
      bio: '',
      skills: [],
      preferredRoles: [],
      preferredLocations: [],
      updatedAt: null
    },
    savedJobs: savedJobsMap[userId] || [],
    cv: cvs[userId] || {
      userId,
      text: '',
      source: null,
      updatedAt: null
    }
  };
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Internship Radar backend is running'
  });
});

app.get('/api/health', asyncHandler(async (req, res) => {
  const users = await getUsers();

  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'internship-radar-backend',
      timestamp: new Date().toISOString(),
      cache: getCacheMeta(),
      storage: {
        users: users.length
      }
    }
  });
}));

app.post('/api/auth/demo-login', asyncHandler(async (req, res) => {
  const users = await getUsers();
  const name = String(req.body.name || 'Demo Intern').trim();
  const email = String(req.body.email || 'demo@internshipradar.local').trim().toLowerCase();
  let user = users.find((item) => item.email === email);
  const now = new Date().toISOString();

  if (!user) {
    const generatedId = email
      .split('@')[0]
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase() || 'demo-user';

    user = {
      id: generatedId,
      name,
      email,
      token: `demo-${generatedId}`,
      createdAt: now,
      updatedAt: now
    };
    users.push(user);
  } else {
    user.name = name || user.name;
    user.updatedAt = now;
  }

  await saveUsers(users);

  res.json({
    success: true,
    data: {
      user,
      token: user.token,
      usage: 'Gửi header Authorization: Bearer <token> hoặc x-demo-user-id'
    }
  });
}));

app.use('/api', attachDemoUser);

app.get('/api/jobs', asyncHandler(async (req, res) => {
  const result = await getJobs({
    search: req.query.search,
    source: req.query.source,
    location: req.query.location,
    remote: req.query.remote,
    page: req.query.page,
    limit: req.query.limit,
    forceRefresh: req.query.refresh === 'true'
  });

  res.json({
    success: true,
    data: result
  });
}));

app.get('/api/jobs/:jobId', asyncHandler(async (req, res) => {
  const job = await getJobById(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Không tìm thấy công việc'
    });
  }

  return res.json({
    success: true,
    data: job
  });
}));

app.get('/api/saved-jobs', asyncHandler(async (req, res) => {
  const context = await getUserContext(req.user.id);

  res.json({
    success: true,
    data: context.savedJobs
  });
}));

app.post('/api/saved-jobs', asyncHandler(async (req, res) => {
  const { jobId, notes = '' } = req.body;
  const job = await getJobById(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job không tồn tại'
    });
  }

  const savedJobsMap = await getSavedJobs();
  const userItems = savedJobsMap[req.user.id] || [];
  const existing = userItems.find((item) => item.jobId === jobId);

  if (existing) {
    existing.notes = notes;
    existing.savedAt = existing.savedAt || new Date().toISOString();
  } else {
    userItems.push({
      jobId: job.id,
      title: job.title,
      company: job.company,
      source: job.source,
      notes,
      savedAt: new Date().toISOString()
    });
  }

  savedJobsMap[req.user.id] = userItems;
  await saveSavedJobs(savedJobsMap);

  return res.status(existing ? 200 : 201).json({
    success: true,
    data: savedJobsMap[req.user.id]
  });
}));

app.delete('/api/saved-jobs/:jobId', asyncHandler(async (req, res) => {
  const savedJobsMap = await getSavedJobs();
  const userItems = savedJobsMap[req.user.id] || [];
  const nextItems = userItems.filter((item) => item.jobId !== req.params.jobId);

  savedJobsMap[req.user.id] = nextItems;
  await saveSavedJobs(savedJobsMap);

  res.json({
    success: true,
    data: nextItems
  });
}));

app.get('/api/profile', asyncHandler(async (req, res) => {
  const context = await getUserContext(req.user.id);

  res.json({
    success: true,
    data: context
  });
}));

app.put('/api/profile', asyncHandler(async (req, res) => {
  const profiles = await getProfiles();
  const previous = profiles[req.user.id] || {};

  const nextProfile = {
    userId: req.user.id,
    fullName: req.body.fullName ?? previous.fullName ?? req.user.name ?? '',
    headline: req.body.headline ?? previous.headline ?? '',
    bio: req.body.bio ?? previous.bio ?? '',
    skills: Array.isArray(req.body.skills)
      ? req.body.skills
      : String(req.body.skills || previous.skills || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    preferredRoles: Array.isArray(req.body.preferredRoles)
      ? req.body.preferredRoles
      : String(req.body.preferredRoles || previous.preferredRoles || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    preferredLocations: Array.isArray(req.body.preferredLocations)
      ? req.body.preferredLocations
      : String(req.body.preferredLocations || previous.preferredLocations || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    updatedAt: new Date().toISOString()
  };

  profiles[req.user.id] = nextProfile;
  await saveProfiles(profiles);

  res.json({
    success: true,
    data: nextProfile
  });
}));

app.post('/api/cv', upload.single('file'), asyncHandler(async (req, res) => {
  const textFromBody = String(req.body.text || '').trim();
  let text = textFromBody;
  let source = text ? 'text' : null;
  let savedFilePath = null;

  if (req.file) {
    text = req.file.buffer.toString('utf8').trim();
    source = 'file';
    const uploadDir = path.join(STORAGE_DIR, 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const fileName = `${Date.now()}_${sanitizeFilename(req.file.originalname || 'cv.txt')}`;
    savedFilePath = path.join(uploadDir, fileName);
    await fs.writeFile(savedFilePath, req.file.buffer);
  }

  if (!text) {
    return res.status(400).json({
      success: false,
      error: 'Cần gửi text hoặc file CV đơn giản'
    });
  }

  const cvs = await getCvs();
  const nextCv = {
    userId: req.user.id,
    text,
    source,
    filePath: savedFilePath,
    updatedAt: new Date().toISOString()
  };

  cvs[req.user.id] = nextCv;
  await saveCvs(cvs);

  res.status(201).json({
    success: true,
    data: {
      ...nextCv,
      preview: text.slice(0, 240)
    }
  });
}));

app.get('/api/match-score/:jobId', asyncHandler(async (req, res) => {
  const [job, context] = await Promise.all([
    getJobById(req.params.jobId),
    getUserContext(req.user.id)
  ]);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Không tìm thấy job'
    });
  }

  const match = calculateMatchScore(job, context.profile, context.cv);

  return res.json({
    success: true,
    data: {
      jobId: job.id,
      score: match.score,
      matchedKeywords: match.matchedKeywords,
      reasons: match.reasons
    }
  });
}));

app.get('/api/recommendations', asyncHandler(async (req, res) => {
  const [jobsResponse, context] = await Promise.all([
    getJobs({
      search: req.query.search,
      source: req.query.source,
      location: req.query.location,
      remote: req.query.remote,
      page: 1,
      limit: 100
    }),
    getUserContext(req.user.id)
  ]);

  const recommendations = generateRecommendations({
    jobs: jobsResponse.items,
    profile: context.profile,
    cv: context.cv,
    savedJobs: context.savedJobs,
    limit: Math.min(20, Number(req.query.limit) || 10)
  });

  res.json({
    success: true,
    data: recommendations
  });
}));

app.get('/api/notifications', asyncHandler(async (req, res) => {
  const [jobsResponse, context] = await Promise.all([
    getJobs({ page: 1, limit: 80 }),
    getUserContext(req.user.id)
  ]);

  const recommendations = generateRecommendations({
    jobs: jobsResponse.items,
    profile: context.profile,
    cv: context.cv,
    savedJobs: context.savedJobs,
    limit: 10
  });

  const notifications = generateNotifications({
    recommendations,
    savedJobs: context.savedJobs
  });

  res.json({
    success: true,
    data: notifications
  });
}));

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint không tồn tại'
  });
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  console.error(error);
  return res.status(500).json({
    success: false,
    error: error.message || 'Internal server error'
  });
});

module.exports = app;
