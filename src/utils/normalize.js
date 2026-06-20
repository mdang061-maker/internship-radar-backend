function stripHtml(value = '') {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactList(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function normalizeMuseJob(job) {
  return {
    id: `muse_${job.id}`,
    source: 'The Muse',
    sourceKey: 'muse',
    externalId: String(job.id),
    title: job.name || 'Untitled role',
    company: job.company?.name || 'Unknown company',
    location: compactList((job.locations || []).map((item) => item.name)).join(', ') || 'Unknown',
    type: compactList((job.type ? [job.type] : []).concat((job.levels || []).map((item) => item.name))).join(', '),
    level: compactList((job.levels || []).map((item) => item.name)),
    category: compactList((job.categories || []).map((item) => item.name)),
    tags: compactList([
      ...(job.categories || []).map((item) => item.name),
      ...(job.levels || []).map((item) => item.name),
      ...(job.locations || []).map((item) => item.name)
    ]),
    remote: /remote/i.test(JSON.stringify(job.locations || [])),
    description: stripHtml(job.contents || ''),
    shortDescription: stripHtml(job.contents || '').slice(0, 240),
    applyUrl: job.refs?.landing_page || job.refs?.apply || null,
    sourceUrl: job.refs?.landing_page || null,
    postedAt: job.publication_date || null,
    metadata: {
      source: 'The Muse'
    }
  };
}

function normalizeRemoteOkJob(job) {
  return {
    id: `remoteok_${job.id}`,
    source: 'Remote OK',
    sourceKey: 'remoteok',
    externalId: String(job.id),
    title: job.position || 'Untitled role',
    company: job.company || 'Unknown company',
    location: job.location || 'Worldwide',
    type: job.employment_type || 'Remote',
    level: compactList([job.experience]),
    category: compactList(job.tags || []),
    tags: compactList(job.tags || []),
    remote: true,
    description: stripHtml(job.description || ''),
    shortDescription: stripHtml(job.description || '').slice(0, 240),
    applyUrl: job.apply_url || job.url || null,
    sourceUrl: job.url || null,
    postedAt: job.date || null,
    metadata: {
      salaryMin: job.salary_min || null,
      salaryMax: job.salary_max || null,
      logo: job.logo || null,
      source: 'Remote OK'
    }
  };
}

function normalizeGreenhouseJob(job, boardToken, boardCompany) {
  const departments = compactList((job.departments || []).map((item) => item.name));

  return {
    id: `greenhouse_${boardToken}_${job.id}`,
    source: 'Greenhouse',
    sourceKey: 'greenhouse',
    externalId: String(job.id),
    title: job.title || 'Untitled role',
    company: boardCompany || job.company_name || boardToken,
    location: job.location?.name || 'Unknown',
    type: 'Unknown',
    level: [],
    category: departments,
    tags: compactList([
      ...departments,
      job.location?.name,
      boardCompany
    ]),
    remote: /remote/i.test(job.location?.name || '') || /remote/i.test(stripHtml(job.content || '')),
    description: stripHtml(job.content || ''),
    shortDescription: stripHtml(job.content || '').slice(0, 240),
    applyUrl: job.absolute_url || null,
    sourceUrl: job.absolute_url || null,
    postedAt: job.updated_at || null,
    metadata: {
      boardToken,
      source: 'Greenhouse'
    }
  };
}

module.exports = {
  stripHtml,
  compactList,
  normalizeMuseJob,
  normalizeRemoteOkJob,
  normalizeGreenhouseJob
};
