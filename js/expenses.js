// ============================================================
// expenses.js — Add expenses, update chart, health score
// ============================================================
 
let expenseChartInstance = null;
 
// ── BUDGET ALERT TOAST ────────────────────────────────────
function showBudgetAlert(category, pct) {
  var existing = document.getElementById('budgetAlertToast');
  if (existing) existing.remove();
 
  var isOver = pct >= 100;
  var icon   = isOver ? '🚨' : '⚠️';
  var color  = isOver ? '#EF4444' : '#F59E0B';
  var msg    = isOver
    ? category + ' budget is OVER! You have exceeded your limit.'
    : category + ' budget is at ' + pct + '%. Almost at the limit!';
 
  var toast = document.createElement('div');
  toast.id = 'budgetAlertToast';
  toast.style.cssText = [
    'position:fixed',
    'top:24px',
    'right:24px',
    'background:' + color,
    'color:white',
    'padding:14px 20px',
    'border-radius:12px',
    'font-size:14px',
    'font-weight:600',
    'z-index:9999',
    'box-shadow:0 4px 20px rgba(0,0,0,0.2)',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'max-width:340px',
    'animation:slideInRight 0.3s ease'
  ].join(';');
 
  toast.innerHTML = '<span style="font-size:20px">' + icon + '</span><span>' + msg + '</span>';
  document.body.appendChild(toast);
 
  setTimeout(function() {
    if (toast && toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s ease';
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 400);
    }
  }, 5000);
}
 
// ── CHECK BUDGET ALERTS ───────────────────────────────────
function checkBudgetAlerts(category, expenses, planned) {
  var spendCategories = ['Groceries', 'Bills', 'Healthcare', 'Education'];
  if (!spendCategories.includes(category)) return;
 
  var p = planned[category] || 0;
  var a = expenses[category] || 0;
  if (p === 0) return;
 
  var pct = Math.round((a / p) * 100);
  if (pct >= 80) showBudgetAlert(category, pct);
}
 
// ── ADD EXPENSE ───────────────────────────────────────────
function addExpense() {
  const amountInput   = document.getElementById('expenseAmount');
  const categoryInput = document.getElementById('expenseCategory');
  const noteInput     = document.getElementById('expenseNote');
  const msgEl         = document.getElementById('expenseMessage');
 
  const amount   = Number(amountInput.value);
  const category = categoryInput.value;
  const note     = noteInput.value.trim();
 
  if (!amount || amount <= 0) {
    msgEl.innerHTML = '<div class="alert alert-error show">Please enter a valid amount greater than 0.</div>';
    return;
  }
 
  // ── Save to sf_expenses ──
  let expenses = JSON.parse(localStorage.getItem('sf_expenses')) || {
    Groceries: 0, Bills: 0, Healthcare: 0, Education: 0, Savings: 0
  };
  expenses[category] = (expenses[category] || 0) + amount;
  localStorage.setItem('sf_expenses', JSON.stringify(expenses));
 
  if (typeof saveExpenseToFirestore === 'function') saveExpenseToFirestore(expenses);
 
  // ── Save to sf_transactions ──
  const now = new Date();
  const newTx = {
    id:       Date.now(),
    category: category,
    amount:   amount,
    note:     note || '—',
    date:     now.toLocaleDateString('en-PK'),
    time:     now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
  };
 
  let transactions = JSON.parse(localStorage.getItem('sf_transactions')) || [];
  transactions.unshift(newTx);
  localStorage.setItem('sf_transactions', JSON.stringify(transactions));
 
  if (typeof saveTransactionToFirestore === 'function') {
    saveTransactionToFirestore({ ...newTx, timestamp: now.toISOString() });
  }
 
  // ── Success message + clear inputs ──
  msgEl.innerHTML = `<div class="alert alert-success show">✅ Rs. ${amount.toLocaleString('en-PK')} added to ${category}!</div>`;
  amountInput.value = '';
  noteInput.value   = '';
 
  // ── Check budget alerts ──
  const planned = JSON.parse(localStorage.getItem('sf_planned')) || {};
  checkBudgetAlerts(category, expenses, planned);
 
  // ── Refresh ALL sections so nothing is stale ──
  refreshExpenses();
  refreshDashboard();
  refreshTransactions();                                          // FIX: was missing
  if (typeof refreshInsights === 'function') refreshInsights();  // keep insights in sync too
 
  setTimeout(() => { msgEl.innerHTML = ''; }, 3000);
}
 
// ── REFRESH EXPENSES SECTION ──────────────────────────────
function refreshExpenses() {
  const expenses = JSON.parse(localStorage.getItem('sf_expenses')) || {
    Groceries: 0, Bills: 0, Healthcare: 0, Education: 0, Savings: 0
  };
  const planned = JSON.parse(localStorage.getItem('sf_planned')) || {};
 
  updateExpenseChart(expenses);
  updateHealthScoreDisplay(expenses, planned);
  updateBudgetVsActual(planned, expenses);
 
  // FIX: keep transaction table in sync whenever expenses change
  if (typeof refreshTransactions === 'function') refreshTransactions();
}
 
// ── EXPENSE DOUGHNUT CHART ────────────────────────────────
function updateExpenseChart(expenses) {
  const ctx = document.getElementById('expenseChart');
  if (!ctx) return;
 
  const activeCategories = Object.keys(expenses).filter(k => expenses[k] > 0);
 
  if (activeCategories.length === 0) {
    if (expenseChartInstance) {
      expenseChartInstance.destroy();
      expenseChartInstance = null;
    }
    return;
  }
 
  if (expenseChartInstance) expenseChartInstance.destroy();
 
  expenseChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: activeCategories,
      datasets: [{
        data:            activeCategories.map(k => expenses[k]),
        backgroundColor: activeCategories.map(k => CATEGORY_COLORS[k]),
        borderWidth:     3,
        borderColor:     '#ffffff',
        hoverOffset:     8,
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      cutout:              '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 16, font: { size: 12 }, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ' ' + context.label + ': ' + formatRs(context.parsed);
            }
          }
        }
      }
    }
  });
}
 
// ── HEALTH SCORE DISPLAY ──────────────────────────────────
function updateHealthScoreDisplay(expenses, planned) {
  const el = document.getElementById('healthScoreDisplay');
  if (!el) return;
 
  const tp = Object.values(planned).reduce((a, b) => a + b, 0);
  const ta = Object.values(expenses).reduce((a, b) => a + b, 0);
 
  if (tp === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">💜</span>
        <strong>No budget set</strong>
        <p>Go to Dashboard and set your budget first</p>
      </div>`;
    return;
  }
 
  const spendCats = ['Groceries', 'Bills', 'Healthcare', 'Education'];
  const spendP    = spendCats.reduce((a, c) => a + (planned[c] || 0), 0);
  const spendA    = spendCats.reduce((a, c) => a + (expenses[c] || 0), 0);
  const remaining = Math.max(0, spendP - spendA);
  const score     = spendP > 0 ? Math.max(0, Math.min(100, Math.round((remaining / spendP) * 100))) : 0;
  const totalRemaining = Math.max(0, tp - ta);
  const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';
  const label = score >= 70 ? 'Low Risk 🟢' : score >= 40 ? 'Moderate Risk 🟡' : 'High Risk 🔴';
 
  el.innerHTML = `
    <div style="text-align:center; padding:20px 0;">
      <div style="font-size:52px; font-weight:800; color:${color}; letter-spacing:-2px; line-height:1;">
        ${score}%
      </div>
      <div style="font-size:16px; font-weight:700; color:${color}; margin:8px 0;">
        ${label}
      </div>
      <div style="font-size:13px; color:var(--text-light); margin-top:4px;">
        Remaining: ${formatRs(totalRemaining)}
      </div>
      <div style="font-size:12px; color:var(--text-light); margin-top:2px;">
        Spent ${formatRs(ta)} of ${formatRs(tp)}
      </div>
    </div>`;
}
 
// ── BUDGET VS ACTUAL PROGRESS BARS ───────────────────────
function updateBudgetVsActual(planned, expenses) {
  const el = document.getElementById('budgetVsActual');
  if (!el) return;
 
  const totalPlanned = Object.values(planned).reduce((a, b) => a + b, 0);
 
  if (totalPlanned === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📊</span>
        <strong>No budget set</strong>
        <p>Set your budget on Dashboard first</p>
      </div>`;
    return;
  }
 
  let html = '';
  for (const cat in planned) {
    const p         = planned[cat]  || 0;
    const a         = expenses[cat] || 0;
    const diff      = p - a;
    const isSavings = cat === 'Savings';
    const over      = diff < 0 && !isSavings;
    const pct       = p > 0 ? Math.min(100, Math.round((a / p) * 100)) : 0;
    const barClass  = over ? 'red' : isSavings ? 'green' : pct > 75 ? 'yellow' : 'green';
    const statusClass = over ? 'over' : 'ok';
    const statusText  = isSavings
      ? (a >= p ? `Great! Saved ${formatRs(a)} (target: ${formatRs(p)})` : `${formatRs(diff)} remaining to save`)
      : over
        ? `Over budget by ${formatRs(Math.abs(diff))}`
        : `${formatRs(diff)} remaining`;
 
    html += `
      <div class="progress-wrap">
        <div class="progress-header">
          <span class="progress-label">${CATEGORY_ICONS[cat]} ${cat}</span>
          <span class="progress-values">${formatRs(a)} / ${formatRs(p)}</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${barClass}" style="width:${pct}%"></div>
        </div>
        <div class="progress-status ${statusClass}">${statusText} (${pct}%)</div>
      </div>`;
  }
 
  el.innerHTML = html;
}