// ============================================================
// chatbot.js — Smart Financial Advisor
// Online:  Google Gemini AI (creative, personalised responses)
// Offline: Smart local engine (keyword-based, real data)
// ============================================================

const GEMINI_API_KEY = 'AIzaSyCGgTOa0HPAZIeY01_pH2GjWTMAxGmjPlo'; // ← paste your full key here

// ── SEND MESSAGE ──────────────────────────────────────────
async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  addChatBubble(message, 'user');
  showTyping();

  const online = navigator.onLine;
  const keySet = GEMINI_API_KEY !== 'PASTE_YOUR_KEY_HERE' && GEMINI_API_KEY.length > 10;

  if (online && keySet) {
    console.log('Calling Gemini API...');
    await callGemini(message);
  } else {
    console.log('Using local engine. Online:', online, '| Key set:', keySet);
    setTimeout(function() {
      removeTyping();
      addChatBubble(localResponse(message), 'bot');
    }, 750);
  }
}

// ── GEMINI API CALL ───────────────────────────────────────
async function callGemini(message) {
  var ctx = getContext();
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY;

  var prompt =
    'You are a friendly AI financial advisor for a Smart Finance Tracker app in Pakistan.\n' +
    'User real-time data:\n' +
    '- Monthly Income: Rs. ' + ctx.income + '\n' +
    '- Inflation Rate: ' + ctx.inflation + '%\n' +
    '- Total Budget: Rs. ' + ctx.totalPlanned + '\n' +
    '- Total Spent: Rs. ' + ctx.totalSpent + '\n' +
    '- Remaining: Rs. ' + ctx.remaining + '\n' +
    '- Health Score: ' + ctx.healthScore + '% (' + ctx.riskLevel + ')\n' +
    '- Groceries: Rs. ' + (ctx.expenses.Groceries || 0) + ' spent of Rs. ' + (ctx.planned.Groceries || 0) + ' budgeted\n' +
    '- Bills: Rs. ' + (ctx.expenses.Bills || 0) + ' spent of Rs. ' + (ctx.planned.Bills || 0) + ' budgeted\n' +
    '- Healthcare: Rs. ' + (ctx.expenses.Healthcare || 0) + ' spent of Rs. ' + (ctx.planned.Healthcare || 0) + ' budgeted\n' +
    '- Education: Rs. ' + (ctx.expenses.Education || 0) + ' spent of Rs. ' + (ctx.planned.Education || 0) + ' budgeted\n' +
    '- Savings: Rs. ' + (ctx.expenses.Savings || 0) + ' spent of Rs. ' + (ctx.planned.Savings || 0) + ' budgeted\n' +
    '- Savings Goal: ' + (ctx.goalName ? '"' + ctx.goalName + '" — ' + ctx.goalSaved + ' saved of Rs. ' + ctx.goalTarget : 'Not set') + '\n\n' +
    'Rules: Always use the real numbers above. Be specific, helpful, and encouraging. Keep response under 5 sentences or use bullet points. Use Rs. currency. Pakistani context.\n\n' +
    'User message: ' + message;

  try {
    var response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 350, temperature: 0.75 }
      })
    });

    var data = await response.json();
    removeTyping();

    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      addChatBubble(data.candidates[0].content.parts[0].text, 'bot');
    } else if (data.error) {
      console.error('Gemini API error:', data.error.message);
      addChatBubble(localResponse(message), 'bot');
    } else {
      addChatBubble(localResponse(message), 'bot');
    }

  } catch (err) {
    console.error('Gemini fetch error:', err);
    removeTyping();
    addChatBubble(localResponse(message), 'bot');
  }
}

// ── LOCAL RESPONSE ENGINE ─────────────────────────────────
function localResponse(message) {
  var ctx = getContext();
  var m = message.toLowerCase();

  // Greetings
  if (m.includes('hi') || m.includes('hello') || m.includes('hey') || m.includes('salam') || m.includes('assalam')) {
    return 'Hello! I am your Smart Financial Advisor.\n\nYour current snapshot:\n' +
      '• Health Score: ' + ctx.healthScore + '% (' + ctx.riskLevel + ')\n' +
      '• Spent: ' + formatRs(ctx.totalSpent) + ' of ' + formatRs(ctx.totalPlanned) + '\n' +
      '• Remaining: ' + formatRs(ctx.remaining) + '\n\n' +
      'Ask me about your budget, groceries, bills, savings, risk, tips, or spending analysis!';
  }

  // Health score
  if (m.includes('health') || m.includes('score')) {
    var hs = ctx.healthScore >= 70
      ? 'Excellent! You are managing your budget very well.'
      : ctx.healthScore >= 40
      ? 'Moderate. Keep an eye on your spending.'
      : 'Critical. Reduce spending immediately.';
    return 'Your financial health score is ' + ctx.healthScore + '%. ' + hs + '\n' +
      '• Spent: ' + formatRs(ctx.totalSpent) + ' of ' + formatRs(ctx.totalPlanned) + '\n' +
      '• Remaining: ' + formatRs(ctx.remaining);
  }

  // Risk
  if (m.includes('risk')) {
    var ra = ctx.healthScore >= 70
      ? 'Continue tracking and maintain your habits.'
      : ctx.healthScore >= 40
      ? 'Identify your highest spending categories and cut back.'
      : 'Stop all non-essential spending and create an emergency budget.';
    return 'Your risk level is ' + ctx.riskLevel + ' (' + ctx.healthScore + '% health score).\n• ' + ra;
  }

  // Budget
  if (m.includes('budget') || m.includes('plan')) {
    var used = ctx.totalPlanned > 0 ? Math.round((ctx.totalSpent / ctx.totalPlanned) * 100) : 0;
    return 'Monthly budget overview:\n' +
      '• Total Planned: ' + formatRs(ctx.totalPlanned) + ' (' + ctx.inflation + '% inflation adjusted)\n' +
      '• Total Spent: ' + formatRs(ctx.totalSpent) + ' (' + used + '% used)\n' +
      '• Remaining: ' + formatRs(ctx.remaining) + '\n' +
      '• Groceries: ' + formatRs(ctx.planned.Groceries || 0) + ' | Bills: ' + formatRs(ctx.planned.Bills || 0) + '\n' +
      '• Healthcare: ' + formatRs(ctx.planned.Healthcare || 0) + ' | Savings: ' + formatRs(ctx.planned.Savings || 0);
  }

  // Groceries
  if (m.includes('grocer') || m.includes('food')) {
    var g = ctx.expenses.Groceries || 0;
    var gp = ctx.planned.Groceries || 0;
    var gpct = gp > 0 ? Math.round((g / gp) * 100) : 0;
    var gs = g > gp
      ? 'Over budget by ' + formatRs(g - gp) + '. Try meal planning and buying in bulk.'
      : gpct > 75
      ? 'At ' + gpct + '% — be careful with remaining purchases this month.'
      : 'On track! ' + formatRs(gp - g) + ' remaining.';
    return 'Groceries: ' + formatRs(g) + ' spent of ' + formatRs(gp) + ' budgeted (' + gpct + '%).\n' + gs;
  }

  // Bills
  if (m.includes('bill')) {
    var b = ctx.expenses.Bills || 0;
    var bp = ctx.planned.Bills || 0;
    var bpct = bp > 0 ? Math.round((b / bp) * 100) : 0;
    return 'Bills: ' + formatRs(b) + ' spent of ' + formatRs(bp) + ' budgeted (' + bpct + '%).\n' +
      (b > bp ? 'Over by ' + formatRs(b - bp) + '. Review your subscriptions and utilities.' : formatRs(bp - b) + ' remaining on bills.');
  }

  // Savings
  if (m.includes('sav')) {
    var s = ctx.expenses.Savings || 0;
    var sp = ctx.planned.Savings || 0;
    var spct = sp > 0 ? Math.round((s / sp) * 100) : 0;
    var gl = ctx.goalName
      ? '\n• Goal "' + ctx.goalName + '": ' + Math.min(100, Math.round((ctx.goalSaved / ctx.goalTarget) * 100)) + '% complete (' + formatRs(ctx.goalSaved) + ' of ' + formatRs(ctx.goalTarget) + ')'
      : '\n• Set a savings goal in the Goals section to track progress';
    return 'Savings: ' + formatRs(s) + ' of ' + formatRs(sp) + ' target (' + spct + '%).' + gl + '\n• Tip: Try to save at least 25% of your income monthly.';
  }

  // Inflation
  if (m.includes('inflation')) {
    return 'Your budget uses a ' + ctx.inflation + '% inflation rate.\n' +
      '• Base income: ' + formatRs(ctx.income) + '\n' +
      '• After inflation adjustment: ' + formatRs(ctx.totalPlanned) + '\n' +
      '• Extra budget added: ' + formatRs(ctx.totalPlanned - ctx.income) + '\n' +
      'Use the Inflation Simulator section to project future costs.';
  }

  // Tips
  if (m.includes('tip') || m.includes('advice') || m.includes('improve') || m.includes('how')) {
    var tips = [];
    if ((ctx.expenses.Groceries || 0) > (ctx.planned.Groceries || 0) * 0.8) tips.push('Reduce groceries — try weekly meal planning');
    if ((ctx.expenses.Bills || 0) > (ctx.planned.Bills || 0) * 0.8) tips.push('Review bills — cancel unused subscriptions');
    if ((ctx.expenses.Savings || 0) < (ctx.planned.Savings || 0) * 0.5) tips.push('Increase savings — aim for 25% of income');
    if (ctx.healthScore < 70) tips.push('Reduce non-essential spending to improve health score');
    tips.push('Track every expense for full budget awareness');
    tips.push('Review your budget at the start of each month');
    return 'Personalised tips based on your data:\n' + tips.map(function(t) { return '• ' + t; }).join('\n');
  }

  // Spending analysis
  if (m.includes('analys') || m.includes('spending') || m.includes('breakdown')) {
    var lines = Object.keys(ctx.planned).map(function(cat) {
      var p = ctx.planned[cat] || 0;
      var a = ctx.expenses[cat] || 0;
      var pct = p > 0 ? Math.round((a / p) * 100) : 0;
      var isSav = cat === 'Savings';
      var flag = isSav ? (a >= p ? ' ✅' : '') : (a > p ? ' ⚠️' : '');
      return '• ' + cat + ': ' + formatRs(a) + ' / ' + formatRs(p) + ' (' + pct + '%)' + flag;
    });
    return 'Full spending analysis:\n' + lines.join('\n') + '\n\nHealth Score: ' + ctx.healthScore + '% — ' + ctx.riskLevel;
  }

  // Goal
  if (m.includes('goal') || m.includes('target')) {
    if (!ctx.goalName) return 'No savings goal set yet. Go to the Goals section and set a target to track your progress.';
    var gpct2 = Math.min(100, Math.round((ctx.goalSaved / ctx.goalTarget) * 100));
    return 'Savings Goal: "' + ctx.goalName + '"\n' +
      '• Target: ' + formatRs(ctx.goalTarget) + '\n' +
      '• Saved: ' + formatRs(ctx.goalSaved) + ' (' + gpct2 + '% complete)\n' +
      '• Still needed: ' + formatRs(Math.max(0, ctx.goalTarget - ctx.goalSaved)) + '\n' +
      (gpct2 >= 100 ? 'Congratulations! Goal achieved!' : 'Keep going — log savings expenses to update progress.');
  }

  // Remaining
  if (m.includes('remain') || m.includes('left')) {
    return 'Remaining budget: ' + formatRs(ctx.remaining) + ' of ' + formatRs(ctx.totalPlanned) + '\n' +
      '• Groceries: ' + formatRs(Math.max(0, (ctx.planned.Groceries || 0) - (ctx.expenses.Groceries || 0))) + '\n' +
      '• Bills: ' + formatRs(Math.max(0, (ctx.planned.Bills || 0) - (ctx.expenses.Bills || 0))) + '\n' +
      '• Healthcare: ' + formatRs(Math.max(0, (ctx.planned.Healthcare || 0) - (ctx.expenses.Healthcare || 0))) + '\n' +
      '• Education: ' + formatRs(Math.max(0, (ctx.planned.Education || 0) - (ctx.expenses.Education || 0))) + '\n' +
      '• Savings: ' + formatRs(Math.max(0, (ctx.planned.Savings || 0) - (ctx.expenses.Savings || 0)));
  }

  // Healthcare
  if (m.includes('healthcare') || m.includes('medical')) {
    var h = ctx.expenses.Healthcare || 0;
    var hp = ctx.planned.Healthcare || 0;
    return 'Healthcare: ' + formatRs(h) + ' spent of ' + formatRs(hp) + ' budgeted.\n' +
      (h > hp ? 'Over budget by ' + formatRs(h - hp) + '.' : formatRs(hp - h) + ' remaining.');
  }

  // Education
  if (m.includes('education') || m.includes('school') || m.includes('study')) {
    var e = ctx.expenses.Education || 0;
    var ep = ctx.planned.Education || 0;
    return 'Education: ' + formatRs(e) + ' spent of ' + formatRs(ep) + ' budgeted.\n' +
      (e > ep ? 'Over budget by ' + formatRs(e - ep) + '.' : formatRs(ep - e) + ' remaining.');
  }

  // Default
  return 'Your financial snapshot:\n' +
    '• Health Score: ' + ctx.healthScore + '% (' + ctx.riskLevel + ')\n' +
    '• Budget Used: ' + formatRs(ctx.totalSpent) + ' of ' + formatRs(ctx.totalPlanned) + '\n' +
    '• Remaining: ' + formatRs(ctx.remaining) + '\n\n' +
    'Ask me about: budget, groceries, bills, savings, healthcare, education, risk, tips, spending analysis, or your goal!';
}

// ── GET FINANCIAL DATA ────────────────────────────────────
function getContext() {
  var planned      = JSON.parse(localStorage.getItem('sf_planned'))      || {};
  var expenses     = JSON.parse(localStorage.getItem('sf_expenses'))     || {};
  var transactions = JSON.parse(localStorage.getItem('sf_transactions')) || [];
  var goal         = JSON.parse(localStorage.getItem('sf_goal'))         || null;
  var totalPlanned = Object.values(planned).reduce(function(a, b) { return a + b; }, 0);
  var totalSpent   = Object.values(expenses).reduce(function(a, b) { return a + b; }, 0);
  var totalRemaining = Math.max(0, totalPlanned - totalSpent);
  var spendCats = ['Groceries', 'Bills', 'Healthcare', 'Education'];
  var spendP    = spendCats.reduce(function(a, c) { return a + (planned[c]  || 0); }, 0);
  var spendA    = spendCats.reduce(function(a, c) { return a + (expenses[c] || 0); }, 0);
  var spendRem  = Math.max(0, spendP - spendA);
  var healthScore = spendP > 0 ? Math.max(0, Math.min(100, Math.round((spendRem / spendP) * 100))) : 0;
  return {
    income:       localStorage.getItem('sf_income')    || 0,
    inflation:    localStorage.getItem('sf_inflation') || 0,
    planned:      planned,
    expenses:     expenses,
    totalPlanned: Math.round(totalPlanned),
    totalSpent:   Math.round(totalSpent),
    remaining:    Math.round(totalRemaining),
    healthScore:  healthScore,
    riskLevel:    healthScore >= 70 ? 'Low Risk' : healthScore >= 40 ? 'Moderate Risk' : 'High Risk',
    goalName:     goal ? goal.name   : null,
    goalTarget:   goal ? goal.target : 0,
    goalSaved:    expenses['Savings'] || 0
  };
}

// ── ADD CHAT BUBBLE ───────────────────────────────────────
function addChatBubble(text, sender) {
  var chatWindow = document.getElementById('chatWindow');
  if (!chatWindow) return;
  var wrap = document.createElement('div');
  wrap.className = 'chat-bubble-wrap ' + sender;
  var formatted = text.replace(/\n/g, '<br>').replace(/•/g, '&bull;');
  wrap.innerHTML = '<div class="chat-bubble">' + formatted + '</div>';
  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ── TYPING INDICATOR ──────────────────────────────────────
function showTyping() {
  var chatWindow = document.getElementById('chatWindow');
  if (!chatWindow) return;
  var el = document.createElement('div');
  el.className = 'chat-bubble-wrap bot';
  el.id = 'typingIndicator';
  el.innerHTML = '<div class="chat-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeTyping() {
  var el = document.getElementById('typingIndicator');
  if (el) el.remove();
}