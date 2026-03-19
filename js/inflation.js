// ============================================================
// inflation.js — Future cost simulator
// ============================================================

function calculateInflation() {
  const present  = Number(document.getElementById('presentCost').value);
  const rate     = Number(document.getElementById('inflationRate').value);
  const years    = Number(document.getElementById('yearsAhead').value);

  // Validation
  if (!present || present <= 0) { alert('Please enter a valid present expense amount.'); return; }
  if (!rate    || rate < 0)     { alert('Please enter a valid inflation rate.');          return; }
  if (!years   || years <= 0)   { alert('Please enter a valid number of years.');         return; }

  // Compound inflation formula: Future = Present × (1 + rate/100)^years
  const future   = present * Math.pow(1 + rate / 100, years);
  const increase = future - present;
  const pctIncrease = Math.round(((future - present) / present) * 100);

  // Display result
  document.getElementById('futureCostDisplay').textContent = formatRs(future);
  document.getElementById('inflationIncrease').innerHTML = `
    <div class="inflation-increase">
      ↑ ${pctIncrease}% increase (${formatRs(increase)} more)
    </div>`;

  // Generate advice
  updateInflationAdvice(present, future, rate, years, pctIncrease);
}

function updateInflationAdvice(present, future, rate, years, pctIncrease) {
  const el = document.getElementById('inflationAdvice');
  if (!el) return;

  let urgency, icon, tips;

  if (pctIncrease <= 20) {
    urgency = 'good';
    icon    = '✅';
    tips    = [
      'Your expense growth is manageable over this period.',
      `Start saving an extra ${formatRs((future - present) / (years * 12))} per month to cover future costs.`,
      'Consider a fixed deposit or savings account to grow your money.'
    ];
  } else if (pctIncrease <= 60) {
    urgency = 'moderate';
    icon    = '⚠️';
    tips    = [
      `This expense will cost ${pctIncrease}% more in ${years} years — plan ahead now.`,
      `You need to save ${formatRs((future - present) / (years * 12))} extra per month to stay on track.`,
      'Invest in instruments that beat inflation like mutual funds or stocks.'
    ];
  } else {
    urgency = 'bad';
    icon    = '🚨';
    tips    = [
      `A ${pctIncrease}% cost increase is very significant. Act now to prepare.`,
      `You will need ${formatRs(future)} instead of ${formatRs(present)} — a difference of ${formatRs(future - present)}.`,
      'Consider diversified investments to protect against high inflation.',
      `Save at least ${formatRs((future - present) / (years * 12))} extra every month starting today.`
    ];
  }

  el.innerHTML = `
    <div class="insight-box ${urgency}" style="margin-bottom:16px; align-items:flex-start;">
      <span style="font-size:24px; flex-shrink:0">${icon}</span>
      <div>
        <div style="font-weight:700; margin-bottom:8px;">
          ${years}-Year Inflation Impact at ${rate}% Rate
        </div>
        ${tips.map(t => `
          <div style="font-size:13px; opacity:0.9; padding:3px 0; display:flex; gap:6px;">
            <span>→</span><span>${t}</span>
          </div>`).join('')}
      </div>
    </div>
    <div style="font-size:12px; color:var(--text-light); text-align:center; margin-top:8px;">
      Formula used: Future Cost = ${formatRs(present)} × (1 + ${rate}/100)^${years}
    </div>`;
}