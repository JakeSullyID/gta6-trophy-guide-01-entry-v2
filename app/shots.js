// Initialize and configure state for automated screenshots

async function initShot() {
  const urlParams = new URLSearchParams(window.location.search);
  const shotType = urlParams.get('shot');
  if (!shotType) {
    window.__shotApplied = true;
    return;
  }

  // Poll for window.__shotReady up to 5 seconds (every 100ms)
  let attempts = 0;
  while (!window.__shotReady && attempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }

  const guide = window.__trophyGuide;
  if (!guide) {
    window.__shotApplied = true;
    return;
  }

  const { state, renderAll, switchTab, setSpoiler, selectTrophy } = guide;

  if (shotType === 'cover') {
    const earnedList = [
      'Just Like Paradise',
      'Paradise Lost',
      'Trust',
      'Baited My Tackle',
      'Stick Fiddler',
      'Whip It Good',
      'Treat Yo Self',
      'Master of None',
      'Top Fun',
      'Earn Cash, Not Kudos',
      'Personal Best',
      'The Goodtime State',
      'Let’s Go Bowling'
    ];
    state.earned = new Set(earnedList);
    state.counts['Cunning Stunts'] = 120;
    state.counts['Whip It Good'] = 64;
    state.counts['You WAiNKer!'] = 37;

    state.spoiler = false;
    const spoilerBtn = document.getElementById('spoiler-toggle');
    if (spoilerBtn) {
      spoilerBtn.textContent = 'Spoiler shield: off';
      spoilerBtn.classList.remove('active-spoiler');
    }

    const pma = state.trophies.find(t => t.name === 'Positive Mental Attitude');
    if (pma) {
      selectTrophy(pma.id);
    }

    switchTab('checklist');
    renderAll();
  } else if (shotType === 'roadmap') {
    switchTab('roadmap');
  } else if (shotType === 'missables') {
    switchTab('missables');
  } else if (shotType === 'spoiler') {
    state.earned = new Set();
    state.counts = {};
    setSpoiler(true);
    switchTab('checklist');
  }
  window.__shotApplied = true;
}

initShot();
