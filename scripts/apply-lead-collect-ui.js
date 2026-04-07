const fs = require('fs');
const path = require('path');
const appPath = path.join(__dirname, '..', 'public', 'app.js');
const fnPath = path.join(__dirname, 'lead-collect-tab-fn.js');
let s = fs.readFileSync(appPath, 'utf8');
const newFn = fs.readFileSync(fnPath, 'utf8');

const start = s.indexOf('async function loadLeadCollectTab() {');
const endMarker = '\nasync function loadReportsTab()';
const end = s.indexOf(endMarker);
if (start === -1 || end === -1) throw new Error('loadLeadCollectTab / loadReportsTab bounds not found');
s = s.slice(0, start) + newFn + s.slice(end);

if (!s.includes('let collectStatusPollTimer')) {
  s = s.replace(
    "const API = '/api';",
    `const API = '/api';
let collectStatusPollTimer = null;

function stopCollectStatusPoll() {
  if (collectStatusPollTimer) {
    clearInterval(collectStatusPollTimer);
    collectStatusPollTimer = null;
  }
}`
  );
}

if (!s.includes("if (tab !== 'lead_collect') stopCollectStatusPoll();")) {
  s = s.replace(
    /async function setActiveTab\(tab\) \{\r?\n  currentTab = tab;/,
    `async function setActiveTab(tab) {
  currentTab = tab;
  if (tab !== 'lead_collect') stopCollectStatusPoll();`
  );
}

fs.writeFileSync(appPath, s);
console.log('app.js lead collect UI applied');
