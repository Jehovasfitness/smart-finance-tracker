// ============================================================
// dashboard.js — Budget calculation, KPI cards, Charts
// ============================================================

// Category colors used in charts throughout the app
const CATEGORY_COLORS = {
  Groceries:   '#3B82F6',
  Bills:       '#F59E0B',
  Healthcare:  '#10B981',
  Education:   '#8B5CF6',
  Savings:     '#06B6D4',
};

const CATEGORY_ICONS = {
  Groceries:  '🛒',
  Bills:      '🧾',
  Healthcare: '🏥',
  Education:  '📚',
  Savings:    '💰',
};

// Budget percentages from FYP documentation
const BUDGET_PERCENTAGES = {
  Groceries:  0.25,
  Bills:      0.20,
  Healthcare: 0.15,
  Education:  0.15,
  Savings:    0.25,
};

let pieChartInstance = null;
let barChartInstance = null;

// Format number as Rs. currency
function formatRs(amount) {
  return 'Rs. ' + Math.round(amount).toLocaleString('en-PK');
}

// CALCULATE BUDGET — runs when user clicks Calculate
function calculateBudget() {
  const income    = Number(document.getElementById('incomeInput').value);
  const inflation = Number(document.getElementById('inflationInput').value);

  if (!income || income <= 0) {
    alert('Please enter a valid monthly income.');
    return;
  }

  // Adjust income for inflation: income × (1 + inflation/100)
  const adjustedIncome = income * (1 + inflation / 100);

  // Split into categories
  const planned = {};
  for (const cat in BUDGET_PERCENTAGES) {
    planned[cat] = adjustedIncome * BUDGET_PERCENTAGES[cat];
  }

  localStorage.setItem('sf_planned',   JSON.stringify(planned));
  localStorage.setItem('sf_income',    income);
  localStorage.setItem('sf_inflation', inflation);

  // Save to Firestore
  if (typeof saveBudgetToFirestore === 'function') saveBudgetToFirestore(income, inflation, planned);

  refreshDashboard();
}

// CLEAR ALL DATA
function clearAllData() {
  if (!confirm('This will clear all your data. Are you sure?')) return;
  localStorage.removeItem('sf_planned');
  localStorage.removeItem('sf_expenses');
  localStorage.removeItem('sf_transactions');
  localStorage.removeItem('sf_income');
  localStorage.removeItem('sf_inflation');
  localStorage.removeItem('sf_goal');
  localStorage.removeItem('sf_healthScore');
  // Clear from Firestore so old data doesn't reload on next login
  if (typeof clearAllDataFromFirestore === 'function') clearAllDataFromFirestore();
  // Also reset income/inflation input fields
  var incomeInput = document.getElementById('incomeInput');
  var inflationInput = document.getElementById('inflationInput');
  if (incomeInput) incomeInput.value = '';
  if (inflationInput) inflationInput.value = '';
  document.getElementById('incomeInput').value    = '';
  document.getElementById('inflationInput').value = '';
  refreshDashboard();
}

// REFRESH DASHBOARD — called on load and after any data change
function refreshDashboard() {
  const planned   = JSON.parse(localStorage.getItem('sf_planned'))   || {};
  const expenses  = JSON.parse(localStorage.getItem('sf_expenses'))  || {};
  const savedIncome    = localStorage.getItem('sf_income');
  const savedInflation = localStorage.getItem('sf_inflation');

  if (savedIncome)    document.getElementById('incomeInput').value    = savedIncome;
  if (savedInflation) document.getElementById('inflationInput').value = savedInflation;

  const totalPlanned = Object.values(planned).reduce((a, b) => a + b, 0);
  // Exclude Savings from spending total — saving money is GOOD, not spending
  const spendingCategories = ['Groceries', 'Bills', 'Healthcare', 'Education'];
  const spendingPlanned = spendingCategories.reduce((a, cat) => a + (planned[cat] || 0), 0);
  const totalActual     = Object.values(expenses).reduce((a, b) => a + b, 0);
  const spendingActual  = spendingCategories.reduce((a, cat) => a + (expenses[cat] || 0), 0);
  const remaining       = Math.max(0, spendingPlanned - spendingActual);

  let healthScore = 0;
  if (spendingPlanned > 0) {
    healthScore = Math.round((remaining / spendingPlanned) * 100);
    healthScore = Math.max(0, Math.min(100, healthScore));
  }

  localStorage.setItem('sf_healthScore', healthScore);

  // Update KPI cards
  const totalRemaining = Math.max(0, totalPlanned - totalActual);
  setKPI('plannedDisplay',   formatRs(totalPlanned));
  setKPI('actualDisplay',    formatRs(totalActual));
  setKPI('remainingDisplay', formatRs(totalRemaining));
  document.getElementById('healthDisplay').textContent = healthScore + '%';
  // Show correct sub-text: spending budget only (excluding savings)
  const hsRemaining = document.getElementById('hsRemainingText');
  if (hsRemaining) hsRemaining.textContent = 'Remaining: ' + formatRs(remaining) + ' | Spent: ' + formatRs(spendingActual) + ' of ' + formatRs(spendingPlanned);

  updateRiskBanner(healthScore, totalPlanned);
  updateBudgetBreakdown(planned, expenses);
  updatePieChart(planned);
  updateBarChart(planned, expenses);
  updateSmartInsight(healthScore, totalPlanned);
}

function setKPI(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => {
    el.textContent = value;
    el.style.transition = 'opacity 0.3s ease';
    el.style.opacity = '1';
  }, 150);
}

function updateRiskBanner(score, totalPlanned) {
  const banner = document.getElementById('riskBanner');
  const icon   = document.getElementById('riskIcon');
  const text   = document.getElementById('riskText');
  if (!banner) return;

  if (totalPlanned === 0) { banner.classList.add('hidden'); return; }

  banner.classList.remove('hidden', 'low', 'moderate', 'high');

  if (score >= 70) {
    banner.classList.add('low');
    icon.textContent = '✅';
    text.textContent = 'Low Financial Risk — Your budget is well managed. Keep it up!';
  } else if (score >= 40) {
    banner.classList.add('moderate');
    icon.textContent = '⚠️';
    text.textContent = 'Moderate Financial Risk — Monitor your spending carefully.';
  } else {
    banner.classList.add('high');
    icon.textContent = '🚨';
    text.textContent = 'High Financial Risk — You are close to or over budget. Reduce spending now.';
  }
}

function updateBudgetBreakdown(planned, expenses) {
  const el = document.getElementById('budgetBreakdown');
  if (!el) return;
  const totalPlanned = Object.values(planned).reduce((a, b) => a + b, 0);

  if (totalPlanned === 0) {
    el.innerHTML = '<div class="empty-state"><span class="empty-icon">📋</span><strong>No budget set yet</strong><p>Enter your income above and click Calculate</p></div>';
    return;
  }

  let html = '';
  for (const cat in planned) {
    const p   = planned[cat]  || 0;
    const a   = expenses[cat] || 0;
    const pct = Math.round((p / totalPlanned) * 100);
    const diff      = p - a;
    const isSavCat  = cat === 'Savings';
    const over      = diff < 0 && !isSavCat;
    html += `
      <div class="breakdown-item">
        <div class="breakdown-left">
          <div class="breakdown-dot" style="background:${CATEGORY_COLORS[cat]}"></div>
          <div>
            <div class="breakdown-name">${CATEGORY_ICONS[cat]} ${cat}</div>
            <div style="font-size:11px;color:var(--text-light)">
              ${isSavCat ? 'Saved' : 'Spent'}: ${formatRs(a)}
              ${isSavCat
                ? `<span class="text-green"> · ${a >= p ? '🏆 Target reached!' : formatRs(Math.abs(diff)) + ' more to save'}</span>`
                : over
                  ? `<span class="text-red"> · Over by ${formatRs(Math.abs(diff))}</span>`
                  : `<span class="text-green"> · ${formatRs(diff)} left</span>`}
            </div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="breakdown-amount">${formatRs(p)}</div>
          <div class="breakdown-pct">${pct}% of budget</div>
        </div>
      </div>`;
  }
  el.innerHTML = html;
}

function updatePieChart(planned) {
  const ctx = document.getElementById('pieChart');
  if (!ctx) return;
  if (Object.values(planned).reduce((a, b) => a + b, 0) === 0) return;
  if (pieChartInstance) pieChartInstance.destroy();

  pieChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(planned),
      datasets: [{
        data:            Object.values(planned),
        backgroundColor: Object.keys(planned).map(k => CATEGORY_COLORS[k]),
        borderWidth:     3,
        borderColor:     '#ffffff',
        hoverOffset:     8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 }, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + formatRs(ctx.parsed) } }
      }
    }
  });
}

function updateBarChart(planned, expenses) {
  const ctx = document.getElementById('barChart');
  if (!ctx) return;
  if (Object.values(planned).reduce((a, b) => a + b, 0) === 0) return;
  if (barChartInstance) barChartInstance.destroy();

  const labels = Object.keys(planned);
  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Planned (Rs.)',
          data:  labels.map(k => Math.round(planned[k]  || 0)),
          backgroundColor: 'rgba(79,70,229,0.15)',
          borderColor:     'rgba(79,70,229,0.8)',
          borderWidth: 2, borderRadius: 6,
        },
        {
          label: 'Actual (Rs.)',
          data:  labels.map(k => Math.round(expenses[k] || 0)),
          backgroundColor: labels.map(k => CATEGORY_COLORS[k] + 'CC'),
          borderColor:     labels.map(k => CATEGORY_COLORS[k]),
          borderWidth: 2, borderRadius: 6,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + formatRs(ctx.parsed.y) } }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: v => 'Rs. ' + v.toLocaleString('en-PK'), font: { size: 11 } } },
        x: { grid: { display: false }, ticks: { font: { size: 12 } } }
      }
    }
  });
}

function updateSmartInsight(score, totalPlanned) {
  const el = document.getElementById('smartInsightBox');
  if (!el) return;
  if (totalPlanned === 0) { el.innerHTML = ''; return; }

  let type, icon, msg;
  if (score >= 70) {
    type = 'good'; icon = '✅';
    msg = `Great job! Your health score is <strong>${score}%</strong>. You are managing your budget well.`;
  } else if (score >= 40) {
    type = 'moderate'; icon = '⚠️';
    msg = `Your health score is <strong>${score}%</strong>. Review your spending categories to improve.`;
  } else {
    type = 'bad'; icon = '🚨';
    msg = `Your health score is <strong>${score}%</strong>. You are over budget. Reduce spending immediately.`;
  }

  el.innerHTML = `<div class="insight-box ${type}"><span style="font-size:20px">${icon}</span><span>${msg}</span></div>`;
}