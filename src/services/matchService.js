function tokenize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/gi, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function uniqueTokens(values = []) {
  return [...new Set(values)];
}

function buildProfileCorpus(profile = {}, cv = {}) {
  return uniqueTokens([
    ...tokenize(profile.fullName),
    ...tokenize(profile.headline),
    ...tokenize(profile.bio),
    ...tokenize((profile.skills || []).join(' ')),
    ...tokenize((profile.preferredRoles || []).join(' ')),
    ...tokenize((profile.preferredLocations || []).join(' ')),
    ...tokenize(cv.text)
  ]);
}

function buildJobCorpus(job = {}) {
  return uniqueTokens([
    ...tokenize(job.title),
    ...tokenize(job.company),
    ...tokenize(job.location),
    ...tokenize(job.type),
    ...tokenize((job.level || []).join(' ')),
    ...tokenize((job.category || []).join(' ')),
    ...tokenize((job.tags || []).join(' ')),
    ...tokenize(job.description)
  ]);
}

function calculateMatchScore(job, profile = {}, cv = {}) {
  const profileTokens = buildProfileCorpus(profile, cv);
  const jobTokens = buildJobCorpus(job);
  const matchedKeywords = jobTokens.filter((token) => profileTokens.includes(token));

  const keywordCoverage = jobTokens.length ? matchedKeywords.length / jobTokens.length : 0;
  const roleOverlap = (profile.preferredRoles || []).some((role) =>
    job.title?.toLowerCase().includes(String(role).toLowerCase())
  )
    ? 0.2
    : 0;
  const locationOverlap = (profile.preferredLocations || []).some((location) => {
    const normalized = String(location).toLowerCase();
    return normalized === 'remote'
      ? job.remote
      : job.location?.toLowerCase().includes(normalized);
  })
    ? 0.15
    : 0;
  const skillsCoverage = (profile.skills || []).length
    ? matchedKeywords.filter((token) => (profile.skills || []).map((skill) => String(skill).toLowerCase()).includes(token))
        .length / profile.skills.length
    : 0;

  const rawScore = keywordCoverage * 0.55 + skillsCoverage * 0.3 + roleOverlap + locationOverlap;
  const score = Math.max(0, Math.min(100, Math.round(rawScore * 100)));
  const reasons = [];

  if (matchedKeywords.length) {
    reasons.push(`Khớp ${matchedKeywords.slice(0, 8).join(', ')}`);
  }

  if (roleOverlap) {
    reasons.push('Tiêu đề công việc gần với vai trò ưu tiên');
  }

  if (locationOverlap) {
    reasons.push('Khớp ưu tiên địa điểm hoặc remote');
  }

  if (!reasons.length) {
    reasons.push('Điểm được tính dựa trên mô tả công việc và hồ sơ hiện có');
  }

  return {
    score,
    matchedKeywords: uniqueTokens(matchedKeywords).slice(0, 15),
    reasons
  };
}

module.exports = {
  calculateMatchScore
};
