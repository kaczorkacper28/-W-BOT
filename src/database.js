const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'zw-data.json');

const DEFAULT_DATA = {
  nextServiceNumber: 1,
  personnel: {},
  applications: {},
  exams: {},
  settings: { logChannels: {} }
};

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
}
function load() {
  ensure();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      ...DEFAULT_DATA,
      ...parsed,
      personnel: parsed.personnel || {},
      applications: parsed.applications || {},
      exams: parsed.exams || {},
      settings: { ...DEFAULT_DATA.settings, ...(parsed.settings || {}) }
    };
  } catch { return structuredClone(DEFAULT_DATA); }
}
let data = load();
function save() { ensure(); fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function getPersonnel(id) { return data.personnel[id] || null; }
function setPersonnel(id, value) { data.personnel[id] = value; save(); return value; }
function nextNumber() { const n = data.nextServiceNumber++; save(); return `ŻW-${String(n).padStart(4, '0')}`; }
function createApplication(id, value) { data.applications[id] = value; save(); return value; }
function getApplication(id) { return data.applications[id] || null; }
function updateApplication(id, patch) { if (!data.applications[id]) return null; data.applications[id] = { ...data.applications[id], ...patch }; save(); return data.applications[id]; }
function allApplications() { return Object.values(data.applications); }
function createExam(id, value) { data.exams[id] = value; save(); return value; }
function getExam(id) { return data.exams[id] || null; }
function updateExam(id, patch) { if (!data.exams[id]) return null; data.exams[id] = { ...data.exams[id], ...patch }; save(); return data.exams[id]; }
function allExams() { return Object.values(data.exams); }
function setLogChannel(key, id) { data.settings.logChannels[key] = id; save(); }
function allPersonnel() { return Object.values(data.personnel); }

module.exports = { data, load, save, getPersonnel, setPersonnel, nextNumber, createApplication, getApplication, updateApplication, allApplications, createExam, getExam, updateExam, allExams, setLogChannel, allPersonnel };
