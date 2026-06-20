// Memory store cho Render - dữ liệu sẽ reset khi container restart
// Phù hợp cho backend free tier, dữ liệu có thể reset nhưng app vẫn chạy ổn

const state = {
  users: [],
  profiles: {},
  savedJobs: {},
  cvs: {},
  lastUsersWrite: null,
  lastProfilesWrite: null,
  lastSavedJobsWrite: null,
  lastCvsWrite: null
};

function getUsers() {
  return state.users;
}

function saveUsers(users) {
  state.users = users;
  state.lastUsersWrite = new Date().toISOString();
  return users;
}

function getProfiles() {
  return state.profiles;
}

function saveProfiles(profiles) {
  state.profiles = profiles;
  state.lastProfilesWrite = new Date().toISOString();
  return profiles;
}

function getSavedJobs() {
  return state.savedJobs;
}

function saveSavedJobs(savedJobs) {
  state.savedJobs = savedJobs;
  state.lastSavedJobsWrite = new Date().toISOString();
  return savedJobs;
}

function getCvs() {
  return state.cvs;
}

function saveCvs(cvs) {
  state.cvs = cvs;
  state.lastCvsWrite = new Date().toISOString();
  return cvs;
}

function getOrCreateDemoUser(userId = 'demo-user') {
  const users = getUsers();
  const existing = users.find((user) => user.id === userId);

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const demoUser = {
    id: userId,
    name: 'Demo Intern',
    email: `${userId}@internshipradar.local`,
    token: `demo-${userId}`,
    createdAt: now,
    updatedAt: now
  };

  users.push(demoUser);
  saveUsers(users);
  return demoUser;
}

// Export function cho compatibility với backend cũ
module.exports = {
  STORAGE_DIR: 'memory', // Thay đổi path thành memory để nhận biết
  getUsers,
  saveUsers,
  getProfiles,
  saveProfiles,
  getSavedJobs,
  saveSavedJobs,
  getCvs,
  saveCvs,
  getOrCreateDemoUser,
  // Helper để xem trạng thái memory store
  getMemoryStats: () => ({
    users: state.users.length,
    profiles: Object.keys(state.profiles).length,
    savedJobs: Object.keys(state.savedJobs).length,
    cvs: Object.keys(state.cvs).length,
    lastUsersWrite: state.lastUsersWrite,
    lastProfilesWrite: state.lastProfilesWrite,
    lastSavedJobsWrite: state.lastSavedJobsWrite,
    lastCvsWrite: state.lastCvsWrite
  })
};
