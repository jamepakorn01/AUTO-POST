const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'public', 'app.js');
let s = fs.readFileSync(p, 'utf8');
const old = `    if (items.length === 0) {
      container.innerHTML = listEmptyHtml();
      return;
    }

    container.innerHTML = '';
    const listTools = createListTools(
      currentTab,
      container,
      cfg.api,
      items,
      currentTab === 'assignments' ? { userMap, jobMap } : {}
    );`;
const neu = `    if (items.length === 0) {
      container.innerHTML = '';
      if (TAB_WITH_LIST_TOOLS.has(currentTab)) {
        const listToolsEmpty = createListTools(
          currentTab,
          container,
          cfg.api,
          items,
          currentTab === 'assignments' ? { userMap, jobMap } : {}
        );
        container.insertAdjacentHTML('beforeend', listEmptyHtml());
        listToolsEmpty?.applyBulkMode?.(BULK_MODE[currentTab]);
      } else {
        container.innerHTML = listEmptyHtml();
      }
      return;
    }

    container.innerHTML = '';
    const listTools = createListTools(
      currentTab,
      container,
      cfg.api,
      items,
      currentTab === 'assignments' ? { userMap, jobMap } : {}
    );`;
if (!s.includes(old)) {
  console.error('pattern not found');
  process.exit(1);
}
s = s.split(old).join(neu);
fs.writeFileSync(p, s, 'utf8');
console.log('ok');
