const { calculateMatchScore } = require('./matchService');

function generateRecommendations({ jobs = [], profile = {}, cv = {}, savedJobs = [], limit = 10 }) {
  const savedJobIds = new Set(savedJobs.map((item) => item.jobId));

  return jobs
    .map((job) => {
      const match = calculateMatchScore(job, profile, cv);

      return {
        ...job,
        matchScore: match.score,
        matchedKeywords: match.matchedKeywords,
        reasons: match.reasons,
        isSaved: savedJobIds.has(job.id)
      };
    })
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }

      return new Date(right.postedAt || 0).getTime() - new Date(left.postedAt || 0).getTime();
    })
    .slice(0, limit);
}

function generateNotifications({ recommendations = [], savedJobs = [] }) {
  const now = Date.now();
  const messages = [];

  recommendations.slice(0, 5).forEach((job) => {
    if (job.matchScore >= 60) {
      messages.push({
        id: `notif_reco_${job.id}`,
        type: 'recommendation',
        title: 'Gợi ý công việc phù hợp',
        message: `${job.title} tại ${job.company} có match score ${job.matchScore}`,
        jobId: job.id,
        createdAt: new Date(now).toISOString()
      });
    }
  });

  savedJobs.slice(0, 5).forEach((item) => {
    messages.push({
      id: `notif_saved_${item.jobId}`,
      type: 'saved-job',
      title: 'Công việc đã lưu',
      message: `Bạn đã lưu ${item.title} tại ${item.company}`,
      jobId: item.jobId,
      createdAt: item.savedAt || new Date(now).toISOString()
    });
  });

  return messages.slice(0, 10);
}

module.exports = {
  generateRecommendations,
  generateNotifications
};
