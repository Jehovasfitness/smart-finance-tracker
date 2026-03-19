// ============================================================
// insights.js — Health gauge, risk classification, advice
// ============================================================

function refreshInsights() {
  const planned  = JSON.parse(localStorage.getItem('sf_planned'))  || {};
  const expenses = JSON.parse(localStorage.getItem('sf_expenses')) || {};

  // Savings excluded from health score — saving more is always GOOD
  const spendCats = ['Groceries', 'Bills', 'Healthcare', 'Education'];
  const tp     = Object.values(planned).reduce((a, b) => a + b, 0);
  const ta     = Object.values(expenses).reduce((a, b) => a + b, 0);
  const spendP = spendCats.reduce((a, c) => a + (planned[c]  || 0), 0);
  const spendA = spendCats.reduce((a, c) => a + (expenses[c] || 0), 0);
  const spendRemaining = Math.max(0, spendP - spendA);
  const score  = spendP > 0 ? Math.max(0, Math.min(100, Math.round((spendRemaining / spendP) * 100))) : 0;

  updateGauge(score, tp);
  updateRiskClassification(score, tp);
  // Pass spendP and spendA into updateAdvice so they're available
  updateAdvice(score, tp, ta, planned, expenses, spendP, spendA, spendRemaining);
  updateCategoryAnalysis(planned, expenses);
}

// ANIMATED GAUGE
function updateGauge(score, totalPlanned) {
  const circle    = document.getElementById('gaugeCircle');
  const gaugeText = document.getElementById('gaugeText');
  const labelText = document.getElementById('gaugeLabelText');
  if (!circle) return;

  const circumference = 502.65;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444';
  circle.style.stroke = color;
  setTimeout(() => { circle.style.strokeDashoffset = offset; }, 200);
  if (gaugeText) { gaugeText.textContent = score + '%'; gaugeText.style.fill = color; }
  if (labelText) {
    if (totalPlanned === 0)  labelText.textContent = 'Set your budget to see score';
    else if (score >= 70)    labelText.textContent = 'Great financial health!';
    else if (score >= 40)    labelText.textContent = 'Moderate — keep an eye on spending';
    else                     labelText.textContent = 'Critical — reduce spending now';
  }
}

// RISK CLASSIFICATION
function updateRiskClassification(score, totalPlanned) {
  const el = document.getElementById('riskClassDisplay');
  if (!el) return;

  if (totalPlanned === 0) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">📈</span><strong>No data yet</strong><p>Add your budget and expenses first</p></div>`;
    return;
  }

  let riskLevel, color, bg, description, steps;
  if (score >= 70) {
    riskLevel = 'Low Risk'; color = '#166534'; bg = '#F0FDF4';
    description = 'Your finances are well managed. You are spending within budget and maintaining a healthy balance.';
    steps = ['Continue tracking expenses monthly', 'Consider increasing savings allocation', 'Review budget every 3 months'];
  } else if (score >= 40) {
    riskLevel = 'Moderate Risk'; color = '#92400E'; bg = '#FFFBEB';
    description = 'Your spending is approaching budget limits. Take action to avoid going into the high risk zone.';
    steps = ['Identify which categories are overspending', 'Cut back on non-essential expenses', 'Try to increase income or reduce bills'];
  } else {
    riskLevel = 'High Risk'; color = '#991B1B'; bg = '#FEF2F2';
    description = 'You are close to or over budget. Immediate action is required to stabilize your finances.';
    steps = ['Stop all non-essential spending immediately', 'Review and reduce bills and subscriptions', 'Create an emergency budget plan'];
  }

  el.innerHTML = `
    <div style="background:${bg}; border-radius:10px; padding:20px;">
      <div class="risk-badge ${score >= 70 ? 'low' : score >= 40 ? 'moderate' : 'high'}" style="margin-bottom:12px;">
        ${score >= 70 ? '✅' : score >= 40 ? '⚠️' : '🚨'} ${riskLevel}
      </div>
      <p style="font-size:13px; color:${color}; margin-bottom:16px; line-height:1.6;">${description}</p>
      <div style="font-size:12px; font-weight:700; color:${color}; margin-bottom:8px;">Recommended Actions:</div>
      ${steps.map(s => `<div style="font-size:12px; color:${color}; padding:4px 0; display:flex; align-items:center; gap:6px;"><span>→</span> ${s}</div>`).join('')}
    </div>`;
}

// SMART ADVICE — spendP, spendA, spendRemaining passed in from refreshInsights
function updateAdvice(score, tp, ta, planned, expenses, spendP, spendA, spendRemaining) {
  const el = document.getElementById('adviceDisplay');
  if (!el) return;

  if (tp === 0) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">💡</span><strong>No recommendation yet</strong><p>Set a budget to get personalised advice</p></div>`;
    return;
  }

  // Worst spending category (exclude Savings)
  const spendingOnly = ['Groceries', 'Bills', 'Healthcare', 'Education'];
  let worstCat = null, worstRatio = 0;
  for (const cat of spendingOnly) {
    if (!planned[cat]) continue;
    const ratio = (expenses[cat] || 0) / planned[cat];
    if (ratio > worstRatio) { worstRatio = ratio; worstCat = cat; }
  }

  const spendPct = spendP > 0 ? Math.round((spendA / spendP) * 100) : 0;

  let adviceHTML = `<div style="display:flex; flex-direction:column; gap:12px;">`;

  // Main advice
  if (score >= 70) {
    adviceHTML += advice('good', '🎉', 'Excellent Budget Management',
      `Your health score of ${score}% shows strong financial discipline. You have ${formatRs(spendRemaining)} left in your spending budget.`);
  } else if (score >= 40) {
    adviceHTML += advice('moderate', '📊', 'Monitor Your Spending',
      `Your health score is ${score}%. You have used ${spendPct}% of your spending budget. Be careful with remaining purchases.`);
  } else {
    adviceHTML += advice('bad', '🚨', 'Budget Alert',
      `Your health score is ${score}%. You have used ${spendPct}% of your spending budget. Avoid non-essential purchases now.`);
  }

  // Worst category alert
  if (worstCat && worstRatio > 0.75) {
    adviceHTML += advice('moderate', '⚠️', `${worstCat} Needs Attention`,
      `You have spent ${Math.round(worstRatio * 100)}% of your ${worstCat} budget (${formatRs(expenses[worstCat] || 0)} of ${formatRs(planned[worstCat])}). Consider reducing ${worstCat.toLowerCase()} expenses.`);
  }

  // Savings advice — always positive
  const savingsSpent   = expenses['Savings'] || 0;
  const savingsPlanned = planned['Savings']  || 0;
  if (savingsPlanned > 0 && savingsSpent >= savingsPlanned) {
    adviceHTML += advice('good', '🏆', 'Savings Goal Reached!',
      `Amazing! You have saved ${formatRs(savingsSpent)}, exceeding your target of ${formatRs(savingsPlanned)}. Keep it up!`);
  } else if (savingsPlanned > 0 && savingsSpent < savingsPlanned * 0.5) {
    adviceHTML += advice('moderate', '💰', 'Boost Your Savings',
      `You have saved ${formatRs(savingsSpent)} so far. Try to reach your savings target of ${formatRs(savingsPlanned)} before month end.`);
  } else if (savingsPlanned > 0) {
    adviceHTML += advice('good', '💰', 'Good Savings Progress',
      `You have saved ${formatRs(savingsSpent)} of your ${formatRs(savingsPlanned)} target. Keep going!`);
  }

  adviceHTML += `</div>`;
  el.innerHTML = adviceHTML;
}

function advice(type, icon, title, msg) {
  return `
    <div class="insight-box ${type}">
      <span style="font-size:20px; flex-shrink:0">${icon}</span>
      <div>
        <div style="font-weight:700; margin-bottom:4px;">${title}</div>
        <div style="font-size:12px; opacity:0.85;">${msg}</div>
      </div>
    </div>`;
}

// CATEGORY ANALYSIS — Savings never shows red
function updateCategoryAnalysis(planned, expenses) {
  const el = document.getElementById('insightsCategoryBreakdown');
  if (!el) return;

  const hasExpenses = Object.values(expenses).some(v => v > 0);
  if (!hasExpenses) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">📊</span><strong>No expenses logged</strong><p>Start adding expenses to see category analysis</p></div>`;
    return;
  }

  let html = '';
  for (const cat in planned) {
    const p          = planned[cat]  || 0;
    const a          = expenses[cat] || 0;
    const pct        = p > 0 ? Math.min(100, Math.round((a / p) * 100)) : 0;
    const isSavings  = cat === 'Savings';
    const over       = a > p && !isSavings; // savings never "over budget"
    const barClass   = isSavings ? 'green' : over ? 'red' : pct > 75 ? 'yellow' : 'green';
    const statusText = isSavings
      ? (a >= p ? `🏆 Savings target reached!` : `🟢 Saved ${formatRs(a)} of ${formatRs(p)}`)
      : over ? `🔴 Over by ${formatRs(a - p)}`
      : pct > 75 ? `🟡 Approaching limit`
      : `🟢 On track`;

    html += `
      <div class="progress-wrap">
        <div class="progress-header">
          <span class="progress-label">${CATEGORY_ICONS[cat]} ${cat}</span>
          <span class="progress-values">${formatRs(a)} / ${formatRs(p)} (${pct}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${barClass}" style="width:${pct}%"></div>
        </div>
        <div class="progress-status ${isSavings ? 'ok' : over ? 'over' : pct > 75 ? 'warn' : 'ok'}">
          ${statusText}
        </div>
      </div>`;
  }
  el.innerHTML = html;
}