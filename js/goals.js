// ============================================================
// goals.js — Savings goal tracker
// ============================================================

function saveGoal() {
  const name   = document.getElementById('goalName').value.trim();
  const amount = Number(document.getElementById('goalAmount').value);

  if (!name)              { alert('Please enter a goal name.');             return; }
  if (!amount || amount <= 0) { alert('Please enter a valid target amount.'); return; }

  // Save goal to localStorage
  const goal = { name, target: amount };
  localStorage.setItem('sf_goal', JSON.stringify(goal));
  if (typeof saveGoalToFirestore === 'function') saveGoalToFirestore(goal);

  // Clear inputs
  document.getElementById('goalName').value   = '';
  document.getElementById('goalAmount').value = '';

  refreshGoals();
}

function clearGoal() {
  if (!confirm('Clear your savings goal?')) return;
  localStorage.removeItem('sf_goal');
  // Also clear from Firestore so it doesn't reload on next login
  if (typeof firebase !== 'undefined') {
    var user = firebase.auth().currentUser;
    if (user) {
      firebase.firestore().collection('users').doc(user.uid).set({
        goal: null, updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  }
  refreshGoals();
}

function refreshGoals() {
  const goal     = JSON.parse(localStorage.getItem('sf_goal'))     || null;
  const expenses = JSON.parse(localStorage.getItem('sf_expenses')) || {};
  const el       = document.getElementById('goalProgressCard');
  if (!el) return;

  if (!goal) {
    el.innerHTML = `
      <div class="card">
        <div class="empty-state">
          <span class="empty-icon">🎯</span>
          <strong>No goal set yet</strong>
          <p>Set a savings goal above to track your progress</p>
        </div>
      </div>`;
    return;
  }

  // Savings progress = how much was logged under Savings category
  const saved  = expenses['Savings'] || 0;
  const target = goal.target;
  const pct    = Math.min(100, Math.round((saved / target) * 100));
  const remaining = Math.max(0, target - saved);
  const reached   = saved >= target;

  const barColor = reached ? 'var(--green)' : pct > 60 ? 'var(--primary)' : 'var(--primary-light)';

  el.innerHTML = `
    <div class="goal-card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-size:12px; font-weight:700; color:var(--primary); text-transform:uppercase; letter-spacing:0.5px;">
            🎯 Savings Goal
          </div>
          <div style="font-size:20px; font-weight:800; color:var(--text-dark); margin:4px 0;">
            ${goal.name}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:28px; font-weight:800; color:var(--primary);">${pct}%</div>
          <div style="font-size:11px; color:var(--text-light);">Complete</div>
        </div>
      </div>

      <div style="margin:20px 0 8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:13px; color:var(--text-mid);">Progress</span>
          <span style="font-size:13px; font-weight:600; color:var(--text-dark);">
            ${formatRs(saved)} / ${formatRs(target)}
          </span>
        </div>
        <div class="progress-bar-bg" style="height:12px;">
          <div class="progress-bar-fill green" style="width:${pct}%; background:${barColor}; height:12px; border-radius:99px; transition:width 0.8s ease;"></div>
        </div>
      </div>

      ${reached
        ? `<div class="insight-box good" style="margin-top:16px;">
            <span style="font-size:20px">🎉</span>
            <span><strong>Goal Achieved!</strong> You have reached your savings target of ${formatRs(target)}. Consider setting a new goal!</span>
           </div>`
        : `<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:16px;">
            <div style="background:white; border-radius:10px; padding:14px; text-align:center;">
              <div style="font-size:18px; font-weight:800; color:var(--green);">${formatRs(saved)}</div>
              <div style="font-size:11px; color:var(--text-light); margin-top:2px;">Saved so far</div>
            </div>
            <div style="background:white; border-radius:10px; padding:14px; text-align:center;">
              <div style="font-size:18px; font-weight:800; color:var(--primary);">${formatRs(remaining)}</div>
              <div style="font-size:11px; color:var(--text-light); margin-top:2px;">Still needed</div>
            </div>
           </div>
           <div style="font-size:12px; color:var(--text-mid); margin-top:12px; text-align:center;">
             💡 Log expenses under <strong>Savings</strong> category to update your progress
           </div>`
      }
    </div>`;
}
