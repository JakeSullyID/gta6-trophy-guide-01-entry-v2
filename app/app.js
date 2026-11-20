// Main frontend script managing UI state, persistence, and rendering for the trophy guide

const STORAGE_KEY = 'leonida-trophy-guide-v1';

let state = {
  trophies: [],
  roadmap: null,
  earned: new Set(),
  counts: {},
  spoiler: false,
  selectedId: 1,
  activeTab: 'checklist',
  searchQuery: '',
  kindFilter: 'all',
  gradeFilter: 'all',
  earnedOnly: false
};

export async function loadData() {
  try {
    const [trophyRes, roadmapRes] = await Promise.all([
      fetch('data/trophies.json'),
      fetch('data/roadmap.json')
    ]);
    const trophyData = await trophyRes.json();
    state.trophies = trophyData.trophies;
    state.roadmap = await roadmapRes.json();
  } catch (err) {
    console.error('Failed to load local data files:', err);
  }
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.earned)) {
          state.earned = new Set(parsed.earned);
        }
        if (parsed.counts && typeof parsed.counts === 'object') {
          state.counts = parsed.counts;
        }
        if (typeof parsed.spoiler === 'boolean') {
          state.spoiler = parsed.spoiler;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load progress from localStorage:', err);
  }
}

export function saveProgress() {
  try {
    const data = {
      version: 1,
      earned: [...state.earned],
      counts: state.counts,
      spoiler: state.spoiler
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save progress to localStorage:', err);
  }
}

export function renderHeader() {
  const total = state.trophies.length;
  const earnedCount = state.earned.size;
  const pct = total > 0 ? Math.round((earnedCount / total) * 100) : 0;

  document.getElementById('progress-text').textContent = `${earnedCount} of ${total} earned`;
  document.getElementById('progress-pct').textContent = `(${pct}%)`;
  document.getElementById('progress-bar').style.width = `${pct}%`;

  // Aggregate statistics across trophy categories using exact keys
  const kindCounts = {};
  const kindTotals = {};
  for (const t of state.trophies) {
    const k = t.kind;
    kindTotals[k] = (kindTotals[k] || 0) + 1;
    if (state.earned.has(t.name)) {
      kindCounts[k] = (kindCounts[k] || 0) + 1;
    }
  }

  const kindChipsContainer = document.getElementById('kind-chips');
  kindChipsContainer.replaceChildren();
  
  // Desired order of kinds
  const displayKinds = ['story', 'missable', 'collectible', 'activity', 'platinum'];
  for (const k of displayKinds) {
    const got = kindCounts[k] || 0;
    const tot = kindTotals[k] || 0;
    if (tot === 0) continue;
    const chip = document.createElement('div');
    chip.className = 'kind-chip';
    chip.textContent = `${k}: ${got}/${tot}`;
    kindChipsContainer.append(chip);
  }
}

export function renderList() {
  const listEl = document.getElementById('trophy-list');
  listEl.replaceChildren();

  const filtered = applyFilters();

  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-detail';
    li.textContent = 'No trophies match the current filters.';
    listEl.append(li);
    return;
  }

  for (const t of filtered) {
    const li = document.createElement('li');
    li.className = `trophy-row ${t.id === state.selectedId ? 'selected' : ''}`;
    li.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      selectTrophy(t.id);
    });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.earned.has(t.name);
    checkbox.title = 'Mark earned';
    checkbox.addEventListener('change', () => {
      toggleEarned(t.name, checkbox.checked);
    });

    const dot = document.createElement('div');
    dot.className = `medal-dot ${t.grade}`;

    const info = document.createElement('div');
    info.className = 'trophy-summary-info';

    const mainLine = document.createElement('div');
    mainLine.className = 'trophy-main-line';

    const titleEl = document.createElement('span');
    titleEl.className = 'trophy-title';
    const isHidden = state.spoiler && t.kind === 'story' && !state.earned.has(t.name);
    titleEl.textContent = isHidden ? 'Hidden story trophy' : t.name;

    mainLine.append(titleEl);

    // Badges
    const badgeRow = document.createElement('div');
    badgeRow.className = 'badge-row';

    const kindBadge = document.createElement('span');
    kindBadge.className = 'tag-badge';
    kindBadge.textContent = t.kind;
    badgeRow.append(kindBadge);

    if (t.missable) {
      const missableBadge = document.createElement('span');
      missableBadge.className = 'tag-badge missable-badge';
      missableBadge.textContent = 'Missable';
      badgeRow.append(missableBadge);
    }

    if (t.target !== null && t.target_label) {
      const currentCount = state.counts[t.name] || 0;
      const targetPill = document.createElement('span');
      targetPill.className = 'target-pill';
      targetPill.textContent = `${currentCount} / ${t.target} ${t.target_label}`;
      badgeRow.append(targetPill);
    }

    mainLine.append(badgeRow);

    const descEl = document.createElement('span');
    descEl.className = 'trophy-desc';
    descEl.textContent = isHidden ? 'Earn this trophy to reveal its name and description.' : t.description;

    info.append(mainLine, descEl);
    li.append(checkbox, dot, info);
    listEl.append(li);
  }
}

export function renderDetail() {
  const pane = document.getElementById('detail-pane');
  pane.replaceChildren();

  const trophy = state.trophies.find(t => t.id === state.selectedId);
  if (!trophy) {
    const div = document.createElement('div');
    div.className = 'empty-detail';
    div.textContent = 'Select a trophy from the list to view its guide and details.';
    pane.append(div);
    return;
  }

  const isHidden = state.spoiler && trophy.kind === 'story' && !state.earned.has(trophy.name);

  const container = document.createElement('div');
  container.className = 'detail-content';

  const header = document.createElement('div');
  header.className = 'detail-header';

  const dot = document.createElement('div');
  dot.className = `medal-dot ${trophy.grade}`;

  const gradeSpan = document.createElement('span');
  gradeSpan.className = `detail-grade ${trophy.grade}`;
  gradeSpan.textContent = `${trophy.grade} trophy`;

  header.append(dot, gradeSpan);

  const titleEl = document.createElement('h2');
  titleEl.className = 'detail-title';
  titleEl.textContent = isHidden ? 'Hidden story trophy' : trophy.name;

  const descEl = document.createElement('p');
  descEl.className = 'detail-desc';
  descEl.textContent = isHidden ? 'Earn this trophy to reveal its name and description.' : trophy.description;

  container.append(header, titleEl, descEl);

  // Missable box
  if (trophy.missable && trophy.missable_reason) {
    const missBox = document.createElement('div');
    missBox.className = 'highlight-box';
    missBox.innerHTML = `<strong>Missable Warning:</strong> ${trophy.missable_reason}`;
    container.append(missBox);
  }

  // Numeric Target Stepper
  if (trophy.target !== null) {
    const currentCount = state.counts[trophy.name] || 0;
    const stepperBox = document.createElement('div');
    stepperBox.className = 'stepper-box';

    const label = document.createElement('div');
    label.className = 'stepper-label';
    label.textContent = `Progress: ${trophy.target_label || 'count'} (Target: ${trophy.target})`;

    const controls = document.createElement('div');
    controls.className = 'stepper-controls';

    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'stepper-btn';
    minusBtn.textContent = '-';
    minusBtn.addEventListener('click', () => {
      const newVal = Math.max(0, (state.counts[trophy.name] || 0) - 1);
      setCount(trophy.name, newVal, trophy.target);
    });

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'stepper-input';
    input.value = currentCount;
    input.min = 0;
    input.max = trophy.target * 2;
    input.addEventListener('change', () => {
      const val = parseInt(input.value, 10);
      if (!isNaN(val)) {
        setCount(trophy.name, Math.max(0, val), trophy.target);
      }
    });

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'stepper-btn';
    plusBtn.textContent = '+';
    plusBtn.addEventListener('click', () => {
      const newVal = (state.counts[trophy.name] || 0) + 1;
      setCount(trophy.name, newVal, trophy.target);
    });

    controls.append(minusBtn, input, plusBtn);
    stepperBox.append(label, controls);
    container.append(stepperBox);
  }

  // Guide
  if (trophy.guide) {
    const guideHeading = document.createElement('h3');
    guideHeading.style.fontSize = '1.1rem';
    guideHeading.style.marginTop = '4px';
    guideHeading.textContent = 'Guide & Method';

    const guideEl = document.createElement('div');
    guideEl.className = 'guide-text';
    guideEl.textContent = trophy.guide;

    container.append(guideHeading, guideEl);
  }

  // Sources list for this trophy
  if (trophy.sources && trophy.sources.length > 0) {
    const sourcesHeading = document.createElement('h3');
    sourcesHeading.style.fontSize = '1.1rem';
    sourcesHeading.style.marginTop = '4px';
    sourcesHeading.textContent = 'Sources & References';

    const sourcesUl = document.createElement('ul');
    sourcesUl.className = 'sources-list-pane';

    for (const src of trophy.sources) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = src.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = src.name;

      const span = document.createElement('span');
      span.textContent = ` — covers: ${src.covers}`;
      
      li.append(a, span);
      sourcesUl.append(li);
    }

    container.append(sourcesHeading, sourcesUl);
  }

  pane.append(container);
}

export function renderRoadmap() {
  const container = document.getElementById('roadmap-content');
  container.replaceChildren();

  const r = state.roadmap;
  if (!r) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'roadmap-overview';

  const title = document.createElement('h2');
  title.className = 'stage-heading';
  title.textContent = r.title;

  const metaGrid = document.createElement('div');
  metaGrid.className = 'roadmap-meta-grid';

  const metaItems = [
    { label: 'Difficulty', value: r.difficulty },
    { label: 'Estimated Time', value: r.hours },
    { label: 'Playthroughs', value: r.playthroughs }
  ];

  for (const mi of metaItems) {
    const card = document.createElement('div');
    card.className = 'meta-card';
    card.innerHTML = `<div class="meta-label">${mi.label}</div><div class="meta-value">${mi.value}</div>`;
    metaGrid.append(card);
  }

  wrapper.append(title, metaGrid);
  container.append(wrapper);

  const stagesContainer = document.createElement('div');
  stagesContainer.className = 'stages-container';

  let totalStageEarned = 0;
  let totalStageCount = 0;

  for (const stage of r.stages) {
    const stageCard = document.createElement('div');
    stageCard.className = 'stage-card';

    const header = document.createElement('div');
    header.className = 'stage-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'stage-title-group';
    titleGroup.innerHTML = `
      <span class="stage-number">Stage ${stage.number}</span>
      <h3 class="stage-heading">${stage.title}</h3>
    `;

    const hoursBadge = document.createElement('span');
    hoursBadge.className = 'stage-hours-badge';
    hoursBadge.textContent = stage.hours;

    header.append(titleGroup, hoursBadge);

    const summary = document.createElement('p');
    summary.className = 'stage-summary';
    summary.textContent = stage.summary;

    // Count stage earned
    let stageEarned = 0;
    for (const name of stage.trophy_names) {
      if (state.earned.has(name)) stageEarned++;
    }
    totalStageEarned += stageEarned;
    totalStageCount += stage.trophy_names.length;

    const progressLine = document.createElement('div');
    progressLine.className = 'stage-progress-line';
    progressLine.textContent = `${stageEarned} of ${stage.trophy_names.length} earned in this stage`;

    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'stage-trophies-chips';

    for (const name of stage.trophy_names) {
      const trophyObj = state.trophies.find(t => t.name === name);
      const isEarned = state.earned.has(name);

      const chip = document.createElement('div');
      chip.className = `trophy-chip ${isEarned ? 'earned' : ''}`;

      const dot = document.createElement('div');
      dot.className = `medal-dot ${trophyObj ? trophyObj.grade : 'bronze'}`;

      const span = document.createElement('span');
      span.textContent = name;

      chip.append(dot, span);
      if (trophyObj) {
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', () => {
          selectTrophy(trophyObj.id);
          switchTab('checklist');
        });
      }
      chipsContainer.append(chip);
    }

    const tip = document.createElement('div');
    tip.className = 'stage-tip';
    tip.textContent = `Tip: ${stage.tip}`;

    stageCard.append(header, summary, progressLine, chipsContainer, tip);
    stagesContainer.append(stageCard);
  }

  container.append(stagesContainer);

  // Platinum card
  const platTrophy = state.trophies.find(t => t.grade === 'platinum');
  const isPlatEarned = platTrophy ? state.earned.has(platTrophy.name) : false;

  const platCard = document.createElement('div');
  platCard.className = 'platinum-card';
  platCard.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div class="medal-dot platinum"></div>
      <h3 class="stage-heading">${platTrophy ? platTrophy.name : 'Vice Got a Price!'}</h3>
    </div>
    <p class="stage-summary">Earn the other 54 trophies to unlock the platinum trophy. Total estimate: ${r.hours}, difficulty ${r.difficulty}.</p>
    <div class="stage-progress-line">${isPlatEarned ? 'Platinum Earned!' : 'Pending completion of all other 54 trophies'}</div>
  `;
  container.append(platCard);
}

export function renderMissables() {
  const container = document.getElementById('missables-content');
  container.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.className = 'missables-container';

  // Prominent card for Positive Mental Attitude
  const pma = state.trophies.find(t => t.name === 'Positive Mental Attitude');
  const pmaEarned = pma ? state.earned.has(pma.name) : false;

  const prominent = document.createElement('div');
  prominent.className = 'prominent-card';
  prominent.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div class="medal-dot ${pma ? pma.grade : 'bronze'}"></div>
      <div>
        <span class="tag-badge missable-badge">Critical Missable</span>
        <h2 class="stage-heading" style="margin-top: 4px;">${pma ? pma.name : 'Positive Mental Attitude'}</h2>
      </div>
    </div>
    <div class="highlight-box">
      <strong>Missable Reason:</strong> ${pma ? pma.missable_reason : 'Perform the Chapter 1 balcony meditation while you can.'}
    </div>
    <p class="stage-summary">${pma ? pma.guide : ''}</p>
    <div style="display: flex; align-items: center; gap: 10px;">
      <button class="btn" type="button" id="go-to-pma">View in Checklist</button>
      <span style="font-size: 0.85rem; color: var(--text-muted);">${pmaEarned ? 'Status: Earned' : 'Status: Not Earned'}</span>
    </div>
  `;
  wrapper.append(prominent);

  // Save advice box
  const saveBox = document.createElement('div');
  saveBox.className = 'save-advice-box';
  saveBox.innerHTML = `
    <h3 class="stage-heading">Save Advice & Strategy</h3>
    <p class="stage-summary">The game has no mission replay and supports manual saves in 15 slots plus 1 autosave slot. To safeguard your 100% completion and prevent lockouts, keep a dedicated manual save at the start and end of each chapter. Remember that activating cheats disables both trophy progression and saving.</p>
  `;
  wrapper.append(saveBox);

  // Reassurance list for other trophies
  const reassurance = document.createElement('div');
  reassurance.className = 'reassurance-list';
  reassurance.innerHTML = `<h3 class="stage-heading">Free-Roam Availability</h3><p class="stage-summary">Every other trophy in Leonida stays available in free-roam after completing the story:</p>`;

  const otherMissables = state.trophies.filter(t => t.missable && t.name !== 'Positive Mental Attitude');
  const ul = document.createElement('ul');
  ul.className = 'reassurance-items';

  for (const t of otherMissables) {
    const li = document.createElement('li');
    li.className = 'reassurance-item';
    li.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span class="reassurance-name">${t.name}</span>
        <span class="tag-badge" style="cursor: pointer;" data-id="${t.id}">View details</span>
      </div>
      <span class="reassurance-reason">${t.missable_reason}</span>
    `;
    li.querySelector('.tag-badge').addEventListener('click', () => {
      selectTrophy(t.id);
      switchTab('checklist');
    });
    ul.append(li);
  }

  reassurance.append(ul);
  wrapper.append(reassurance);
  container.append(wrapper);

  // Wire prominent button
  const pmaBtn = prominent.querySelector('#go-to-pma');
  if (pmaBtn && pma) {
    pmaBtn.addEventListener('click', () => {
      selectTrophy(pma.id);
      switchTab('checklist');
    });
  }
}

export function renderSources() {
  const container = document.getElementById('sources-content');
  container.replaceChildren();

  const r = state.roadmap;
  if (!r) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'sources-container';

  const title = document.createElement('h2');
  title.className = 'stage-heading';
  title.textContent = 'Guide Sources & References';

  const ul = document.createElement('ul');
  ul.className = 'sources-list-main';

  for (const src of r.sources) {
    const li = document.createElement('li');
    li.className = 'source-item';
    li.innerHTML = `
      <span class="source-name">${src.name}</span>
      <a class="source-link" href="${src.url}" target="_blank" rel="noopener">${src.url}</a>
      <span class="source-covers">Covers: ${src.covers}</span>
    `;
    ul.append(li);
  }

  const honesty = document.createElement('div');
  honesty.className = 'honesty-note';
  honesty.innerHTML = `<strong>Honesty & Accuracy Note:</strong> Two trophies (<em>Bad Luck, I Guess</em> and <em>Ten Pin</em>) currently have no published method or trigger condition verified by the community. True to our integrity standard, this guide states that explicitly rather than inventing speculative or false methods.`;

  wrapper.append(title, ul, honesty);
  container.append(wrapper);
}

export function applyFilters() {
  const query = state.searchQuery.toLowerCase();
  const kind = state.kindFilter;
  const grade = state.gradeFilter;
  const earnedOnly = state.earnedOnly;

  return state.trophies.filter(t => {
    if (query) {
      const matchName = t.name.toLowerCase().includes(query);
      const matchDesc = t.description.toLowerCase().includes(query);
      const matchGuide = t.guide && t.guide.toLowerCase().includes(query);
      if (!matchName && !matchDesc && !matchGuide) return false;
    }
    if (kind !== 'all' && t.kind !== kind) return false;
    if (grade !== 'all' && t.grade !== grade) return false;
    if (earnedOnly && !state.earned.has(t.name)) return false;
    return true;
  });
}

export function toggleEarned(name, isEarned) {
  if (isEarned) {
    state.earned.add(name);
  } else {
    state.earned.delete(name);
  }
  saveProgress();
  renderAll();
}

export function setCount(name, count, target) {
  state.counts[name] = count;
  if (target !== undefined && target !== null) {
    if (count >= target) {
      state.earned.add(name);
    } else {
      // Simple rule: dropping below unchecks it
      state.earned.delete(name);
    }
  }
  saveProgress();
  renderAll();
}

export function exportProgress() {
  try {
    const data = {
      version: 1,
      earned: [...state.earned],
      counts: state.counts,
      spoiler: state.spoiler
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leonida-trophy-progress.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error('Export failed:', err);
  }
}

export function importProgress(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && Array.isArray(parsed.earned)) {
        state.earned = new Set(parsed.earned);
        if (parsed.counts && typeof parsed.counts === 'object') {
          state.counts = parsed.counts;
        }
        if (typeof parsed.spoiler === 'boolean') {
          state.spoiler = parsed.spoiler;
          const btn = document.getElementById('spoiler-toggle');
          if (btn) {
            btn.textContent = `Spoiler shield: ${state.spoiler ? 'on' : 'off'}`;
            btn.classList.toggle('active-spoiler', state.spoiler);
          }
        }
        saveProgress();
        renderAll();
      } else {
        alert('Invalid progress file format. Expected an object with an earned array.');
      }
    } catch (err) {
      alert('Failed to parse JSON file.');
      console.error(err);
    }
  };
  reader.readAsText(file);
}

export function setSpoiler(on) {
  state.spoiler = on;
  const btn = document.getElementById('spoiler-toggle');
  if (btn) {
    btn.textContent = `Spoiler shield: ${on ? 'on' : 'off'}`;
    btn.classList.toggle('active-spoiler', on);
  }
  saveProgress();
  renderAll();
}

export function selectTrophy(id) {
  state.selectedId = id;
  renderList();
  renderDetail();
}

export function switchTab(tabName) {
  state.activeTab = tabName;
  for (const name of ['checklist', 'roadmap', 'missables', 'sources']) {
    const btn = document.getElementById(`tab-${name}`);
    const sec = document.getElementById(`section-${name}`);
    if (btn) btn.classList.toggle('active', name === tabName);
    if (sec) sec.classList.toggle('active', name === tabName);
  }
  if (tabName === 'roadmap') renderRoadmap();
  if (tabName === 'missables') renderMissables();
  if (tabName === 'sources') renderSources();
}

export function renderAll() {
  renderHeader();
  renderList();
  renderDetail();
  if (state.activeTab === 'roadmap') renderRoadmap();
  if (state.activeTab === 'missables') renderMissables();
  if (state.activeTab === 'sources') renderSources();
}

// Event Listeners setup
function initEvents() {
  // Tabs
  for (const name of ['checklist', 'roadmap', 'missables', 'sources']) {
    const btn = document.getElementById(`tab-${name}`);
    if (btn) {
      btn.addEventListener('click', () => switchTab(name));
    }
  }

  // Search & Filters
  const searchInput = document.getElementById('search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderList();
    });
  }

  const kindFilter = document.getElementById('kind-filter');
  if (kindFilter) {
    kindFilter.addEventListener('change', (e) => {
      state.kindFilter = e.target.value;
      renderList();
    });
  }

  const gradeFilter = document.getElementById('grade-filter');
  if (gradeFilter) {
    gradeFilter.addEventListener('change', (e) => {
      state.gradeFilter = e.target.value;
      renderList();
    });
  }

  const earnedOnlyCheck = document.getElementById('earned-only');
  if (earnedOnlyCheck) {
    earnedOnlyCheck.addEventListener('change', (e) => {
      state.earnedOnly = e.target.checked;
      renderList();
    });
  }

  // Spoiler toggle
  const spoilerBtn = document.getElementById('spoiler-toggle');
  if (spoilerBtn) {
    spoilerBtn.addEventListener('click', () => {
      setSpoiler(!state.spoiler);
    });
  }

  // Export & Import
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportProgress);
  }

  const importInput = document.getElementById('import-input');
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importProgress(file);
        importInput.value = '';
      }
    });
  }
}

// Main Initialization
async function init() {
  await loadData();
  loadProgress();

  // Initial UI state for spoiler button
  const spoilerBtn = document.getElementById('spoiler-toggle');
  if (spoilerBtn) {
    spoilerBtn.textContent = `Spoiler shield: ${state.spoiler ? 'on' : 'off'}`;
    spoilerBtn.classList.toggle('active-spoiler', state.spoiler);
  }

  initEvents();
  renderAll();

  // Expose bridge for shots.js
  window.__trophyGuide = {
    state,
    renderAll,
    switchTab,
    setSpoiler,
    selectTrophy,
    toggleEarned,
    setCount
  };

  // Set readiness flag for screenshot script
  window.__shotReady = true;
}

init();
