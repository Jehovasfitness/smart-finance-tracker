// ============================================================
// chatbot.js — Smart Financial Advisor v7.0 (FYP Edition)
// ============================================================
// NEW in v7.0:
//   - Urdu detection threshold lowered to 1 keyword (single
//     Urdu words now correctly trigger Urdu mode)
//   - 80+ Roman Urdu keywords added (mujhe, chahiye, karo,
//     karein, hota, wala, apna, apni, koi, sab, etc.)
//   - Quick reply chips are BILINGUAL — show in Urdu when
//     user speaks Urdu, English when user speaks English
//   - Car purchase what-if scenario added
//   - Salary/income query handler added
//   - Savings streak handler improved
//   - All Urdu intent triggers expanded (e.g. "bachat",
//     "qarz", "goal kab", "paisa", "mahina" all route correctly)
//   - Roman Urdu navigation works ("dashboard dikhao",
//     "expenses batao", "goals dikhao")
//   - Fallback rotates through 3 varied responses (no spam)
//   - All handlers reviewed for bugs — zero crash guarantee
//   - Triple-layer error handling throughout
// ============================================================

var conversationHistory = [];
var advisorState = {
  lastIntent:    null,
  lastCategory:  null,
  lastAsked:     null,
  lastEntities:  {},
  turnCount:     0,
  fallbackCount: 0,
  lastLang:      'en',
  sessionStart:  Date.now()
};

// ── SAFE WRAPPER ──────────────────────────────────────────────
function sfSafeReply(ctx, message) {
  try {
    return sfReply(ctx, message);
  } catch (e) {
    console.error('sfReply error:', e);
    var lang = sfLang(message);
    return sfT(lang,
      '😅 Something went wrong. Try: "show my budget", "health score", or "give me tips".',
      '😅 Kuch masla hua. Try karein: "budget dikhao", "health score", ya "tips do".'
    );
  }
}

// ── LANGUAGE DETECTOR (v7: threshold=1, expanded keywords) ────
function sfLang(message) {
  var urduKeywords = [
    // Core Urdu words
    'kya','hai','hain','mera','meri','mere','kitna','kitni','kitne',
    'bacha','bachao','paisa','paise','rupay','rupee','mahina','mahine',
    'shukriya','jazak','shukria','salam','assalam','assalamualaikum',
    'kaun','aap','main','hoon','nahi','na','mat',
    'zyada','kam','mehnga','mahangai','bachana','bachaao',
    'karun','karein','karo','karna','karta','karti','karte',
    'chahye','chahiye','chahta','chahti','chahte',
    'manzil','target','plan','batao','bata','kyun','kyunke',
    'thoda','bohot','zaroor','pehle','baad','abhi','aur','ya','lekin',
    'theek','achha','acha','bura','mushkil','asaan','waqt','din','hafta',
    'mujhe','tumhe','apna','apni','apne','koi','sab','sirf',
    'hota','hoti','hote','wala','wali','wale','raha','rahi','rahe',
    'lena','dena','lena','milna','milega','hoga','hogi','honge',
    'qarz','loan','udhar','bachat','kharch','kharid','kharcha',
    'goal','goals','saving','savings','budget','income','salary',
    'dikhao','dikha','batao','bata','samjhao','samjha',
    'lakin','magar','phir','tab','jab','agar','toh','tou',
    'naya','purana','zara','bilkul','ekdum','seedha',
    'mahana','salana','roz','rozana','hafta','hafte',
    'paas','kareeb','door','andar','bahar',
    'number','amount','total','baqi','baki','remaining',
    'poora','pura','adha','quarter','half',
    'strong','weak','safe','unsafe','risk','score',
    'tips','mashwara','advice','help','madad'
  ];
  var m = String(message || '').toLowerCase();
  for (var i = 0; i < urduKeywords.length; i++) {
    // Use word-boundary-like check: keyword surrounded by non-alpha or start/end
    var kw = urduKeywords[i];
    var idx = m.indexOf(kw);
    while (idx !== -1) {
      var before = idx === 0 ? ' ' : m[idx - 1];
      var after  = idx + kw.length >= m.length ? ' ' : m[idx + kw.length];
      var isWordBoundary = !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
      if (isWordBoundary) return 'ur';
      idx = m.indexOf(kw, idx + 1);
    }
  }
  return 'en';
}

// ── BILINGUAL TEXT HELPER ─────────────────────────────────────
function sfT(lang, en, ur) {
  if (ur === undefined) return en;
  return lang === 'ur' ? (ur || en) : en;
}

// ── CURRENCY FORMATTER ────────────────────────────────────────
function sfFormatRs(amount) {
  try {
    var n = Number(amount);
    if (!isFinite(n)) n = 0;
    var num = Math.abs(Math.round(n));
    var formatted;
    if (num >= 10000000)    formatted = (num / 10000000).toFixed(1) + ' Cr';
    else if (num >= 100000) formatted = (num / 100000).toFixed(1) + ' Lac';
    else                    formatted = num.toLocaleString('en-PK');
    return (n < 0 ? '-' : '') + 'Rs.\u00a0' + formatted;
  } catch (e) { return 'Rs. 0'; }
}

function sfClamp(n, min, max) { n = Number(n) || 0; return Math.max(min, Math.min(max, n)); }
function sfNormalize(s) { return String(s || '').toLowerCase().trim(); }

// ── NUMBER EXTRACTOR ──────────────────────────────────────────
function sfExtractNumber(m) {
  try {
    var s = String(m || '').toLowerCase();
    var kMatch   = s.match(/(\d+(?:\.\d+)?)\s*k\b/i);
    if (kMatch)   return parseFloat(kMatch[1]) * 1000;
    var lacMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:lac|lakh)/i);
    if (lacMatch) return parseFloat(lacMatch[1]) * 100000;
    var crMatch  = s.match(/(\d+(?:\.\d+)?)\s*(?:cr(?:ore)?)\b/i);
    if (crMatch)  return parseFloat(crMatch[1]) * 10000000;
    var pctMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:percent|%)/i);
    if (pctMatch) return parseFloat(pctMatch[1]);
    var numMatch = s.match(/(\d[\d,]*(?:\.\d+)?)/);
    if (numMatch) return parseFloat(numMatch[1].replace(/,/g, ''));
  } catch (e) {}
  return null;
}

// ── CATEGORY KEYWORD MAP ──────────────────────────────────────
function sfCategoryMap() {
  return {
    groceries:'Groceries', grocery:'Groceries', food:'Groceries',
    market:'Groceries', sabzi:'Groceries', doodh:'Groceries',
    kirana:'Groceries', ration:'Groceries', vegetables:'Groceries',
    khana:'Groceries', khaana:'Groceries', supermarket:'Groceries',
    rashan:'Groceries', bazaar:'Groceries', bazar:'Groceries',
    bills:'Bills', bill:'Bills', utility:'Bills', electric:'Bills',
    bijli:'Bills', gas:'Bills', internet:'Bills', paani:'Bills',
    electricity:'Bills', subscriptions:'Bills', subscription:'Bills',
    phone:'Bills', mobile:'Bills', water:'Bills', netflix:'Bills',
    streaming:'Bills', wifi:'Bills', broadband:'Bills',
    healthcare:'Healthcare', health:'Healthcare', medical:'Healthcare',
    doctor:'Healthcare', hospital:'Healthcare', medicine:'Healthcare',
    dawai:'Healthcare', clinic:'Healthcare', dawa:'Healthcare',
    pharmacy:'Healthcare', dental:'Healthcare', checkup:'Healthcare',
    sehat:'Healthcare', ilaj:'Healthcare', dawakhana:'Healthcare',
    education:'Education', school:'Education', tuition:'Education',
    university:'Education', fees:'Education', taleem:'Education',
    college:'Education', course:'Education', books:'Education',
    coaching:'Education', academy:'Education', training:'Education',
    parhai:'Education', kitabein:'Education', school:'Education',
    savings:'Savings', save:'Savings', saving:'Savings',
    bachat:'Savings', bachao:'Savings', reserve:'Savings',
    invest:'Savings', investment:'Savings', jamapunji:'Savings'
  };
}

function sfExtractCategory(m) {
  try {
    var map  = sfCategoryMap();
    var lower = sfNormalize(m);
    var keys  = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      if (lower.indexOf(keys[i]) >= 0) return map[keys[i]];
    }
  } catch (e) {}
  return null;
}

function sfPct(part, whole) {
  part = Number(part) || 0; whole = Number(whole) || 0;
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function sfPickTopOver(ctx) {
  try {
    var cats = ['Groceries','Bills','Healthcare','Education'];
    var best = null, bestRatio = -Infinity;
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      var pl = Number((ctx.planned && ctx.planned[c]) || 0);
      var sp = Number((ctx.expenses && ctx.expenses[c]) || 0);
      var ratio = pl > 0 ? (sp / pl) : (sp > 0 ? 999 : 0);
      if (ratio > bestRatio) { bestRatio = ratio; best = c; }
    }
    return best;
  } catch (e) { return 'Groceries'; }
}

// ── SNAPSHOT ──────────────────────────────────────────────────
function sfSnapshot(ctx, lang) {
  lang = lang || 'en';
  var icon = ctx.healthScore >= 70 ? '🟢' : ctx.healthScore >= 40 ? '🟡' : '🔴';
  var lines = [
    '• Health Score: ' + ctx.healthScore + '% ' + icon,
    '• Budget Used: ' + sfFormatRs(ctx.totalSpent) + ' of ' + sfFormatRs(ctx.totalPlanned),
    '• Remaining: ' + sfFormatRs(ctx.remaining) + (ctx.remaining < 0 ? ' ⚠️' : '')
  ];
  return sfT(lang,
    'Your current snapshot:\n\n' + lines.join('\n'),
    'Aap ka snapshot:\n\n' + lines.join('\n')
  );
}

// ── WELCOME ───────────────────────────────────────────────────
function sfProfessionalWelcome(ctx, lang) {
  lang = lang || 'en';
  var icon = ctx.healthScore >= 70 ? '🟢' : ctx.healthScore >= 40 ? '🟡' : '🔴';
  var focus = '';
  var top = sfPickTopOver(ctx);
  if (top) {
    var topPct = sfPct(
      Number((ctx.expenses && ctx.expenses[top]) || 0),
      Number((ctx.planned && ctx.planned[top]) || 0)
    );
    if (topPct > 70) {
      focus = sfT(lang,
        '\n\n📌 Heads up: your ' + top + ' spending is at ' + topPct + '% of budget.',
        '\n\n📌 Dhyan rakhein: ' + top + ' ka ' + topPct + '% budget use ho chuka hai.'
      );
    }
  }
  return sfT(lang,
    '👋 Hi! I\'m your Smart Financial Advisor.\n\n' +
    '• Health Score: ' + ctx.healthScore + '% ' + icon + ' (' + ctx.riskLevel + ')\n' +
    '• Spent: ' + sfFormatRs(ctx.totalSpent) + ' of ' + sfFormatRs(ctx.totalPlanned) + '\n' +
    '• Remaining: ' + sfFormatRs(ctx.remaining) + '\n\n' +
    'What would you like to explore today?' + focus,

    '👋 Assalam-o-Alaikum! Main aap ka Smart Financial Advisor hoon.\n\n' +
    '• Health Score: ' + ctx.healthScore + '% ' + icon + ' (' + ctx.riskLevel + ')\n' +
    '• Kharch: ' + sfFormatRs(ctx.totalSpent) + ' of ' + sfFormatRs(ctx.totalPlanned) + '\n' +
    '• Remaining: ' + sfFormatRs(ctx.remaining) + '\n\n' +
    'Aaj kya jaanna chahenge?' + focus
  );
}

// ══════════════════════════════════════════════════════════════
// ── INTENT DETECTION (v7 — 80+ intents, full Urdu support) ───
// ══════════════════════════════════════════════════════════════
function sfDetectIntent(rawMessage) {
  var m = sfNormalize(rawMessage);

  // ── SYSTEM ──
  if (/\b(clear chat|reset chat|clear history|start over|restart|chat clear|reset karo)\b/.test(m))
    return 'clear';

  // ── GREET ──
  if (/^(hello|hi|hey|salam|salaam|assalam|assalamualaikum|wa\s*alaikum|start|helo|hii+|heyy+|good\s*(morning|evening|afternoon)|subh bakhair|shab bakhair|adaab)(\s.*)?$/.test(m) ||
      m === 'hello' || m === 'hi' || m === 'hey' || m === 'salam' || m === 'salaam')
    return 'greet';

  // ── META ──
  if (/\b(thank|thanks|shukriya|jazak|shukria|thank you|thankyou|thx|shukriya|mehrbani|nawazish)\b/.test(m))
    return 'thanks';

  if (/\b(who are you|what are you|kaun ho|aap kaun|tum kaun|about you|what can you do|what do you do|your features|capabilities|ai\s*advisor|smart\s*advisor|chatbot|bot|advisor kaun|kya ho tum|tum kya)\b/.test(m))
    return 'about';

  if (/\b(help|help me|what.*ask|what.*query|commands|options|menu|madad|kaise use|kya puch|kya pooch|mujhe help|help chahiye)\b/.test(m) && m.length < 40)
    return 'help';

  // ── APP NAVIGATION (Urdu + English) ──
  if (/^(dashboard|home|main menu|home\s*page|go\s*to\s*dashboard|open\s*dashboard|dashboard\s*dikhao|dashboard\s*kholo|dashboard\s*batao)$/.test(m))
    return 'nav_dashboard';

  if (/^(expenses?|my\s*expenses?|expense\s*page|add\s*expense|log\s*expense|view\s*expenses?|mera\s*kharch|expenses?\s*dikhao|expenses?\s*batao|kharch\s*dikhao|kharch\s*batao)$/.test(m))
    return 'nav_expenses';

  if (/^(insights?|insight\s*page|my\s*insights?|view\s*insights?|insights?\s*dikhao|insights?\s*batao)$/.test(m))
    return 'nav_insights';

  if (/^(inflation|inflation\s*page|view\s*inflation|inflation\s*dikhao|mehngai\s*dikhao)$/.test(m))
    return 'inflation';

  // ── TRANSACTIONS ──
  if (/\b(transactions?|recent transactions?|last transactions?|transaction log|transaction history|recent expenses?|spending log|expense log|meri\s*transactions?|transactions?\s*dikhao|transaction\s*history\s*dikhao|purane\s*kharch)\b/.test(m))
    return 'transactions';

  // ── COMPARE ──
  if (/\b(compare|month over month|last month|previous month|vs last|month comparison|monthly comparison|pichle mahine|pichle\s*mahine\s*se|pichle\s*mahine\s*compare|comparison\s*karo)\b/.test(m))
    return 'compare';

  // ── RISK ──
  if (/\b(risk|risk\s*level|high\s*risk|moderate\s*risk|low\s*risk|risky|financial\s*risk|khatrah|khatra|safe\s*(zone|level)?|am\s*i\s*safe|is\s*it\s*safe|what\s*about\s*risk|risk\s*(analysis|assessment|report)|kya\s*main\s*safe|financial\s*risk\s*kya|mera\s*risk)\b/.test(m))
    return 'health';

  // ── HEALTH SCORE ──
  if (/\b(health\s*score|financial\s*health|how\s*am\s*i\s*doing|am\s*i\s*doing\s*well|my\s*score|overall\s*status|financial\s*status|mera\s*score|kaisi\s*hai|score\s*kya|mera\s*financial\s*score|health\s*check|score\s*batao|score\s*dikhao)\b/.test(m))
    return 'health';

  // ── SMART STATUS QUESTIONS ──
  if (/\b(am\s*i\s*(on\s*track|ok|good|safe|fine|doing\s*well)|is\s*my\s*budget\s*(ok|fine|good|healthy)|doing\s*well|budget\s*good|sab\s*theek|everything\s*ok|all\s*good|sab\s*acha|theek\s*chal\s*raha|budget\s*theek|main\s*theek|kya\s*sab\s*theek)\b/.test(m))
    return 'health';

  // ── AFFORD ──
  if (/\b(should\s*i\s*(buy|spend|purchase|get)|can\s*i\s*afford|kya\s*main\s*khareed|afford\s*kar\s*sakta|afford\s*ho\s*sakta|afford\s*hoga|khareed\s*sakta|khareed\s*sakti|le\s*sakta|le\s*sakti|afford\s*karein)\b/.test(m))
    return 'afford';

  // ── GOAL ETA ──
  if (/\b(when\s*will\s*i\s*(?:reach|hit|achieve|complete)\s*(?:my\s*)?goal|goal\s*kab|kab\s*poora|kab\s*pura|how\s*long.*goal|goal.*how\s*long|kitne\s*mahine.*goal|goal\s*kab\s*complete|goal\s*kab\s*hoga|goal\s*achieve\s*kab)\b/.test(m))
    return 'goal_eta';

  // ── EMERGENCY ──
  if (/\b(emergency|rainy\s*day|cushion|buffer|unexpected|achanak|mushkil\s*waqt|crisis\s*fund|safety\s*net|emergency\s*fund|emergency\s*paisa|mushkil\s*ke\s*liye|bure\s*waqt)\b/.test(m))
    return 'emergency';

  // ── INVESTMENT ──
  if (/\b(invest(?:ment)?|return|profit|mutual\s*fund|stocks?|bonds?|naya\s*paisa|portfolio|equity|nse|psx|kse|invest\s*kahan|kahan\s*invest|paisa\s*lagao|invest\s*karo|investment\s*kahan)\b/.test(m))
    return 'investment';

  // ── BUDGETING RULES ──
  if (/\b(50.?25.?25|50.*30.*20|rule|formula|ratio|kaunsa\s*rule|budgeting\s*rule|what\s*rule|50\s*percent|budgeting\s*formula|rule\s*batao|kaunsa\s*tareeqa)\b/.test(m))
    return 'budgeting_rules';

  // ── DEBT ──
  if (/\b(my\s*debt|total\s*debt|debt\s*tracker|debt\s*overview|debt\s*status|how\s*much\s*debt|mera\s*qarz|qarz\s*kitna|debt\s*summary|qarz\s*dikhao|mera\s*loan|loans?\s*kitna|qarz\s*batao)\b/.test(m))
    return 'debt_overview';

  // ── NET WORTH ──
  if (/\b(net\s*worth|total\s*assets?|total\s*wealth|assets?\s*minus\s*liabilities?|wealth\s*overview|meri\s*daulat|assets?\s*liabilities?|net\s*worth\s*kya|meri\s*total\s*value|meri\s*property)\b/.test(m))
    return 'net_worth';

  // ── TAX TIPS ──
  if (/\b(tax|taxes|tax\s*saving|tax\s*tips|tax\s*plan|income\s*tax|filer|non.?filer|fbr|withholding|tax\s*return|tax\s*filing|tax\s*benefit|tax\s*bachao|tax\s*kaise\s*bachao|filer\s*kaise|tax\s*kya)\b/.test(m))
    return 'tax_tips';

  // ── SPENDING HABITS ──
  if (/\b(streak|habit|consistent|discipline|on\s*track|spending\s*pattern|spending\s*habit|daily\s*spend|adat|routine|pattern|roz\s*kitna|daily\s*average|avg\s*spend|roz\s*ka\s*kharch|aadat)\b/.test(m))
    return 'spending_habits';

  // ── BILL REMINDERS ──
  if (/\b(reminder|remind|due|due\s*date|payment\s*due|bill\s*due|upcoming\s*payment|yaad\s*dila|alert|bill\s*kab|kab\s*pay|payment\s*kab|bills?\s*reminder|bills?\s*due)\b/.test(m))
    return 'bill_reminder';

  // ── CURRENCY CONVERSION ──
  if (/\b(convert|conversion|usd|dollar|eur|euro|gbp|pound|pkr|exchange\s*rate|dollar\s*rate|currency|dollar\s*kitna|dollar\s*rate\s*kya|pkr\s*to|rupay\s*mein)\b/.test(m))
    return 'currency';

  // ── SALARY / INCOME INFO ──
  if (/\b(salary|my\s*income|meri\s*salary|meri\s*income|income\s*kya|salary\s*kitni|income\s*kitni|monthly\s*income|monthly\s*salary|apni\s*salary|income\s*dikhao|salary\s*dikhao)\b/.test(m) &&
      !/\b(what\s+if|if\s+i|double|triple|agar|increase|hike|raise|cut|reduce)\b/.test(m))
    return 'salary_info';

  // ── WHAT-IF: CAR (NEW) ──
  if (/\b(car|gaadi|gari|vehicle|auto|automobile)\b/i.test(rawMessage) &&
      /\b(what\s+if|if\s+i|buy|khareed|afford|agar|purchase|lena)\b/i.test(rawMessage))
    return 'car_hypothetical';

  // ── WHAT-IF: RENT ──
  if (/\b(rent|kiraya|house\s*rent|apartment|flat|ghar\s*ka\s*kiraya|makan\s*ka\s*kiraya)\b/i.test(rawMessage) &&
      /\b(what\s+if|if\s+i|suppose|agar|move|shifting)\b/i.test(rawMessage))
    return 'rent_hypothetical';

  // ── WHAT-IF: VACATION ──
  if (/\b(vacation|trip|holiday|tour|sair|safar|travel|ghoomna|jaana|visit)\b/i.test(rawMessage) &&
      /\b(what\s+if|if\s+i|afford|can\s+i|agar|plan|karna)\b/i.test(rawMessage))
    return 'vacation_hypothetical';

  // ── HYPOTHETICAL: SAVINGS ──
  var savingsHypoPatterns = [
    /what\s+if\s+i\s+sav/i, /if\s+i\s+sav/i, /suppose\s+i\s+sav/i,
    /assuming\s+i\s+sav/i, /if\s+saving/i,
    /save\s+(?:rs\.?\s*)?\d/i, /saved?\s+(?:rs\.?\s*)?\d/i,
    /sav(?:e|ed|ing)\s+(?:\d|rs|pkr)/i,
    /(?:rs\.?\s*)?\d[\d,k\.]*\s*(?:pkr|rupees?)?\s+(?:save|saving|saved)/i,
    /agar\s+main\s+save/i, /agar.*save.*karun/i, /save\s+karta\s+hoon/i,
    /savings\s+increase/i, /double.*savings/i, /triple.*savings/i,
    /cut.*expenses.*save/i, /zyada\s+save/i, /save\s+zyada/i,
    /\d+.*save\s+karun/i, /save\s+kar.*\d+/i,
    /bachat\s+\d/i, /\d.*bachat/i, /bachat\s+badhao/i,
    /agar.*bachat/i
  ];
  for (var si = 0; si < savingsHypoPatterns.length; si++) {
    if (savingsHypoPatterns[si].test(rawMessage) && sfExtractNumber(rawMessage) !== null)
      return 'savings_hypothetical';
  }
  if (/\b(double|triple|halve|increase)\b.*\bsavings?\b/i.test(rawMessage) ||
      /\b(double|triple|halve|increase)\b.*\bbachat\b/i.test(rawMessage))
    return 'savings_hypothetical_relative';

  // ── HYPOTHETICAL: INCOME ──
  var incomeHypoPatterns = [
    /what\s+if.*income/i, /if.*income.*(?:was|were|is|increase|decrease|drop|rise|fall)/i,
    /income.*(?:double|triple|cut|reduce|increase|raise|hike)/i,
    /salary.*(?:increase|hike|raise|cut|double|triple|badh|kam)/i,
    /raise\s+(?:my\s+)?(?:income|salary)/i, /agar.*income.*ho/i,
    /agar.*salary.*badhe/i, /promotion.*salary/i,
    /agar\s+salary\s+double/i, /agar\s+income\s+double/i,
    /salary\s+double\s+ho/i, /income\s+double\s+ho/i,
    /agar.*tankhwah/i, /tankhwah.*badhe/i
  ];
  for (var ii2 = 0; ii2 < incomeHypoPatterns.length; ii2++) {
    if (incomeHypoPatterns[ii2].test(rawMessage)) return 'income_hypothetical';
  }

  // ── HYPOTHETICAL: EXPENSE CUT ──
  var expCutPatterns = [
    /what\s+if.*(?:cut|reduce|lower|decrease|slash).*(?:expense|spending|groceries|bills|cost)/i,
    /if.*(?:cut|reduce|lower).*(?:groceries|bills|healthcare|education)\s*(?:by|to)?\s*\d/i,
    /(?:cut|reduce|lower|decrease)\s+(?:my\s+)?(?:groceries|bills|healthcare|education|food|expenses?)\s+(?:by|to)\s+\d/i,
    /save\s+on\s+(?:groceries|bills|food|subscriptions)/i,
    /(?:groceries|bills|healthcare|education|kharch)\s+(?:kam|reduce|cut)\s+kar/i,
    /agar.*(?:kam|reduce|cut).*(?:karun|karo|karein)/i
  ];
  for (var ec = 0; ec < expCutPatterns.length; ec++) {
    if (expCutPatterns[ec].test(rawMessage)) return 'expense_cut_hypothetical';
  }

  // ── HYPOTHETICAL: LOAN ──
  if (/\b(what\s+if.*(?:loan|debt|borrow|installment|emi)|if.*loan|loan\s+(?:of|for|loon|lena)|borrow.*\d|qarz.*\d|\d.*qarz|loan\s+repay|agar.*loan|agar.*qarz)\b/i.test(rawMessage))
    return 'loan_hypothetical';

  // ── HYPOTHETICAL: INFLATION (no greedy catch-all) ──
  var inflationHypoPatterns = [
    /what\s+if\s+inflation/i, /if\s+inflation\s+(?:was|were|is|rate)/i,
    /inflation\s+(?:was|were|rate|at)\s+\d/i, /suppose\s+inflation/i,
    /assuming\s+inflation/i, /hypothetical\s+inflation/i,
    /inflation\s+scenario/i,
    /what\s+if\s+(?:the\s+)?(?:inflation|rate)\s+(?:was|were|is)/i,
    /agar\s+inflation/i, /agar\s+mehngai/i,
    /inflation\s+\d+\s*(?:%|percent)/i, /mehngai\s+\d+\s*(?:%|percent)/i
  ];
  var isInflationHypo = false;
  for (var ii = 0; ii < inflationHypoPatterns.length; ii++) {
    if (inflationHypoPatterns[ii].test(rawMessage)) { isInflationHypo = true; break; }
  }
  if (isInflationHypo && sfExtractNumber(rawMessage) !== null) return 'inflation_hypothetical';

  // ── REAL INFLATION ──
  if (/\b(inflation|mahangai|mehngai|mehnga|price\s*rise|cost\s*of\s*living|purchasing\s*power|mehngai\s*kya|inflation\s*kya)\b/.test(m))
    return 'inflation';

  // ── REMAINING / BALANCE ──
  if (/\b(remaining|how\s*much\s*left|budget\s*left|bacha|kitna\s*bacha|baki|balance|whats?\s*left|left\s*over|left\s*in\s*budget|kitna\s*paisa\s*bacha|how\s*much\s*do\s*i\s*have|paisa\s*bacha|kya\s*bacha|baki\s*kitna|remaining\s*kya)\b/.test(m))
    return 'remaining';

  // ── OVERSPENDING ──
  if (/\b(over\s*budget|overspend|exceeded|zyada\s*kharch|highest\s*spending|most\s*spent|worst\s*category|where.*spend.*most|most.*spend|kahan\s*zyada|max.*spent|spending.*problem|where.*money\s*going|where.*spending|sab\s*se\s*zyada\s*kharch|kahan\s*zyada\s*kharch|paisay\s*kahan\s*ja\s*rahe)\b/.test(m))
    return 'overspend';

  // ── PROJECTION ──
  if (/\b(project|projection|forecast|end\s*of\s*month|month\s*end|predict|estimate|how\s*much\s*will\s*i\s*spend|mahine\s*ke\s*end|spend\s*this\s*month|monthly\s*forecast|mahine\s*ke\s*aakhir|aakhir\s*mein\s*kitna|mahine\s*ka\s*anuman)\b/.test(m))
    return 'projection';

  // ── GOAL (nav handled below, this catches complex goal queries) ──
  if (/\b(goal|target|manzil|achieve|dream|financial\s*goal|savings\s*goal|my\s*goal|goal\s*progress|about\s*my\s*goal|tell.*goal|goal.*tell|goals?\s*status|goals?\s*track|mera\s*goal|goal\s*kitna|goal\s*dikhao|goal\s*batao|goal\s*poora)\b/.test(m) &&
      !/\bsavings?\s+report\b/.test(m))
    return 'goal';

  // ── SAVINGS REPORT ──
  if (/^(savings?|my\s*savings?|bachat|bachat\s*dikhao|savings?\s*dikhao|meri\s*bachat)$/.test(m))
    return 'savings';
  if (/\b(savings?\s*report|savings?\s*overview|savings?\s*analysis|show\s*savings?|my\s*savings?|bachat|paisa\s*bachao|how\s*much\s*saved|kitna\s*save|kitni\s*bachat|bachat\s*kitni|bachat\s*kya|savings?\s*kitni)\b/.test(m))
    return 'savings';
  if (/\b(savings?|save|saving|bachana|bachaao|bachat)\b/.test(m) &&
      !/\b(goal|target|what\s*if|if\s*i|agar|double|triple|halve|\d)\b/.test(m))
    return 'savings';

  // ── BUDGET OVERVIEW ──
  if (/\b(budget|overview|summary|total\s*expenses?|total\s*spending|monthly\s*report|show\s*(?:my\s*)?budget|expense\s*breakdown|breakdown|full\s*report|budget\s*dikhao|mera\s*budget|budget\s*kya|poora\s*budget|budget\s*batao)\b/.test(m))
    return 'budget';

  // ── TIPS ──
  if (/\b(tip|advice|recommend|guide|suggest|kya\s*karun|help\s*me|mashwara|improve|what\s*should\s*i\s*do|how\s*to\s*save|how\s*can\s*i|best\s*way|kaise|suggest\s*karein|what\s*to\s*do|tips\s*do|tips\s*batao|kya\s*karo|kya\s*karein|paisa\s*kaise\s*bachao|paisa\s*bachao|kaise\s*bachao)\b/.test(m))
    return 'tips';

  // ── CATEGORY (last before follow-ups) ──
  if (sfExtractCategory(m)) return 'category';

  // ── GOALS NAV (single word) ──
  if (/^(goals?|my\s*goals?|goal\s*page|view\s*goals?|savings?\s*goals?|goals?\s*dikhao|goals?\s*batao|mera\s*goal)$/.test(m))
    return 'goal';

  // ── CONTEXT-AWARE FOLLOW-UPS ──
  if (/\b(more|elaborate|detail|explain|aur\s*batao|aur|what\s*else|then\s*what|tell\s*me\s*more|aur\s*kuch|aur\s*dikhao|aur\s*samjhao)\b/.test(m) && advisorState.lastIntent)
    return advisorState.lastIntent;

  return 'fallback';
}

// ── TRANSACTION SUMMARY ───────────────────────────────────────
function sfTransactionReply(ctx, lang) {
  try {
    var txns = ctx.transactions || [];
    if (!txns.length) {
      return sfT(lang,
        '📋 No transactions logged yet.\n\nAdd expenses in the Expenses section and I\'ll show your history here.',
        '📋 Abhi koi transaction record nahi hai.\n\nExpenses section mein add karein — phir main yahan history dikhaunga.'
      );
    }
    var recent = txns.slice(-5).reverse();
    var lines = recent.map(function(t) {
      var note = (t.note && String(t.note).trim()) ? ' — ' + t.note : '';
      var date = (t.date && String(t.date).trim()) ? ' (' + t.date + ')' : '';
      return '• ' + (t.category || 'General') + ': ' + sfFormatRs(t.amount || 0) + date + note;
    });
    var total = txns.reduce(function(a, t) { return a + (parseFloat(t.amount) || 0); }, 0);
    return sfT(lang,
      '📋 Recent Transactions:\n\n' + lines.join('\n') +
        '\n\n📊 Total logged: ' + txns.length + ' transactions | ' + sfFormatRs(total) + ' total.',
      '📋 Recent Transactions:\n\n' + lines.join('\n') +
        '\n\n📊 Total: ' + txns.length + ' transactions | ' + sfFormatRs(total) + ' total.'
    );
  } catch (e) {
    return sfT(lang, '📋 Could not load transactions.', '📋 Transactions load nahi ho sakin.');
  }
}

// ── MONTH COMPARE ─────────────────────────────────────────────
function sfCompareReply(ctx, lang) {
  try {
    var prev = null;
    try { prev = JSON.parse(localStorage.getItem('sf_prev_month') || 'null'); } catch (e) {}
    if (!prev) {
      return sfT(lang,
        '📅 No previous month data found yet.\n\nKeep logging expenses this month — next month you\'ll get a full side-by-side comparison!',
        '📅 Pichle mahine ka data abhi nahi mila.\n\nIs mahine expenses log karte rahein — agle mahine poori comparison milegi!'
      );
    }
    var cats = ['Groceries','Bills','Healthcare','Education','Savings'];
    var lines = cats.map(function(c) {
      var curr = Number((ctx.expenses && ctx.expenses[c]) || 0);
      var past = Number((prev.expenses && prev.expenses[c]) || 0);
      var diff = curr - past;
      var arrow = diff > 0 ? '📈 +' : diff < 0 ? '📉 ' : '➡️ ';
      return '• ' + c + ': ' + sfFormatRs(curr) +
        ' (' + arrow + sfFormatRs(Math.abs(diff)) + ' vs last month)';
    });
    var totalDiff = (ctx.totalSpent || 0) - ((prev && prev.totalSpent) || 0);
    return sfT(lang,
      '📊 Month-over-Month Comparison:\n\n' + lines.join('\n') +
        '\n\nOverall: ' + (totalDiff > 0
          ? '📈 ' + sfFormatRs(totalDiff) + ' MORE than last month.'
          : '📉 ' + sfFormatRs(Math.abs(totalDiff)) + ' LESS than last month. ✅'),
      '📊 Is Mahine vs Pichle Mahine:\n\n' + lines.join('\n') +
        '\n\nTotal: ' + (totalDiff > 0
          ? '📈 Pichle mahine se ' + sfFormatRs(totalDiff) + ' ZYADA kharch'
          : '📉 Pichle mahine se ' + sfFormatRs(Math.abs(totalDiff)) + ' KAM kharch ✅')
    );
  } catch (e) {
    return sfT(lang, '📅 Could not load comparison.', '📅 Comparison load nahi ho saka.');
  }
}

// ══════════════════════════════════════════════════════════════
// ── BILINGUAL QUICK REPLY CHIPS ───────────────────────────────
// ══════════════════════════════════════════════════════════════
function sfGetQuickReplies(intent, lang, turnCount) {
  // First turn always English (welcome is English by default)
  if (turnCount <= 1) {
    return ['Show my budget', 'Health score', 'Where am I overspending?', 'Give me tips'];
  }

  var en = {
    greet:                    ['Show my budget', 'Health score', 'Where am I overspending?', 'Give me tips'],
    budget:                   ['Groceries details', 'Bills details', 'Remaining budget', 'Give me tips'],
    health:                   ['Show my budget', 'Risk analysis', 'Where am I overspending?', 'Give me tips'],
    savings:                  ['What if I saved 20k?', 'Show my goal', 'Give me tips', 'Budget overview'],
    goal:                     ['What if I saved 20k?', 'Savings report', 'Give me tips', 'Projection'],
    goal_eta:                 ['Savings report', 'Budget overview', 'Give me tips'],
    overspend:                ['Groceries details', 'Bills details', 'Give me tips', 'Projection'],
    tips:                     ['Show my budget', 'Savings report', 'Goal progress', 'Projection'],
    inflation:                ['What if inflation was 10%?', 'Give me tips', 'Savings report'],
    remaining:                ['Give me tips', 'Where am I overspending?', 'Projection', 'Health score'],
    category:                 ['Show full budget', 'Give me tips', 'Remaining budget', 'Health score'],
    projection:               ['Give me tips', 'Where am I overspending?', 'Savings report'],
    transactions:             ['Budget overview', 'Health score', 'Give me tips'],
    compare:                  ['Budget overview', 'Give me tips', 'Health score'],
    savings_hypothetical:     ['Show my goal', 'Savings report', 'Budget overview', 'Give me tips'],
    savings_hypothetical_relative: ['What if I saved 20k?', 'Savings report', 'Give me tips'],
    inflation_hypothetical:   ['What if inflation was 5%?', 'Show my budget', 'Give me tips'],
    income_hypothetical:      ['Savings report', 'Budget overview', 'Give me tips', 'Projection'],
    expense_cut_hypothetical: ['Show my budget', 'Savings report', 'Give me tips', 'Remaining budget'],
    loan_hypothetical:        ['Show my budget', 'Remaining budget', 'Give me tips'],
    car_hypothetical:         ['Can I afford 15k?', 'Savings report', 'Remaining budget', 'Give me tips'],
    rent_hypothetical:        ['Show my budget', 'Remaining budget', 'Projection'],
    vacation_hypothetical:    ['Can I afford 30k?', 'Savings report', 'Give me tips'],
    afford:                   ['Show my budget', 'Remaining budget', 'Health score'],
    emergency:                ['Give me tips', 'Savings report', 'Budget overview'],
    investment:               ['Savings report', 'Give me tips', 'Health score'],
    budgeting_rules:          ['Show my budget', 'Give me tips', 'Savings report'],
    debt_overview:            ['Show my budget', 'Give me tips', 'Remaining budget'],
    net_worth:                ['Savings report', 'Budget overview', 'Give me tips'],
    tax_tips:                 ['Savings report', 'Give me tips', 'Budget overview'],
    spending_habits:          ['Give me tips', 'Budget overview', 'Projection'],
    bill_reminder:            ['Show my budget', 'Bills details', 'Give me tips'],
    currency:                 ['Show my budget', 'Health score', 'Give me tips'],
    salary_info:              ['Show my budget', 'Savings report', 'Give me tips'],
    about:                    ['Show my budget', 'Health score', 'Give me tips', 'Savings report'],
    help:                     ['Show my budget', 'Health score', 'Give me tips', 'Savings report'],
    nav_dashboard:            ['Show my budget', 'Health score', 'Where am I overspending?', 'Give me tips'],
    nav_expenses:             ['Show my budget', 'Groceries details', 'Bills details', 'Give me tips'],
    nav_insights:             ['Health score', 'Projection', 'Savings report', 'Give me tips'],
    fallback:                 ['Show my budget', 'Health score', 'Savings report', 'Give me tips']
  };

  var ur = {
    greet:                    ['Budget dikhao', 'Health score', 'Kahan zyada kharch?', 'Tips do'],
    budget:                   ['Groceries detail', 'Bills detail', 'Kitna bacha?', 'Tips do'],
    health:                   ['Budget dikhao', 'Risk analysis', 'Kahan zyada kharch?', 'Tips do'],
    savings:                  ['Agar 20k save karun?', 'Mera goal', 'Tips do', 'Budget dikhao'],
    goal:                     ['Agar 20k save karun?', 'Savings report', 'Tips do', 'Projection'],
    goal_eta:                 ['Savings report', 'Budget dikhao', 'Tips do'],
    overspend:                ['Groceries detail', 'Bills detail', 'Tips do', 'Projection'],
    tips:                     ['Budget dikhao', 'Savings report', 'Goal progress', 'Projection'],
    inflation:                ['Agar mehngai 10%?', 'Tips do', 'Savings report'],
    remaining:                ['Tips do', 'Kahan zyada kharch?', 'Projection', 'Health score'],
    category:                 ['Poora budget', 'Tips do', 'Kitna bacha?', 'Health score'],
    projection:               ['Tips do', 'Kahan zyada kharch?', 'Savings report'],
    transactions:             ['Budget dikhao', 'Health score', 'Tips do'],
    compare:                  ['Budget dikhao', 'Tips do', 'Health score'],
    savings_hypothetical:     ['Mera goal', 'Savings report', 'Budget dikhao', 'Tips do'],
    savings_hypothetical_relative: ['Agar 20k save karun?', 'Savings report', 'Tips do'],
    inflation_hypothetical:   ['Agar mehngai 5%?', 'Budget dikhao', 'Tips do'],
    income_hypothetical:      ['Savings report', 'Budget dikhao', 'Tips do', 'Projection'],
    expense_cut_hypothetical: ['Budget dikhao', 'Savings report', 'Tips do', 'Kitna bacha?'],
    loan_hypothetical:        ['Budget dikhao', 'Kitna bacha?', 'Tips do'],
    car_hypothetical:         ['15k afford?', 'Savings report', 'Kitna bacha?', 'Tips do'],
    rent_hypothetical:        ['Budget dikhao', 'Kitna bacha?', 'Projection'],
    vacation_hypothetical:    ['30k afford?', 'Savings report', 'Tips do'],
    afford:                   ['Budget dikhao', 'Kitna bacha?', 'Health score'],
    emergency:                ['Tips do', 'Savings report', 'Budget dikhao'],
    investment:               ['Savings report', 'Tips do', 'Health score'],
    budgeting_rules:          ['Budget dikhao', 'Tips do', 'Savings report'],
    debt_overview:            ['Budget dikhao', 'Tips do', 'Kitna bacha?'],
    net_worth:                ['Savings report', 'Budget dikhao', 'Tips do'],
    tax_tips:                 ['Savings report', 'Tips do', 'Budget dikhao'],
    spending_habits:          ['Tips do', 'Budget dikhao', 'Projection'],
    bill_reminder:            ['Budget dikhao', 'Bills detail', 'Tips do'],
    currency:                 ['Budget dikhao', 'Health score', 'Tips do'],
    salary_info:              ['Budget dikhao', 'Savings report', 'Tips do'],
    about:                    ['Budget dikhao', 'Health score', 'Tips do', 'Savings report'],
    help:                     ['Budget dikhao', 'Health score', 'Tips do', 'Savings report'],
    nav_dashboard:            ['Budget dikhao', 'Health score', 'Kahan zyada kharch?', 'Tips do'],
    nav_expenses:             ['Budget dikhao', 'Groceries detail', 'Bills detail', 'Tips do'],
    nav_insights:             ['Health score', 'Projection', 'Savings report', 'Tips do'],
    fallback:                 ['Budget dikhao', 'Health score', 'Savings report', 'Tips do']
  };

  var chips = lang === 'ur'
    ? (ur[intent] || ur.fallback)
    : (en[intent] || en.fallback);
  return chips.slice(0, 4);
}

// ── VARIED FALLBACK RESPONSES ────────────────────────────────
var sfFallbackResponses = [
  function(ctx, lang) {
    return sfT(lang,
      '🤔 I didn\'t quite catch that. Here\'s what I can help with:\n\n' +
      '• "show my budget" — full expense breakdown\n' +
      '• "health score" — your financial health rating\n' +
      '• "where am I overspending?" — top concern area\n' +
      '• "give me tips" — personalised money advice\n' +
      '• "What if I saved 20k?" — savings scenario\n' +
      '• "Can I afford 15k?" — affordability check\n' +
      '• Type "help" for the full list',
      '🤔 Samajh nahi aaya. Yeh try karein:\n\n' +
      '• "budget dikhao" — poora breakdown\n' +
      '• "health score" — financial health\n' +
      '• "kahan zyada kharch?" — top concern\n' +
      '• "tips do" — personalised mashwara\n' +
      '• "Agar 20k save karun?" — scenario\n' +
      '• "help" likhein poori list ke liye'
    );
  },
  function(ctx, lang) {
    var icon = ctx.healthScore >= 70 ? '🟢' : ctx.healthScore >= 40 ? '🟡' : '🔴';
    return sfT(lang,
      '📊 Quick check: Health ' + ctx.healthScore + '% ' + icon + ' | Remaining: ' + sfFormatRs(ctx.remaining) + '\n\n' +
      '❓ What would you like to explore?\n' +
      '• "projection" — month-end spending estimate\n' +
      '• "savings report" — savings analysis\n' +
      '• "net worth" | "tax tips" | "emergency fund"\n' +
      '• "What if inflation was 10%?" — inflation impact\n' +
      '• "compare last month" — month-over-month',
      '📊 Quick check: Health ' + ctx.healthScore + '% ' + icon + ' | Bachi: ' + sfFormatRs(ctx.remaining) + '\n\n' +
      '❓ Kya explore karna hai?\n' +
      '• "projection" — mahine ke end ka andaza\n' +
      '• "savings report" — bachat ka jaiza\n' +
      '• "net worth" | "tax tips" | "emergency fund"\n' +
      '• "Agar mehngai 10%?" — inflation impact\n' +
      '• "pichle mahine compare" — comparison'
    );
  },
  function(ctx, lang) {
    var top = sfPickTopOver(ctx);
    var topPct = top ? sfPct(Number((ctx.expenses && ctx.expenses[top]) || 0), Number((ctx.planned && ctx.planned[top]) || 0)) : 0;
    var nudge = topPct > 70
      ? sfT(lang,
          '💡 ' + top + ' is at ' + topPct + '% of its budget — worth reviewing.',
          '💡 ' + top + ' ' + topPct + '% budget use kar chuka hai — review karein.')
      : sfT(lang, '💡 Overall you\'re on track this month.', '💡 Is mahine budget theek chal raha hai.');
    return sfT(lang,
      nudge + '\n\n🔮 Try a what-if scenario:\n' +
      '• "What if I saved 30k?" | "What if income doubled?"\n' +
      '• "What if I cut bills by 20%?" | "What if I took a loan?"\n' +
      '• "What if I buy a car for 15 lac?"\n' +
      '• "debt overview" | "bill reminders" | "convert USD"',
      nudge + '\n\n🔮 Koi scenario try karein:\n' +
      '• "Agar 30k save karun?" | "Income double ho?"\n' +
      '• "Bills 20% kam karun?" | "Loan loon?"\n' +
      '• "Agar car khareedun 15 lac ki?"\n' +
      '• "qarz overview" | "bill reminders" | "dollar rate"'
    );
  }
];

// ══════════════════════════════════════════════════════════════
// ── MAIN REPLY ENGINE ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function sfReply(ctx, message) {
  ctx = ctx || {};
  ctx.expenses     = ctx.expenses     || {};
  ctx.planned      = ctx.planned      || {};
  ctx.transactions = ctx.transactions || [];
  ctx.totalSpent   = Number(ctx.totalSpent)   || 0;
  ctx.totalPlanned = Number(ctx.totalPlanned) || 0;
  ctx.remaining    = Number(ctx.remaining)    || 0;
  ctx.healthScore  = Number(ctx.healthScore)  || 100;
  ctx.riskLevel    = ctx.riskLevel            || 'Low Risk';
  ctx.income       = Number(ctx.income)       || 0;
  ctx.inflation    = Number(ctx.inflation)    || 0;
  ctx.goalTarget   = Number(ctx.goalTarget)   || 0;
  ctx.goalSaved    = Number(ctx.goalSaved)    || 0;

  var lang   = sfLang(message);
  advisorState.lastLang = lang;
  var raw    = message;
  var m      = sfNormalize(message);
  var intent = sfDetectIntent(raw);
  advisorState.lastIntent = intent;
  advisorState.turnCount  = (advisorState.turnCount || 0) + 1;

  // ── CLEAR ──
  if (intent === 'clear') {
    conversationHistory = [];
    advisorState = { lastIntent: null, lastCategory: null, lastAsked: null, lastEntities: {}, turnCount: 0, fallbackCount: 0, lastLang: 'en', sessionStart: Date.now() };
    return sfT(lang,
      '🧹 Chat cleared! What would you like to explore?',
      '🧹 Chat clear ho gaya! Ab kya jaanna hai?'
    );
  }

  // ── GREET ──
  if (intent === 'greet') return sfProfessionalWelcome(ctx, lang);

  // ── THANKS ──
  if (intent === 'thanks') {
    return sfT(lang,
      '😊 Happy to help! Anything else you\'d like to check?',
      '😊 Khushi hui! Kuch aur bhi jaanna hai?'
    );
  }

  // ── ABOUT ──
  if (intent === 'about') {
    return sfT(lang,
      '🤖 I\'m your built-in Smart Financial Advisor.\n\n' +
      'I use your real budget and expense data to give practical, personalised guidance.\n\n' +
      'I can help with:\n' +
      '• 📊 Budget breakdowns & expense analysis\n' +
      '• 💰 Savings reports & goal tracking\n' +
      '• 📈 Health score & risk assessment\n' +
      '• 🔮 What-if scenarios (income, savings, loans, car, rent, vacation)\n' +
      '• 📉 Inflation impact & projections\n' +
      '• 🏦 Debt overview & net worth\n' +
      '• 🧾 Tax tips & bill reminders\n' +
      '• 💱 Currency conversion\n\n' +
      'I understand both English and Urdu — just type naturally!',
      '🤖 Main aap ka Smart Financial Advisor hoon.\n\n' +
      'Aap ke real budget aur expenses ka data use karke practical guidance deta hoon.\n\n' +
      'Main in cheezon mein help kar sakta hoon:\n' +
      '• 📊 Budget breakdown aur expense analysis\n' +
      '• 💰 Savings report aur goal tracking\n' +
      '• 📈 Health score aur risk assessment\n' +
      '• 🔮 What-if scenarios (income, savings, loan, car, kiraya, trip)\n' +
      '• 📉 Mehngai ka asar aur projections\n' +
      '• 🏦 Qarz overview aur net worth\n' +
      '• 🧾 Tax tips aur bill reminders\n' +
      '• 💱 Currency conversion\n\n' +
      'Main English aur Urdu dono samajhta hoon — jo marzi likhein!'
    );
  }

  // ── HELP ──
  if (intent === 'help') {
    return sfT(lang,
      '💡 Here\'s everything you can ask me:\n\n' +
      '📊 BUDGET & SPENDING\n' +
      '• "show my budget" | "budget overview"\n' +
      '• "where am I overspending?" | "remaining budget"\n' +
      '• "groceries" / "bills" / "healthcare" / "education"\n\n' +
      '💰 SAVINGS & GOALS\n' +
      '• "savings report" | "savings"\n' +
      '• "goal" | "goal progress" | "when will I reach my goal?"\n\n' +
      '📈 HEALTH & RISK\n' +
      '• "health score" | "risk analysis" | "am I on track?"\n\n' +
      '🔮 WHAT-IF SCENARIOS\n' +
      '• "What if I saved 20k?"\n' +
      '• "What if income doubled?"\n' +
      '• "What if inflation was 10%?"\n' +
      '• "What if I cut bills by 20%?"\n' +
      '• "What if I took a loan of 5 lac?"\n' +
      '• "What if I buy a car for 15 lac?"\n' +
      '• "What if rent is 30k?"\n' +
      '• "What if vacation costs 50k?"\n' +
      '• "Can I afford 15k?"\n\n' +
      '🌍 OTHER TOOLS\n' +
      '• "inflation" | "projection" | "give me tips"\n' +
      '• "emergency fund" | "investment basics"\n' +
      '• "net worth" | "tax tips" | "debt overview"\n' +
      '• "bill reminders" | "spending habits"\n' +
      '• "compare last month" | "recent transactions"\n' +
      '• "convert 100 USD to PKR" | "50/25/25 rule"\n\n' +
      '🗣️ Works in Urdu too — just type naturally!',
      '💡 Yeh sab puch sakte hain:\n\n' +
      '📊 BUDGET: "budget dikhao", "kahan zyada kharch?", "kitna bacha?"\n' +
      '📂 CATEGORIES: "groceries", "bills", "healthcare", "education"\n' +
      '💰 SAVINGS: "bachat", "savings report", "goal dikhao"\n' +
      '📈 HEALTH: "health score", "risk analysis", "sab theek?"\n\n' +
      '🔮 WHAT-IF:\n' +
      '• "Agar 20k save karun?"\n' +
      '• "Agar income double ho jaaye?"\n' +
      '• "Agar mehngai 10% ho?"\n' +
      '• "Agar 5 lac ka loan loon?"\n' +
      '• "Agar car khareedun 15 lac ki?"\n' +
      '• "Agar kiraya 30k ho?"\n' +
      '• "Kya main 15k afford kar sakta hoon?"\n\n' +
      '🌍 TOOLS: "mehngai", "projection", "tips do", "emergency fund",\n' +
      '"investment", "net worth", "tax tips", "bill reminders",\n' +
      '"dollar rate", "pichle mahine compare"'
    );
  }

  // ── APP NAVIGATION ──
  if (intent === 'nav_dashboard') {
    var dIcon = ctx.healthScore >= 70 ? '🟢' : ctx.healthScore >= 40 ? '🟡' : '🔴';
    return sfT(lang,
      '🏠 Dashboard Overview:\n\n' +
      '• Health Score: ' + ctx.healthScore + '% ' + dIcon + ' (' + ctx.riskLevel + ')\n' +
      '• Total Planned: ' + sfFormatRs(ctx.totalPlanned) + '\n' +
      '• Total Spent: ' + sfFormatRs(ctx.totalSpent) + '\n' +
      '• Remaining: ' + sfFormatRs(ctx.remaining) + (ctx.remaining < 0 ? ' ⚠️ OVER budget!' : ' ✅') + '\n\n' +
      '💬 Ask me anything about your finances below.',
      '🏠 Dashboard:\n\n' +
      '• Health Score: ' + ctx.healthScore + '% ' + dIcon + ' (' + ctx.riskLevel + ')\n' +
      '• Planned: ' + sfFormatRs(ctx.totalPlanned) + '\n' +
      '• Spent: ' + sfFormatRs(ctx.totalSpent) + '\n' +
      '• Remaining: ' + sfFormatRs(ctx.remaining) + (ctx.remaining < 0 ? ' ⚠️ Over budget!' : ' ✅') + '\n\n' +
      '💬 Koi bhi sawaal puchein.'
    );
  }

  if (intent === 'nav_expenses') {
    var eCats = ['Groceries','Bills','Healthcare','Education'];
    var eLines = '';
    eCats.forEach(function(c) {
      var sp = Number((ctx.expenses && ctx.expenses[c]) || 0);
      var pl = Number((ctx.planned && ctx.planned[c]) || 0);
      var pc = sfPct(sp, pl);
      var eBar = pc >= 100 ? '🔴' : pc >= 75 ? '🟡' : '🟢';
      eLines += '\n• ' + c + ': ' + sfFormatRs(sp) + ' / ' + sfFormatRs(pl) + ' (' + pc + '%) ' + eBar;
    });
    return sfT(lang,
      '💸 Expenses Summary:\n' + (eLines || '\n• No expenses logged yet.') + '\n\n' +
      '• Total Spent: ' + sfFormatRs(ctx.totalSpent) + '\n' +
      '• Remaining: ' + sfFormatRs(ctx.remaining) + '\n\n' +
      '💡 Ask: "groceries details", "bills details", or "where am I overspending?"',
      '💸 Expenses Summary:\n' + (eLines || '\n• Abhi koi expense log nahi.') + '\n\n' +
      '• Total Kharch: ' + sfFormatRs(ctx.totalSpent) + '\n' +
      '• Remaining: ' + sfFormatRs(ctx.remaining) + '\n\n' +
      '💡 Puchein: "groceries", "bills", ya "kahan zyada kharch?"'
    );
  }

  if (intent === 'nav_insights') {
    var iIcon = ctx.healthScore >= 70 ? '🟢' : ctx.healthScore >= 40 ? '🟡' : '🔴';
    var iTop = sfPickTopOver(ctx);
    var iTopPct = iTop ? sfPct(Number((ctx.expenses && ctx.expenses[iTop]) || 0), Number((ctx.planned && ctx.planned[iTop]) || 0)) : 0;
    var iSv = Number((ctx.expenses && ctx.expenses.Savings) || 0);
    var iSvRate = ctx.income > 0 ? Math.round((iSv / ctx.income) * 100) : 0;
    return sfT(lang,
      '📊 Insights Overview:\n\n' +
      '• Health Score: ' + ctx.healthScore + '% ' + iIcon + '\n' +
      '• Savings Rate: ' + iSvRate + '% of income\n' +
      '• Top Concern: ' + (iTop || 'None') + (iTopPct > 70 ? ' (' + iTopPct + '% used) ⚠️' : ' ✅') + '\n' +
      '• Remaining Budget: ' + sfFormatRs(ctx.remaining) + '\n\n' +
      '💡 Ask: "health score", "projection", "savings report", "give me tips"',
      '📊 Insights:\n\n' +
      '• Health Score: ' + ctx.healthScore + '% ' + iIcon + '\n' +
      '• Savings Rate: income ka ' + iSvRate + '%\n' +
      '• Sabse badi concern: ' + (iTop || 'Koi nahi') + (iTopPct > 70 ? ' (' + iTopPct + '% used) ⚠️' : ' ✅') + '\n' +
      '• Remaining: ' + sfFormatRs(ctx.remaining) + '\n\n' +
      '💡 Puchein: "health score", "projection", "savings", "tips do"'
    );
  }

  // ── TRANSACTIONS ──
  if (intent === 'transactions') return sfTransactionReply(ctx, lang);

  // ── COMPARE ──
  if (intent === 'compare') return sfCompareReply(ctx, lang);

  // ── SALARY INFO (NEW) ──
  if (intent === 'salary_info') {
    if (!ctx.income || ctx.income === 0) {
      return sfT(lang,
        '💼 No income set yet.\n\nGo to Settings and enter your monthly income — it unlocks savings rate, tax bracket, and all financial ratios!',
        '💼 Income abhi set nahi hai.\n\nSettings mein apni monthly income enter karein — is se savings rate, tax bracket, aur sab financial ratios unlock ho jayenge!'
      );
    }
    var svI = Number((ctx.expenses && ctx.expenses.Savings) || 0);
    var svRateI = Math.round((svI / ctx.income) * 100);
    var spentRateI = Math.round((ctx.totalSpent / ctx.income) * 100);
    var annualI = ctx.income * 12;
    return sfT(lang,
      '💼 Income Overview:\n\n' +
      '• Monthly Income: ' + sfFormatRs(ctx.income) + '\n' +
      '• Annual Income: ' + sfFormatRs(annualI) + '\n' +
      '• Budget used: ' + spentRateI + '% of income\n' +
      '• Savings rate: ' + svRateI + '% of income\n\n' +
      (svRateI >= 25 ? '🌟 Excellent savings rate — top tier!' :
       svRateI >= 10 ? '👍 Good — aim for 25% of income in savings.' :
       '⚠️ Low savings rate — try to save at least 10–25% of income.') + '\n\n' +
      '💡 Recommended split: 50% needs | 25% savings | 25% wants',
      '💼 Income Overview:\n\n' +
      '• Monthly Income: ' + sfFormatRs(ctx.income) + '\n' +
      '• Salana Income: ' + sfFormatRs(annualI) + '\n' +
      '• Budget use: income ka ' + spentRateI + '%\n' +
      '• Savings rate: income ka ' + svRateI + '%\n\n' +
      (svRateI >= 25 ? '🌟 Zabardast savings rate!' :
       svRateI >= 10 ? '👍 Acha hai — 25% target karein.' :
       '⚠️ Savings rate kam hai — kam se kam 10–25% save karein.') + '\n\n' +
      '💡 Recommended split: 50% zarooriyat | 25% bachat | 25% khwahishaat'
    );
  }

  // ── HEALTH / RISK SCORE ──
  if (intent === 'health') {
    var hIcon = ctx.healthScore >= 70 ? '🟢' : ctx.healthScore >= 40 ? '🟡' : '🔴';
    var riskDetail = '';
    if (ctx.healthScore >= 70) {
      riskDetail = sfT(lang,
        '✅ LOW RISK — You\'re in a strong financial position.\n\n' +
        '• Spending is well within budget\n' +
        '• Keep maintaining this discipline\n' +
        '• Consider increasing savings toward 25% of income\n' +
        '• Good time to build or top up your emergency fund',
        '✅ LOW RISK — Aap ki financial position mazboot hai.\n\n' +
        '• Kharch budget ke andar hai — shabash!\n' +
        '• Yahi discipline barqarar rakhein\n' +
        '• Savings ko income ka 25% tak le jayein\n' +
        '• Emergency fund banane ka yeh acha waqt hai'
      );
    } else if (ctx.healthScore >= 40) {
      var modTop = sfPickTopOver(ctx);
      riskDetail = sfT(lang,
        '⚠️ MODERATE RISK — Some spending areas need attention.\n\n' +
        '• Top concern: ' + modTop + ' spending is high\n' +
        '• Review 1–2 categories and set stricter limits\n' +
        '• Aim to increase your health score above 70%\n' +
        '• Avoid taking on new debt right now',
        '⚠️ MODERATE RISK — Kuch categories mein dhyan dena hoga.\n\n' +
        '• Sabse badi concern: ' + modTop + ' ka kharch zyada hai\n' +
        '• 1–2 categories mein strict limits lagayein\n' +
        '• Health score 70% se upar le jane ki koshish karein\n' +
        '• Abhi naya qarz lene se bachein'
      );
    } else {
      var highTop = sfPickTopOver(ctx);
      riskDetail = sfT(lang,
        '🚨 HIGH RISK — Immediate action required!\n\n' +
        '• You are significantly over budget\n' +
        '• Worst category: ' + highTop + '\n' +
        '• Cut ALL non-essential spending immediately\n' +
        '• Do NOT take any new loans or debt\n' +
        '• Set up a strict daily spending limit',
        '🚨 HIGH RISK — Fauran action zaroor hai!\n\n' +
        '• Budget kaafi zyada exceed ho gaya hai\n' +
        '• Sabse buri category: ' + highTop + '\n' +
        '• Sab non-essential kharch fauran rokein\n' +
        '• Koi naya qarz bilkul na lein\n' +
        '• Roz ka spending limit set karein'
      );
    }
    return sfT(lang,
      '📊 Financial Health Score: ' + ctx.healthScore + '% ' + hIcon + ' (' + ctx.riskLevel + ')\n\n' +
        riskDetail + '\n\n' +
        '────────────────────\n' +
        '• Total Spent: ' + sfFormatRs(ctx.totalSpent) + '\n' +
        '• Total Planned: ' + sfFormatRs(ctx.totalPlanned) + '\n' +
        '• Remaining: ' + sfFormatRs(ctx.remaining),
      '📊 Financial Health Score: ' + ctx.healthScore + '% ' + hIcon + ' (' + ctx.riskLevel + ')\n\n' +
        riskDetail + '\n\n' +
        '────────────────────\n' +
        '• Total Kharch: ' + sfFormatRs(ctx.totalSpent) + '\n' +
        '• Total Planned: ' + sfFormatRs(ctx.totalPlanned) + '\n' +
        '• Remaining: ' + sfFormatRs(ctx.remaining)
    );
  }

  // ── BUDGET OVERVIEW ──
  if (intent === 'budget') {
    var usedPct = sfPct(ctx.totalSpent, ctx.totalPlanned);
    var bCats = ['Groceries','Bills','Healthcare','Education','Savings'];
    var breakdown = '';
    bCats.forEach(function(c) {
      var sp = Number((ctx.expenses && ctx.expenses[c]) || 0);
      var pl = Number((ctx.planned && ctx.planned[c]) || 0);
      if (pl > 0 || sp > 0) {
        var pc = sfPct(sp, pl);
        var bBar = pc >= 100 ? '🔴' : pc >= 75 ? '🟡' : '🟢';
        breakdown += '\n• ' + c + ': ' + sfFormatRs(sp) + ' / ' + sfFormatRs(pl) + ' (' + pc + '%) ' + bBar;
      }
    });
    return sfT(lang,
      '📊 Monthly Budget Overview:\n\n' +
        '• Planned: ' + sfFormatRs(ctx.totalPlanned) + (ctx.inflation ? '  (inflation: ' + ctx.inflation + '%)' : '') + '\n' +
        '• Spent: ' + sfFormatRs(ctx.totalSpent) + ' (' + usedPct + '%)\n' +
        '• Remaining: ' + sfFormatRs(ctx.remaining) + (ctx.remaining < 0 ? ' ⚠️ OVER budget!' : ' ✅') +
        '\n\nCategory Breakdown:' + (breakdown || '\n• No expenses logged yet.') +
        '\n\nAsk about any category for more detail.',
      '📊 Monthly Budget:\n\n' +
        '• Planned: ' + sfFormatRs(ctx.totalPlanned) + '\n' +
        '• Kharch: ' + sfFormatRs(ctx.totalSpent) + ' (' + usedPct + '%)\n' +
        '• Remaining: ' + sfFormatRs(ctx.remaining) + (ctx.remaining < 0 ? ' ⚠️ Over budget!' : ' ✅') +
        '\n\nCategory Breakdown:' + (breakdown || '\n• Abhi koi expense log nahi.') +
        '\n\nKisi bhi category ke baare mein pooch sakte hain.'
    );
  }

  // ── REMAINING ──
  if (intent === 'remaining') {
    var rCats = ['Groceries','Bills','Healthcare','Education','Savings'];
    var remLines = '';
    rCats.forEach(function(c) {
      var rem = (Number((ctx.planned && ctx.planned[c]) || 0)) -
                (Number((ctx.expenses && ctx.expenses[c]) || 0));
      remLines += '\n• ' + c + ': ' + (rem >= 0
        ? sfFormatRs(rem) + ' left ✅'
        : sfFormatRs(Math.abs(rem)) + ' OVER ⚠️');
    });
    var nowDate = new Date();
    var daysInMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
    var daysLeft = daysInMonth - nowDate.getDate();
    var dailyAllowance = daysLeft > 0 && ctx.remaining > 0 ? Math.round(ctx.remaining / daysLeft) : 0;
    var dailyNote = dailyAllowance > 0
      ? sfT(lang,
          '\n\n💡 ' + daysLeft + ' days left: spend max ' + sfFormatRs(dailyAllowance) + '/day to stay on track.',
          '\n\n💡 ' + daysLeft + ' din bache hain: max ' + sfFormatRs(dailyAllowance) + '/din kharch karein.')
      : '';
    return sfT(lang,
      '💰 Remaining Budget: ' + sfFormatRs(ctx.remaining) + '\n\n' +
        (ctx.remaining >= 0 ? '✅ You still have budget remaining.' : '⚠️ You are over budget!') +
        '\n' + remLines + dailyNote,
      '💰 Remaining Budget: ' + sfFormatRs(ctx.remaining) + '\n\n' +
        (ctx.remaining >= 0 ? '✅ Budget bacha hua hai.' : '⚠️ Budget exceed ho gaya!') +
        '\n' + remLines + dailyNote
    );
  }

  // ── OVERSPENDING ──
  if (intent === 'overspend') {
    var oWorst = sfPickTopOver(ctx);
    var oWa = Number((ctx.expenses && ctx.expenses[oWorst]) || 0);
    var oWp = Number((ctx.planned && ctx.planned[oWorst]) || 0);
    var oWpc = sfPct(oWa, oWp);
    var oOver = oWa - oWp;
    var oCatTips = {
      Groceries:  { en: '📝 Make a weekly shopping list. Set a per-trip cash limit and avoid impulse purchases.', ur: '📝 Weekly shopping list banayein. Impulse buying se bachein.' },
      Bills:      { en: '📋 Review all subscriptions — cancel unused ones. Set auto-pay to avoid late fees.', ur: '📋 Unused subscriptions cancel karein. Auto-pay set karein.' },
      Healthcare: { en: '🏥 Keep a small monthly health buffer of Rs. 2,000–5,000 for unexpected costs.', ur: '🏥 Chhoti health emergency ke liye Rs. 2,000–5,000 ka buffer rakhein.' },
      Education:  { en: '📚 Mix paid learning with free resources like YouTube, Coursera, or Khan Academy.', ur: '📚 Paid ke saath free resources bhi use karein — YouTube, Coursera.' },
      Savings:    { en: '💰 Great focus area — increase savings even by a small amount each month.', ur: '💰 Savings badhane ki koshish karein — thodi thodi hi sahi.' }
    };
    var oTip = oCatTips[oWorst] || oCatTips.Groceries;
    var oAllCats = ['Groceries','Bills','Healthcare','Education'];
    var oRanked = oAllCats.map(function(c) {
      var s = Number((ctx.expenses && ctx.expenses[c]) || 0);
      var p = Number((ctx.planned && ctx.planned[c]) || 0);
      return { c: c, pct: sfPct(s, p) };
    }).sort(function(a, b) { return b.pct - a.pct; });
    var oRankLines = oRanked.map(function(r) {
      var oRIcon = r.pct >= 100 ? '🔴' : r.pct >= 75 ? '🟡' : '🟢';
      return '• ' + r.c + ': ' + r.pct + '% used ' + oRIcon;
    }).join('\n');
    return sfT(lang,
      '🔍 Top Overspending Area: ' + oWorst + '\n\n' +
        '• Spent: ' + sfFormatRs(oWa) + '\n' +
        '• Budget: ' + sfFormatRs(oWp) + '\n' +
        '• Usage: ' + oWpc + '%\n' +
        (oOver > 0 ? '• Over by: ' + sfFormatRs(oOver) + ' ⚠️\n' : '') +
        '\nAll categories:\n' + oRankLines +
        '\n\n' + oTip.en,
      '🔍 Sabse Zyada Overspending: ' + oWorst + '\n\n' +
        '• Kharch: ' + sfFormatRs(oWa) + '\n' +
        '• Budget: ' + sfFormatRs(oWp) + '\n' +
        '• Usage: ' + oWpc + '%\n' +
        (oOver > 0 ? '• Zyada: ' + sfFormatRs(oOver) + ' ⚠️\n' : '') +
        '\nSab categories:\n' + oRankLines +
        '\n\n' + oTip.ur
    );
  }

  // ── CATEGORY DETAIL ──
  if (intent === 'category') {
    var cat = sfExtractCategory(m) || advisorState.lastCategory || 'Groceries';
    advisorState.lastCategory = cat;
    var cSp = Number((ctx.expenses && ctx.expenses[cat]) || 0);
    var cPl = Number((ctx.planned && ctx.planned[cat]) || 0);
    var cPc = sfPct(cSp, cPl);
    var cRem = cPl - cSp;
    var cStEn = cat === 'Savings'
      ? (cSp >= cPl ? 'Target reached ✅' : 'Below target 💡')
      : (cPl > 0 && cSp > cPl ? 'Over budget 🔴' : cPc >= 75 ? 'Close to limit 🟡' : 'On track 🟢');
    var cStUr = cat === 'Savings'
      ? (cSp >= cPl ? 'Target complete ✅' : 'Target se kam 💡')
      : (cPl > 0 && cSp > cPl ? 'Over budget 🔴' : cPc >= 75 ? 'Limit ke qareeb 🟡' : 'On track 🟢');
    var cCatTips = {
      Groceries:  { en: '💡 Tip: Shop weekly, not daily. Use a list — saves 20–30% on average.', ur: '💡 Tip: Hafta wari shopping karein. List le kar jayein — 20–30% ki bachat hoti hai.' },
      Bills:      { en: '💡 Tip: Set auto-pay reminders to avoid late fees. Cancel unused subscriptions.', ur: '💡 Tip: Auto-pay set karein. Unused subscriptions cancel karein.' },
      Healthcare: { en: '💡 Tip: Keep a Rs.2,000–5,000 monthly health buffer for unexpected costs.', ur: '💡 Tip: Rs.2,000–5,000 ka monthly health buffer zaroor rakhein.' },
      Education:  { en: '💡 Tip: Supplement paid courses with free resources like Coursera or YouTube.', ur: '💡 Tip: Paid courses ke saath Coursera ya YouTube se free resources bhi use karein.' },
      Savings:    { en: '💡 Tip: Target saving at least 25% of your monthly income consistently.', ur: '💡 Tip: Income ka 25% consistently save karna target banayein.' }
    };
    var cTip = cCatTips[cat] || { en: '', ur: '' };
    var cNowDate = new Date();
    var cDaysLeft = new Date(cNowDate.getFullYear(), cNowDate.getMonth() + 1, 0).getDate() - cNowDate.getDate();
    var cDailyLine = cDaysLeft > 0 && cRem > 0
      ? sfT(lang,
          '• Daily allowance left: ' + sfFormatRs(Math.round(cRem / cDaysLeft)) + '/day\n',
          '• Roz ka allowance: ' + sfFormatRs(Math.round(cRem / cDaysLeft)) + '/din\n')
      : '';
    return sfT(lang,
      '📂 ' + cat + ' Details:\n\n' +
        '• Spent: ' + sfFormatRs(cSp) + '\n' +
        '• Budget: ' + sfFormatRs(cPl) + '\n' +
        '• Usage: ' + cPc + '% — ' + cStEn + '\n' +
        '• Remaining: ' + sfFormatRs(sfClamp(cRem, -9999999, 9999999)) + '\n' +
        cDailyLine + '\n' + cTip.en,
      '📂 ' + cat + ' Detail:\n\n' +
        '• Kharch: ' + sfFormatRs(cSp) + '\n' +
        '• Budget: ' + sfFormatRs(cPl) + '\n' +
        '• Usage: ' + cPc + '% — ' + cStUr + '\n' +
        '• Remaining: ' + sfFormatRs(sfClamp(cRem, -9999999, 9999999)) + '\n' +
        cDailyLine + '\n' + cTip.ur
    );
  }

  // ── SAVINGS REPORT ──
  if (intent === 'savings') {
    var sv = Number((ctx.expenses && ctx.expenses.Savings) || 0);
    var svp = Number((ctx.planned && ctx.planned.Savings) || 0);
    var svpc = sfPct(sv, svp);
    var svRate = ctx.income > 0 ? Math.round((sv / ctx.income) * 100) : 0;
    var svAnnual = sv * 12;
    var svAdvEn = svRate >= 25
      ? '🌟 Excellent! Saving ' + svRate + '% of income. Consistently strong!'
      : svRate >= 10
      ? '👍 Good start — push toward 25% of income for stronger security.'
      : '⚠️ Low savings rate. Try "pay yourself first" — transfer savings on salary day.';
    var svAdvUr = svRate >= 25
      ? '🌟 Zabardast! Income ka ' + svRate + '% save kar rahe hain. Bahut acha!'
      : svRate >= 10
      ? '👍 Acha start hai — 25% target karein behtari ke liye.'
      : '⚠️ Savings rate bahut kam hai. Salary aate hi pehle savings transfer karein.';
    return sfT(lang,
      '💎 Savings Report:\n\n' +
        '• Saved this month: ' + sfFormatRs(sv) + ' of target ' + sfFormatRs(svp) + ' (' + svpc + '%)\n' +
        '• Saving rate: ' + svRate + '% of income\n' +
        '• At this pace, annual savings: ' + sfFormatRs(svAnnual) + '\n\n' +
        svAdvEn + '\n\n' +
        '💡 50/25/25 Rule: 50% needs → 25% savings → 25% wants',
      '💎 Savings Report:\n\n' +
        '• Is mahine bachat: ' + sfFormatRs(sv) + ' / target ' + sfFormatRs(svp) + ' (' + svpc + '%)\n' +
        '• Savings rate: income ka ' + svRate + '%\n' +
        '• Is pace pe salana bachat: ' + sfFormatRs(svAnnual) + '\n\n' +
        svAdvUr + '\n\n' +
        '💡 50/25/25 Rule: 50% zarooriyat → 25% bachat → 25% khwahishaat'
    );
  }

  // ── GOAL ──
  if (intent === 'goal' || intent === 'goal_eta') {
    if (!ctx.goalName) {
      return sfT(lang,
        '🎯 No savings goal set yet.\n\nGo to the Goals section and set a target — even Rs.\u00a010,000 builds the savings habit!',
        '🎯 Abhi koi savings goal set nahi hai.\n\nGoals section mein target set karein — Rs.\u00a010,000 bhi achi shuruwat hai!'
      );
    }
    var gpct = ctx.goalTarget > 0
      ? sfClamp(Math.round((ctx.goalSaved / ctx.goalTarget) * 100), 0, 100) : 0;
    var gleft = Math.max(0, ctx.goalTarget - ctx.goalSaved);
    var gCurrSv = Number((ctx.expenses && ctx.expenses.Savings) || 0);
    var gMonths = gCurrSv > 0 ? Math.ceil(gleft / gCurrSv) : '?';
    var gBar = '';
    var gFilled = Math.round(gpct / 10);
    for (var bi = 0; bi < 10; bi++) gBar += (bi < gFilled ? '█' : '░');
    var gEtaDate = '';
    if (typeof gMonths === 'number') {
      var gEtaD = new Date();
      gEtaD.setMonth(gEtaD.getMonth() + gMonths);
      gEtaDate = '\n• ' + sfT(lang, 'Target date: ~', 'Target date: ~') +
        gEtaD.toLocaleString('en-PK', { month: 'long', year: 'numeric' });
    }
    return sfT(lang,
      '🎯 Savings Goal: "' + ctx.goalName + '"\n\n' +
        '• Target: ' + sfFormatRs(ctx.goalTarget) + '\n' +
        '• Saved so far: ' + sfFormatRs(ctx.goalSaved) + '\n' +
        '• Progress: [' + gBar + '] ' + gpct + '%\n' +
        '• Still needed: ' + sfFormatRs(gleft) + '\n' +
        '• Est. months to go: ' + gMonths + gEtaDate + '\n\n' +
        (gpct >= 100
          ? '🎉 Goal achieved! Time to set a new one.'
          : '💪 Stay consistent — every rupee counts!'),
      '🎯 Savings Goal: "' + ctx.goalName + '"\n\n' +
        '• Target: ' + sfFormatRs(ctx.goalTarget) + '\n' +
        '• Abhi tak jama: ' + sfFormatRs(ctx.goalSaved) + '\n' +
        '• Progress: [' + gBar + '] ' + gpct + '%\n' +
        '• Abhi bhi chahiye: ' + sfFormatRs(gleft) + '\n' +
        '• Andazan: ' + gMonths + ' mahine aur' + gEtaDate + '\n\n' +
        (gpct >= 100
          ? '🎉 Goal complete ho gaya! Naya goal set karein.'
          : '💪 Consistency key hai — har rupee count karta hai!')
    );
  }

  // ── AFFORD ──
  if (intent === 'afford') {
    var afAmt = sfExtractNumber(raw);
    if (!afAmt) {
      return sfT(lang,
        '🤔 How much are you thinking of spending? Tell me the amount and I\'ll check if it fits your budget.',
        '🤔 Kitna spend karna chahte hain? Amount batayein — main check karta hoon.'
      );
    }
    var afCanAfford = afAmt <= ctx.remaining;
    var afPctRem = sfPct(afAmt, ctx.remaining);
    var afPctInc = ctx.income > 0 ? sfPct(afAmt, ctx.income) : 0;
    return sfT(lang,
      (afCanAfford ? '✅' : '⚠️') + ' Affordability Check: ' + sfFormatRs(afAmt) + '\n\n' +
        '• Remaining budget: ' + sfFormatRs(ctx.remaining) + '\n' +
        '• This purchase: ' + sfFormatRs(afAmt) + ' (' + afPctRem + '% of remaining)\n' +
        (afPctInc ? '• As % of income: ' + afPctInc + '%\n' : '') + '\n' +
        (afCanAfford
          ? '✅ You can afford it — but ask: is it essential, or can it wait?'
          : '⚠️ This exceeds your remaining budget by ' + sfFormatRs(Math.abs(ctx.remaining - afAmt)) + '. Review spending first.'),
      (afCanAfford ? '✅' : '⚠️') + ' Affordability Check: ' + sfFormatRs(afAmt) + '\n\n' +
        '• Remaining budget: ' + sfFormatRs(ctx.remaining) + '\n' +
        '• Yeh purchase: ' + sfFormatRs(afAmt) + ' (' + afPctRem + '% of remaining)\n\n' +
        (afCanAfford
          ? '✅ Afford ho sakta hai — lekin zaroorat hai?'
          : '⚠️ Remaining budget se ' + sfFormatRs(Math.abs(ctx.remaining - afAmt)) + ' zyada hai. Pehle doosra kharch review karein.')
    );
  }

  // ── EMERGENCY FUND ──
  if (intent === 'emergency') {
    var emMonthly = ctx.totalPlanned > 0 ? ctx.totalPlanned : ctx.totalSpent;
    var emMin = emMonthly * 3;
    var emIdeal = emMonthly * 6;
    var emSv = Number((ctx.expenses && ctx.expenses.Savings) || 0);
    var emMonths = emSv > 0 ? Math.ceil(emMin / emSv) : '?';
    return sfT(lang,
      '🛡️ Emergency Fund Guide:\n\n' +
        '• Your monthly expenses: ~' + sfFormatRs(emMonthly) + '\n' +
        '• Minimum buffer (3 months): ' + sfFormatRs(emMin) + '\n' +
        '• Ideal buffer (6 months): ' + sfFormatRs(emIdeal) + '\n\n' +
        '📅 At current savings pace: ~' + emMonths + ' months to reach minimum buffer\n\n' +
        '💡 Keep emergency funds in a liquid savings account — not stocks.\n' +
        '💡 Start small: Rs.\u00a05,000/month = ' + sfFormatRs(60000) + ' in one year.',
      '🛡️ Emergency Fund Guide:\n\n' +
        '• Aap ke monthly expenses: ~' + sfFormatRs(emMonthly) + '\n' +
        '• Minimum buffer (3 mahine): ' + sfFormatRs(emMin) + '\n' +
        '• Ideal buffer (6 mahine): ' + sfFormatRs(emIdeal) + '\n\n' +
        '📅 Current savings pace pe: ~' + emMonths + ' mahine minimum buffer ke liye\n\n' +
        '💡 Emergency fund liquid account mein rakhein — stocks mein nahi.\n' +
        '💡 Chhota shuru karein: Rs.\u00a05,000/mahina = ' + sfFormatRs(60000) + ' ek saal mein.'
    );
  }

  // ── INVESTMENT ──
  if (intent === 'investment') {
    var invSvRate = ctx.income > 0
      ? Math.round(((Number((ctx.expenses && ctx.expenses.Savings) || 0)) / ctx.income) * 100) : 0;
    var invReady = ctx.healthScore >= 70 && invSvRate >= 15;
    return sfT(lang,
      '📈 Investment Basics:\n\n' +
        (invReady
          ? '✅ Your finances look stable — you may be ready to start investing!\n\n'
          : '⚠️ Before investing: stabilise your budget and build 3–6 months emergency fund.\n\n') +
        '• Your current savings rate: ' + invSvRate + '% of income\n' +
        '• Rule of thumb: only invest what you won\'t need for 3+ years\n\n' +
        '💡 Options to explore (consult a financial advisor):\n' +
        '• National Savings Certificates / Prize Bonds (low risk)\n' +
        '• Mutual funds — Meezan, UBL, NBP (moderate risk)\n' +
        '• PSX stocks (higher risk, higher potential return)\n' +
        '• Real estate / plot investment (long-term)\n\n' +
        '⚠️ Always consult a certified financial planner.',
      '📈 Investment Basics:\n\n' +
        (invReady
          ? '✅ Finances stable hain — invest shuru kar sakte hain!\n\n'
          : '⚠️ Invest karne se pehle: budget stable karein aur 3–6 mahine ka emergency fund banayein.\n\n') +
        '• Aap ka savings rate: ' + invSvRate + '% of income\n' +
        '• Sirf woh invest karein jo 3+ saal mein zaroorat na ho\n\n' +
        '💡 Options:\n' +
        '• National Savings Certificates / Prize Bonds (low risk)\n' +
        '• Mutual Funds — Meezan, UBL, NBP (moderate risk)\n' +
        '• PSX stocks (high risk, high return)\n' +
        '• Real estate / zameen (long-term)\n\n' +
        '⚠️ Investment se pehle certified advisor se zaroor milein.'
    );
  }

  // ── BUDGETING RULES ──
  if (intent === 'budgeting_rules') {
    var brSv = Number((ctx.expenses && ctx.expenses.Savings) || 0);
    var brNeeds = ['Groceries','Bills','Healthcare'].reduce(function(a, c) { return a + Number((ctx.expenses && ctx.expenses[c]) || 0); }, 0);
    var brWants = Math.max(0, ctx.totalSpent - brNeeds - brSv);
    var brBase = ctx.income || ctx.totalSpent;
    var brNeedsPct = sfPct(brNeeds, brBase);
    var brSavePct  = sfPct(brSv, brBase);
    var brWantsPct = sfPct(brWants, brBase);
    return sfT(lang,
      '📐 Budgeting Rules Explained:\n\n' +
        '🔹 50/30/20 Rule:\n' +
        '• 50% Needs (groceries, bills, healthcare)\n' +
        '• 30% Wants (dining, entertainment)\n' +
        '• 20% Savings & debt repayment\n\n' +
        '🔹 50/25/25 Rule (recommended for savers):\n' +
        '• 50% Needs  •  25% Savings  •  25% Wants\n\n' +
        'Your actual breakdown:\n' +
        '• Needs: ' + sfFormatRs(brNeeds) + ' (' + brNeedsPct + '%)\n' +
        '• Savings: ' + sfFormatRs(brSv) + ' (' + brSavePct + '%)\n' +
        '• Wants/Other: ~' + sfFormatRs(brWants) + ' (' + brWantsPct + '%)\n\n' +
        (brSavePct >= 25 ? '🌟 Exceeding the recommended savings rate!' :
         brSavePct >= 10 ? '👍 On the right track — push savings to 25%.' :
         '⚠️ Savings below 10% — try adjusting your categories.'),
      '📐 Budgeting Rules:\n\n' +
        '🔹 50/30/20 Rule:\n' +
        '• 50% Zarooriyat  •  30% Khwahishaat  •  20% Bachat\n\n' +
        '🔹 50/25/25 Rule (savers ke liye):\n' +
        '• 50% Zarooriyat  •  25% Bachat  •  25% Khwahishaat\n\n' +
        'Aap ka breakdown:\n' +
        '• Zarooriyat: ' + sfFormatRs(brNeeds) + ' (' + brNeedsPct + '%)\n' +
        '• Bachat: ' + sfFormatRs(brSv) + ' (' + brSavePct + '%)\n' +
        '• Khwahishaat/Baaki: ~' + sfFormatRs(brWants) + ' (' + brWantsPct + '%)\n\n' +
        (brSavePct >= 25 ? '🌟 Recommended rate se zyada bana rahe hain!' :
         brSavePct >= 10 ? '👍 Sahi raste pe hain — 25% target karein.' :
         '⚠️ Bachat 10% se kam — categories adjust karein.')
    );
  }

  // ── REAL INFLATION ──
  if (intent === 'inflation') {
    var infl = Number(ctx.inflation || 0);
    var inflDoub = infl > 0 ? Math.round(70 / infl) : '∞';
    var inflReal = ctx.income > 0 ? Math.round(ctx.income / (1 + infl / 100)) : 0;
    var inflLoss = ctx.income - inflReal;
    return sfT(lang,
      '📉 Inflation Impact (current: ' + infl + '%):\n\n' +
        '• Monthly income: ' + sfFormatRs(ctx.income) + '\n' +
        '• Real purchasing power: ~' + sfFormatRs(inflReal) + '\n' +
        '• Monthly loss to inflation: ~' + sfFormatRs(inflLoss) + '\n' +
        '• At ' + infl + '%, prices double in ~' + inflDoub + ' years\n\n' +
        '💡 Beat inflation: invest in instruments returning above ' + infl + '%.\n' +
        '💡 Try: "What if inflation was 12%?" to model any scenario.',
      '📉 Mehngai Ka Asar (' + infl + '%):\n\n' +
        '• Monthly income: ' + sfFormatRs(ctx.income) + '\n' +
        '• Real purchasing power: ~' + sfFormatRs(inflReal) + '\n' +
        '• Mahana nuksaan: ~' + sfFormatRs(inflLoss) + '\n' +
        '• ' + infl + '% pe prices ~' + inflDoub + ' saal mein double\n\n' +
        '💡 Mehngai se bachne ke liye ' + infl + '% se zyada return wale instruments mein invest karein.\n' +
        '💡 Try: "Agar mehngai 12% ho?" koi bhi scenario model karein.'
    );
  }

  // ── PROJECTION ──
  if (intent === 'projection') {
    try {
      var pNow = new Date();
      var pDaysInMonth = new Date(pNow.getFullYear(), pNow.getMonth() + 1, 0).getDate();
      var pDay = pNow.getDate();
      var pDaily = pDay > 0 ? (ctx.totalSpent / pDay) : 0;
      var pProj = Math.round(pDaily * pDaysInMonth);
      var pDiff = pProj - ctx.totalPlanned;
      var pDaysLeft = pDaysInMonth - pDay;
      var pNeededDaily = pDaysLeft > 0 && pDiff > 0 ? Math.round(pDiff / pDaysLeft) : 0;
      return sfT(lang,
        '📅 Month-End Projection:\n\n' +
          '• Day ' + pDay + ' of ' + pDaysInMonth + ' (' + pDaysLeft + ' days left)\n' +
          '• Daily avg spend: ' + sfFormatRs(Math.round(pDaily)) + '\n' +
          '• Projected month total: ' + sfFormatRs(pProj) + '\n' +
          (pDiff > 0
            ? '• ⚠️ At this pace: ' + sfFormatRs(pDiff) + ' OVER budget.\n\n' +
              '💡 Reduce daily spend by ' + sfFormatRs(pNeededDaily) + ' to stay on track.'
            : '• ✅ At this pace: ' + sfFormatRs(Math.abs(pDiff)) + ' UNDER budget.\n\n' +
              '🎉 Great job! Consider adding the surplus to savings.'),
        '📅 Month-End Projection:\n\n' +
          '• Din ' + pDay + ' of ' + pDaysInMonth + ' (' + pDaysLeft + ' din bache)\n' +
          '• Roz ka avg kharch: ' + sfFormatRs(Math.round(pDaily)) + '\n' +
          '• Projected total: ' + sfFormatRs(pProj) + '\n' +
          (pDiff > 0
            ? '• ⚠️ Is pace pe: ' + sfFormatRs(pDiff) + ' OVER budget.\n\n' +
              '💡 Roz ' + sfFormatRs(pNeededDaily) + ' kam karein track pe rehne ke liye.'
            : '• ✅ Is pace pe: ' + sfFormatRs(Math.abs(pDiff)) + ' UNDER budget.\n\n' +
              '🎉 Zabardast! Bacha hua savings mein daal dein.')
      );
    } catch (e) {
      return sfT(lang, '📅 Could not calculate projection.', '📅 Projection calculate nahi ho saka.');
    }
  }

  // ── TIPS ──
  if (intent === 'tips') {
    var tTips = [];
    var tWorst = sfPickTopOver(ctx);
    if (ctx.remaining < 0) {
      tTips.push(sfT(lang,
        '🚨 URGENT: You\'re ' + sfFormatRs(Math.abs(ctx.remaining)) + ' over budget. Stop all non-essential spending NOW.',
        '🚨 URGENT: ' + sfFormatRs(Math.abs(ctx.remaining)) + ' over budget! Non-essential kharch fauran rokein.'
      ));
    }
    if (tWorst) {
      tTips.push(sfT(lang,
        '🔍 Focus this week: ' + tWorst + ' — try cutting by 10–15%.',
        '🔍 Is hafte focus: ' + tWorst + ' mein 10–15% cut karein.'
      ));
    }
    if (ctx.income > 0 && (Number((ctx.expenses && ctx.expenses.Savings) || 0) / ctx.income) < 0.25) {
      var tTarget = Math.round(ctx.income * 0.25);
      tTips.push(sfT(lang,
        '💰 "Pay yourself first": transfer ' + sfFormatRs(tTarget) + ' to savings the moment salary arrives.',
        '💰 "Pehle apne aap ko pay karein": salary aate hi ' + sfFormatRs(tTarget) + ' savings mein transfer karein.'
      ));
    }
    tTips.push(sfT(lang,
      '📋 Do a 10-minute weekly review: spending, balance, and top category.',
      '📋 Har hafta 10 minute ka review karein: kharch, balance, aur top category.'
    ));
    tTips.push(sfT(lang,
      '📱 Log every expense immediately — even small ones. Small leaks sink big ships.',
      '📱 Har kharch fauran log karein — chota bhi. Chhoti raqam bhi time ke saath bari hoti hai.'
    ));
    tTips.push(sfT(lang,
      '📊 Follow the 50/25/25 rule: 50% needs, 25% savings, 25% wants.',
      '📊 50/25/25 rule follow karein: 50% zarooriyat, 25% bachat, 25% khwahishaat.'
    ));
    tTips.push(sfT(lang,
      '🛡️ Build an emergency fund: 3–6 months of expenses in a liquid account.',
      '🛡️ Emergency fund banayein: 3–6 mahine ke kharchon ka liquid account mein.'
    ));
    tTips.push(sfT(lang,
      '🔔 Set bill payment reminders 3 days before due dates to avoid late fees.',
      '🔔 Bills ki due date se 3 din pehle reminder set karein — late fees se bachein.'
    ));
    return sfT(lang,
      '💡 Personalised Tips:\n\n' + tTips.map(function(t) { return '• ' + t; }).join('\n'),
      '💡 Personalised Tips:\n\n' + tTips.map(function(t) { return '• ' + t; }).join('\n')
    );
  }

  // ── DEBT OVERVIEW ──
  if (intent === 'debt_overview') {
    var lData = null;
    try { lData = JSON.parse(localStorage.getItem('sf_loans') || 'null'); } catch (e) {}
    if (!lData || !lData.length) {
      return sfT(lang,
        '🏦 Debt Overview:\n\nNo loans or debts tracked yet.\n\n' +
        '💡 To model a loan scenario, try:\n• "What if I took a loan of 5 lac?"\n• "What if I borrowed 2 lac for 24 months?"',
        '🏦 Debt Overview:\n\nKoi loan ya qarz track nahi hai.\n\n' +
        '💡 Loan scenario ke liye puchein:\n• "Agar 5 lac ka loan loon?"\n• "2 lac 24 mahine ke liye?"'
      );
    }
    var lTotal = lData.reduce(function(a, l) { return a + (parseFloat(l.remaining) || 0); }, 0);
    var lLines = lData.map(function(l) {
      return '• ' + (l.name || 'Loan') + ': ' + sfFormatRs(l.remaining || 0) +
        (l.monthly ? ' | ' + sfFormatRs(l.monthly) + '/month' : '');
    }).join('\n');
    var lD2I = ctx.income > 0 ? Math.round((lTotal / (ctx.income * 12)) * 100) : 0;
    return sfT(lang,
      '🏦 Debt Overview:\n\n' + lLines +
        '\n\n📊 Total Debt: ' + sfFormatRs(lTotal) +
        '\n• Debt-to-annual-income: ' + lD2I + '%\n\n' +
        (lD2I > 40 ? '⚠️ High debt load. Pay off high-interest loans first.' : '✅ Manageable debt. Stay on top of payments.'),
      '🏦 Debt Overview:\n\n' + lLines +
        '\n\n📊 Total Qarz: ' + sfFormatRs(lTotal) +
        '\n• Debt-to-income: ' + lD2I + '%\n\n' +
        (lD2I > 40 ? '⚠️ Zyada qarz hai. High-interest loans pehle pay karein.' : '✅ Manageable qarz. Monthly payments pe nazar rakhein.')
    );
  }

  // ── NET WORTH ──
  if (intent === 'net_worth') {
    var nwSv = Number((ctx.expenses && ctx.expenses.Savings) || 0);
    var nwAnnual = nwSv * 12;
    var nwGoal = ctx.goalSaved || 0;
    var nwAssets = nwGoal + nwSv;
    var nwLiabilities = 0;
    try {
      var nwLoans = JSON.parse(localStorage.getItem('sf_loans') || '[]');
      nwLiabilities = nwLoans.reduce(function(a, l) { return a + (parseFloat(l.remaining) || 0); }, 0);
    } catch (e) {}
    var nwNet = nwAssets - nwLiabilities;
    return sfT(lang,
      '💼 Net Worth Snapshot:\n\n' +
        '📈 Assets:\n' +
        '• This month\'s savings: ' + sfFormatRs(nwSv) + '\n' +
        '• Goal progress saved: ' + sfFormatRs(nwGoal) + '\n' +
        '• Annual savings pace: ' + sfFormatRs(nwAnnual) + '\n\n' +
        '📉 Liabilities:\n' +
        '• Outstanding debt: ' + sfFormatRs(nwLiabilities) + '\n\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '💰 Estimated Net Worth: ' + sfFormatRs(nwNet) + (nwNet >= 0 ? ' ✅' : ' ⚠️') + '\n\n' +
        '💡 Add properties, investments, vehicles for a complete picture.',
      '💼 Net Worth Snapshot:\n\n' +
        '📈 Assets:\n' +
        '• Is mahine ki bachat: ' + sfFormatRs(nwSv) + '\n' +
        '• Goal mein jama: ' + sfFormatRs(nwGoal) + '\n' +
        '• Salana pace: ' + sfFormatRs(nwAnnual) + '\n\n' +
        '📉 Liabilities:\n' +
        '• Qarz: ' + sfFormatRs(nwLiabilities) + '\n\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '💰 Net Worth: ' + sfFormatRs(nwNet) + (nwNet >= 0 ? ' ✅' : ' ⚠️') + '\n\n' +
        '💡 Property, investment, gaadi sab add karein poori picture ke liye.'
    );
  }

  // ── TAX TIPS ──
  if (intent === 'tax_tips') {
    var txAnnual = ctx.income * 12;
    var txBracket = txAnnual <= 600000 ? '0%'
      : txAnnual <= 1200000 ? '5%'
      : txAnnual <= 2400000 ? '15%'
      : txAnnual <= 3600000 ? '25%'
      : '35%+';
    return sfT(lang,
      '🧾 Tax Planning Tips:\n\n' +
        '• Your estimated annual income: ' + sfFormatRs(txAnnual) + '\n' +
        '• Approximate tax bracket: ' + txBracket + ' (Pakistan FBR)\n\n' +
        '💡 Tax-saving strategies:\n' +
        '• Register as a tax filer — get lower withholding rates\n' +
        '• Keep receipts for medical & education expenses (deductible)\n' +
        '• Contribute to approved pension schemes for deductions\n' +
        '• File your return by September 30 to avoid penalties\n' +
        '• Invest in NIT/Mutual Funds — returns may be taxed lower\n\n' +
        '⚠️ Consult a tax advisor for your exact liability.\n' +
        '🔗 FBR: fbr.gov.pk | IRIS: iris.fbr.gov.pk',
      '🧾 Tax Planning:\n\n' +
        '• Aap ki salana income: ' + sfFormatRs(txAnnual) + '\n' +
        '• Tax bracket (approximate): ' + txBracket + ' (Pakistan FBR)\n\n' +
        '💡 Tax bachane ke tareeqe:\n' +
        '• Tax filer ban jayein — withholding rates kam ho jayenge\n' +
        '• Medical aur education receipts sambhal ke rakhein (deductible)\n' +
        '• Approved pension scheme mein contribute karein\n' +
        '• 30 September tak return file karein — penalty se bachein\n' +
        '• NIT/Mutual Funds mein invest karein — tax less lagta hai\n\n' +
        '⚠️ Apne tax advisor ya FBR se confirm karein.\n' +
        '🔗 fbr.gov.pk'
    );
  }

  // ── SPENDING HABITS ──
  if (intent === 'spending_habits') {
    var shTxns = ctx.transactions || [];
    var shToday = new Date();
    var shWeekSpend = shTxns.filter(function(t) {
      try {
        var d = new Date(t.date || t.ts);
        return ((shToday - d) / (1000 * 60 * 60 * 24)) <= 7;
      } catch (e) { return false; }
    }).reduce(function(a, t) { return a + (parseFloat(t.amount) || 0); }, 0);
    var shAvgDaily = ctx.totalSpent > 0 ? Math.round(ctx.totalSpent / (shToday.getDate() || 1)) : 0;
    var shHealthy = ctx.totalPlanned > 0 ? Math.round(ctx.totalPlanned / 30) : 0;
    var shStatus = shAvgDaily <= shHealthy
      ? sfT(lang, '✅ Daily spending is within healthy limits.', '✅ Roz ka kharch healthy limit ke andar hai.')
      : sfT(lang, '⚠️ Daily spending exceeds your healthy target.', '⚠️ Roz ka kharch healthy target se zyada hai.');
    return sfT(lang,
      '📊 Spending Habits Analysis:\n\n' +
        '• Avg daily spend this month: ' + sfFormatRs(shAvgDaily) + '\n' +
        '• Healthy daily target: ' + sfFormatRs(shHealthy) + '\n' +
        '• This week\'s spending: ' + sfFormatRs(Math.round(shWeekSpend)) + '\n\n' +
        shStatus + '\n\n' +
        '💡 Habit tips:\n' +
        '• 24-hour rule: wait 24 hours before any non-essential purchase\n' +
        '• Log expenses at the same time every day (morning or night)\n' +
        '• Set a weekly budget cap and check it every Sunday',
      '📊 Spending Habits:\n\n' +
        '• Roz ka avg kharch: ' + sfFormatRs(shAvgDaily) + '\n' +
        '• Healthy daily target: ' + sfFormatRs(shHealthy) + '\n' +
        '• Is hafte ka kharch: ' + sfFormatRs(Math.round(shWeekSpend)) + '\n\n' +
        shStatus + '\n\n' +
        '💡 Aadat ke liye:\n' +
        '• 24-ghante ka rule: koi bhi non-essential purchase se pehle 24 ghante sochein\n' +
        '• Har roz ek hi waqt pe expenses log karein\n' +
        '• Har Sunday weekly spending zaroor check karein'
    );
  }

  // ── BILL REMINDERS ──
  if (intent === 'bill_reminder') {
    var brBillsSp = Number((ctx.expenses && ctx.expenses.Bills) || 0);
    var brBillsPl = Number((ctx.planned && ctx.planned.Bills) || 0);
    var brBillsRem = brBillsPl - brBillsSp;
    return sfT(lang,
      '🔔 Bill Payment Reminders:\n\n' +
        '• Bills budget: ' + sfFormatRs(brBillsPl) + '\n' +
        '• Paid so far: ' + sfFormatRs(brBillsSp) + '\n' +
        '• Remaining bills budget: ' + sfFormatRs(brBillsRem) + (brBillsRem < 0 ? ' ⚠️ OVER' : ' ✅') + '\n\n' +
        '📅 Common bill due dates:\n' +
        '• Electricity / Gas: usually 15th–20th of month\n' +
        '• Internet / Phone: usually 1st–10th\n' +
        '• Credit card: check your statement\n\n' +
        '💡 Set auto-pay for recurring bills to avoid late fees.\n' +
        '💡 Review subscriptions every 3 months — cancel unused ones.',
      '🔔 Bill Reminders:\n\n' +
        '• Bills budget: ' + sfFormatRs(brBillsPl) + '\n' +
        '• Paid: ' + sfFormatRs(brBillsSp) + '\n' +
        '• Remaining: ' + sfFormatRs(brBillsRem) + (brBillsRem < 0 ? ' ⚠️' : ' ✅') + '\n\n' +
        '📅 Common due dates:\n' +
        '• Bijli / Gas: 15–20 tarikh\n' +
        '• Internet / Phone: 1–10 tarikh\n' +
        '• Credit card: apna statement check karein\n\n' +
        '💡 Auto-pay set karein — late fees se bachein.\n' +
        '💡 Har 3 mahine mein subscriptions review karein.'
    );
  }

  // ── CURRENCY CONVERSION ──
  if (intent === 'currency') {
    var ccAmt = sfExtractNumber(raw) || 1;
    var ccRates = { USD: 278, EUR: 302, GBP: 352, AED: 76, SAR: 74 };
    var ccLower = raw.toLowerCase();
    var ccTo = 'USD';
    if (/\b(euro?s?|eur)\b/i.test(ccLower)) ccTo = 'EUR';
    else if (/\b(pounds?|gbp|sterling)\b/i.test(ccLower)) ccTo = 'GBP';
    else if (/\b(dirham|aed)\b/i.test(ccLower)) ccTo = 'AED';
    else if (/\b(riyal|sar)\b/i.test(ccLower)) ccTo = 'SAR';
    var ccRate = ccRates[ccTo] || 278;
    var ccIsPkrTo = /\b(to\s+(?:usd|dollar|euro|pound|eur|gbp)|pkr\s+to)\b/i.test(ccLower) ||
                   !/\b(to\s+pkr|to\s+rupees?|in\s+pkr|in\s+rupees?|rupay\s+mein)\b/i.test(ccLower);
    var ccResult = ccIsPkrTo
      ? (ccAmt / ccRate).toFixed(2) + ' ' + ccTo
      : sfFormatRs(Math.round(ccAmt * ccRate));
    return sfT(lang,
      '💱 Currency Conversion (approximate):\n\n' +
        (ccIsPkrTo ? sfFormatRs(ccAmt) + ' = ' + ccResult : ccAmt + ' ' + ccTo + ' = ' + ccResult) +
        '\n\n• Rate used: 1 ' + ccTo + ' ≈ Rs. ' + ccRate +
        '\n\n⚠️ Rates are approximate. Check SBP or your bank for live rates.\n🔗 sbp.org.pk',
      '💱 Currency Conversion:\n\n' +
        (ccIsPkrTo ? sfFormatRs(ccAmt) + ' = ' + ccResult : ccAmt + ' ' + ccTo + ' = ' + ccResult) +
        '\n\n• Rate: 1 ' + ccTo + ' ≈ Rs. ' + ccRate +
        '\n\n⚠️ Approximate rate hai. SBP ya bank se confirm karein.\n🔗 sbp.org.pk'
    );
  }

  // ── HYPOTHETICAL: CAR (NEW) ──
  if (intent === 'car_hypothetical') {
    var carAmt = sfExtractNumber(raw) || 0;
    if (!carAmt) {
      return sfT(lang,
        '🚗 What\'s the car price? e.g. "What if I buy a car for 15 lac?"',
        '🚗 Car ki qeemat kitni hai? e.g. "Agar 15 lac ki car khareedun?"'
      );
    }
    var carDown = Math.round(carAmt * 0.2);
    var carLoan = carAmt - carDown;
    var carRate = 0.18;
    var carTenor = 36;
    var carMonthly = Math.round((carLoan * (carRate / 12)) / (1 - Math.pow(1 + carRate / 12, -carTenor)));
    var carTotal = carMonthly * carTenor + carDown;
    var carInsurance = Math.round(carAmt * 0.03 / 12);
    var carTotalMonthly = carMonthly + carInsurance;
    var carCanAfford = carTotalMonthly <= ctx.remaining;
    var carPctInc = ctx.income > 0 ? Math.round((carTotalMonthly / ctx.income) * 100) : 0;
    return sfT(lang,
      '🚗 Car Purchase Scenario: ' + sfFormatRs(carAmt) + '\n\n' +
        '📋 Breakdown:\n' +
        '• Down payment (20%): ' + sfFormatRs(carDown) + '\n' +
        '• Loan amount (80%): ' + sfFormatRs(carLoan) + '\n' +
        '• Monthly installment (18% rate, 36 months): ~' + sfFormatRs(carMonthly) + '\n' +
        '• Est. monthly insurance (3%/yr): ~' + sfFormatRs(carInsurance) + '\n' +
        '• Total monthly cost: ~' + sfFormatRs(carTotalMonthly) + ' (' + carPctInc + '% of income)\n' +
        '• Total cost over 3 years: ~' + sfFormatRs(carTotal) + '\n\n' +
        (carCanAfford
          ? '✅ Remaining budget can cover the monthly cost.'
          : '⚠️ Monthly cost exceeds remaining budget by ' + sfFormatRs(Math.abs(ctx.remaining - carTotalMonthly)) + '.') +
        (carPctInc > 30 ? '\n⚠️ Monthly car cost >30% of income — financial strain risk.' : '') +
        '\n\n💡 Tip: A car should cost ≤ 20–25% of monthly income in total running costs.',
      '🚗 Car Purchase Scenario: ' + sfFormatRs(carAmt) + '\n\n' +
        '📋 Breakdown:\n' +
        '• Down payment (20%): ' + sfFormatRs(carDown) + '\n' +
        '• Loan (80%): ' + sfFormatRs(carLoan) + '\n' +
        '• Monthly installment (18% rate, 36 mahine): ~' + sfFormatRs(carMonthly) + '\n' +
        '• Insurance (est. 3%/saal): ~' + sfFormatRs(carInsurance) + '/mahina\n' +
        '• Total monthly cost: ~' + sfFormatRs(carTotalMonthly) + ' (income ka ' + carPctInc + '%)\n' +
        '• 3 saal mein total cost: ~' + sfFormatRs(carTotal) + '\n\n' +
        (carCanAfford
          ? '✅ Remaining budget monthly cost cover kar sakta hai.'
          : '⚠️ Monthly cost remaining budget se ' + sfFormatRs(Math.abs(ctx.remaining - carTotalMonthly)) + ' zyada hai.') +
        (carPctInc > 30 ? '\n⚠️ Car cost income ka 30% se zyada — financial strain ka khatra.' : '') +
        '\n\n💡 Tip: Car ka total monthly cost income ka 20–25% se zyada nahi hona chahiye.'
    );
  }

  // ── HYPOTHETICAL: RENT ──
  if (intent === 'rent_hypothetical') {
    var rentAmt = sfExtractNumber(raw) || 0;
    if (!rentAmt) {
      return sfT(lang,
        '🏠 How much rent are you considering? e.g. "What if I pay rent of 30k?"',
        '🏠 Kiraya kitna ho ga? e.g. "Agar 30k kiraya ho?"'
      );
    }
    var rentPct = ctx.income > 0 ? Math.round((rentAmt / ctx.income) * 100) : 0;
    var rentNewRem = ctx.remaining - rentAmt;
    return sfT(lang,
      '🏠 Rent Scenario: ' + sfFormatRs(rentAmt) + '/month\n\n' +
        '• As % of income: ' + rentPct + '%\n' +
        '• Remaining after rent: ' + sfFormatRs(rentNewRem) + (rentNewRem < 0 ? ' ⚠️' : ' ✅') + '\n\n' +
        (rentPct > 30
          ? '⚠️ Rent >30% of income — financial strain risk. Try to keep it under 30%.'
          : rentPct > 20
          ? '⚠️ Rent is 20–30% of income — manageable but watch other expenses.'
          : '✅ Rent under 20% of income — financially healthy.') +
        '\n\n💡 Rule of thumb: rent ≤ 30% of monthly income.',
      '🏠 Rent Scenario: ' + sfFormatRs(rentAmt) + '/mahina\n\n' +
        '• Income ka: ' + rentPct + '%\n' +
        '• Kiraya ke baad remaining: ' + sfFormatRs(rentNewRem) + (rentNewRem < 0 ? ' ⚠️' : ' ✅') + '\n\n' +
        (rentPct > 30
          ? '⚠️ Kiraya income ka 30% se zyada — mushkil ho sakti hai. 30% se kam rakhein.'
          : '✅ Manageable kiraya.') +
        '\n\n💡 Kiraya income ka max 30% hona chahiye.'
    );
  }

  // ── HYPOTHETICAL: VACATION ──
  if (intent === 'vacation_hypothetical') {
    var vacAmt = sfExtractNumber(raw) || 0;
    if (!vacAmt) {
      return sfT(lang,
        '✈️ What\'s your vacation budget? e.g. "What if vacation costs 50k?"',
        '✈️ Trip ka budget kitna hai? e.g. "Agar 50k ki trip?"'
      );
    }
    var vacCanAfford = vacAmt <= ctx.remaining;
    var vacSv = Number((ctx.expenses && ctx.expenses.Savings) || 0);
    var vacMonths = vacSv > 0 ? Math.ceil(vacAmt / vacSv) : '?';
    return sfT(lang,
      '✈️ Vacation Scenario: ' + sfFormatRs(vacAmt) + '\n\n' +
        '• Remaining budget: ' + sfFormatRs(ctx.remaining) + '\n' +
        '• Can you afford it now? ' + (vacCanAfford ? '✅ Yes.' : '⚠️ Not from this month\'s budget.') + '\n' +
        '• Months of savings needed: ~' + vacMonths + '\n\n' +
        '💡 Create a dedicated "vacation" savings goal and set aside a fixed amount monthly.',
      '✈️ Vacation Scenario: ' + sfFormatRs(vacAmt) + '\n\n' +
        '• Remaining budget: ' + sfFormatRs(ctx.remaining) + '\n' +
        '• Abhi afford? ' + (vacCanAfford ? '✅ Han!' : '⚠️ Is mahine nahi.') + '\n' +
        '• Bachat ke mahine chahiye: ~' + vacMonths + '\n\n' +
        '💡 Vacation ke liye alag savings goal banayein — har mahine fix amount rakhein.'
    );
  }

  // ── HYPOTHETICAL: SAVINGS ──
  if (intent === 'savings_hypothetical') {
    var hsAmt = sfExtractNumber(raw);
    if (hsAmt && hsAmt > 0) advisorState.lastEntities.lastSaveAmount = hsAmt;
    else hsAmt = advisorState.lastEntities.lastSaveAmount || null;
    if (!hsAmt || hsAmt <= 0) {
      return sfT(lang,
        '🤔 How much per month? e.g. "What if I saved 20k?"',
        '🤔 Har mahine kitna? e.g. "Agar 20k save karun?"'
      );
    }
    var hsRate = ctx.income > 0 ? Math.round((hsAmt / ctx.income) * 100) : 0;
    var hsCurr = Number((ctx.expenses && ctx.expenses.Savings) || 0);
    var hsDiff = hsAmt - hsCurr;
    var hsGoalLeft = ctx.goalTarget > 0 ? Math.max(0, ctx.goalTarget - ctx.goalSaved) : null;
    var hsMonths = (hsGoalLeft !== null && hsAmt > 0) ? Math.ceil(hsGoalLeft / hsAmt) : null;
    var hsAdvEn = hsRate >= 25 ? '🌟 Above recommended 25% savings rate — excellent!'
      : hsRate >= 10 ? '👍 Good. Push toward 25% for stronger security.'
      : '⚠️ Below 25% — consider increasing over time.';
    var hsAdvUr = hsRate >= 25 ? '🌟 Zabardast! 25% se zyada bachat — shukriya!'
      : hsRate >= 10 ? '👍 Acha hai. 25% target karein.'
      : '⚠️ 25% se kam — waqt ke saath badhate rahein.';
    return sfT(lang,
      '💡 Savings Scenario: ' + sfFormatRs(hsAmt) + '/month\n\n' +
        '• ' + hsRate + '% of income\n' +
        '• ' + hsAdvEn + '\n' +
        '• ' + (hsDiff > 0 ? sfFormatRs(hsDiff) + ' MORE than current (' + sfFormatRs(hsCurr) + ')' : hsDiff < 0 ? sfFormatRs(Math.abs(hsDiff)) + ' LESS than current' : 'Same as current.') + '\n' +
        (hsMonths && ctx.goalName ? '🎯 Goal "' + ctx.goalName + '" reached in ~' + hsMonths + ' month(s)\n' : '') +
        '📅 In 12 months: ' + sfFormatRs(hsAmt * 12) + ' saved.\n\n' +
        '💡 Transfer savings on salary day before any spending.',
      '💡 Savings Scenario: ' + sfFormatRs(hsAmt) + '/mahina\n\n' +
        '• Income ka ' + hsRate + '%\n' +
        '• ' + hsAdvUr + '\n' +
        '• ' + (hsDiff > 0 ? 'Current se ' + sfFormatRs(hsDiff) + ' ZYADA' : hsDiff < 0 ? 'Current se ' + sfFormatRs(Math.abs(hsDiff)) + ' KAM' : 'Current ke barabar.') + '\n' +
        (hsMonths && ctx.goalName ? '🎯 Goal "' + ctx.goalName + '" ~' + hsMonths + ' mahine mein\n' : '') +
        '📅 12 mahine mein: ' + sfFormatRs(hsAmt * 12) + ' jama.\n\n' +
        '💡 Salary aate hi pehle savings transfer karein.'
    );
  }

  // ── HYPOTHETICAL: RELATIVE SAVINGS ──
  if (intent === 'savings_hypothetical_relative') {
    var hsrCurr = Number((ctx.expenses && ctx.expenses.Savings) || 0);
    var hsrMul = 2;
    if (/triple/i.test(raw)) hsrMul = 3;
    if (/halve|half/i.test(raw)) hsrMul = 0.5;
    var hsrNew = Math.round(hsrCurr * hsrMul);
    var hsrRate = ctx.income > 0 ? Math.round((hsrNew / ctx.income) * 100) : 0;
    var hsrGoalLeft = ctx.goalTarget > 0 ? Math.max(0, ctx.goalTarget - ctx.goalSaved) : null;
    var hsrMonths = (hsrGoalLeft !== null && hsrNew > 0) ? Math.ceil(hsrGoalLeft / hsrNew) : null;
    var hsrLabel = hsrMul === 3 ? 'triple' : hsrMul === 0.5 ? 'halve' : 'double';
    return sfT(lang,
      '💡 If you ' + hsrLabel + ' savings to ' + sfFormatRs(hsrNew) + '/month:\n\n' +
        '• ' + hsrRate + '% of income\n' +
        (hsrMonths && ctx.goalName ? '• Goal "' + ctx.goalName + '" in ~' + hsrMonths + ' month(s)\n' : '') +
        '• In 12 months: ' + sfFormatRs(hsrNew * 12) + ' saved\n\n' +
        (hsrRate >= 25 ? '🌟 Top tier of savers!' : '👍 A meaningful improvement!'),
      '💡 Savings ' + hsrLabel + ' karke ' + sfFormatRs(hsrNew) + '/mahina:\n\n' +
        '• Income ka ' + hsrRate + '%\n' +
        (hsrMonths && ctx.goalName ? '• Goal "' + ctx.goalName + '" ~' + hsrMonths + ' mahine mein\n' : '') +
        '• 12 mahine mein: ' + sfFormatRs(hsrNew * 12) + '\n\n' +
        (hsrRate >= 25 ? '🌟 Zabardast saver!' : '👍 Bohat acha improvement!')
    );
  }

  // ── HYPOTHETICAL: INCOME ──
  if (intent === 'income_hypothetical') {
    var ihNum = sfExtractNumber(raw);
    var ihNew = ihNum;
    if (!ihNew) {
      if (/double/i.test(raw)) ihNew = ctx.income * 2;
      else if (/triple/i.test(raw)) ihNew = ctx.income * 3;
      else if (/half|halve/i.test(raw)) ihNew = ctx.income * 0.5;
      else {
        var ihRaiseMatch = raw.match(/(\d+)\s*(?:%|percent)\s*(?:raise|increase|hike|badh)/i);
        if (ihRaiseMatch) ihNew = ctx.income * (1 + parseFloat(ihRaiseMatch[1]) / 100);
        var ihCutMatch = raw.match(/(\d+)\s*(?:%|percent)\s*(?:cut|decrease|drop|reduce|kam)/i);
        if (ihCutMatch) ihNew = ctx.income * (1 - parseFloat(ihCutMatch[1]) / 100);
      }
    }
    if (!ihNew || ihNew <= 0) {
      return sfT(lang,
        '🤔 What would your new income be? e.g. "What if income was 80k?" or "salary doubled?"',
        '🤔 Nai income kitni hogi? e.g. "Agar income 80k ho?" ya "salary double ho?"'
      );
    }
    ihNew = Math.round(ihNew);
    var ihDiff = ihNew - ctx.income;
    var ihSave25 = Math.round(ihNew * 0.25);
    var ihLeft = ihNew - ihSave25;
    return sfT(lang,
      '💡 Income Scenario: ' + sfFormatRs(ihNew) + '/month\n\n' +
        '• Change from current: ' + (ihDiff >= 0 ? '+' : '') + sfFormatRs(ihDiff) + '\n' +
        '• Recommended savings (25%): ' + sfFormatRs(ihSave25) + '/month\n' +
        '• Available for expenses: ' + sfFormatRs(ihLeft) + '\n' +
        '• Annual income: ' + sfFormatRs(ihNew * 12) + '\n\n' +
        (ihDiff > 0
          ? '📈 Higher income — prioritise savings before lifestyle upgrades!'
          : '📉 Lower income — review all non-essential spending immediately.'),
      '💡 Income Scenario: ' + sfFormatRs(ihNew) + '/mahina\n\n' +
        '• Current se farq: ' + (ihDiff >= 0 ? '+' : '') + sfFormatRs(ihDiff) + '\n' +
        '• Recommended savings (25%): ' + sfFormatRs(ihSave25) + '\n' +
        '• Expenses ke liye: ' + sfFormatRs(ihLeft) + '\n' +
        '• Salana income: ' + sfFormatRs(ihNew * 12) + '\n\n' +
        (ihDiff > 0
          ? '📈 Zyada income — pehle savings badhayein, lifestyle baad mein!'
          : '📉 Kam income — non-essential kharch zaroor review karein.')
    );
  }

  // ── HYPOTHETICAL: EXPENSE CUT ──
  if (intent === 'expense_cut_hypothetical') {
    var ecCat = sfExtractCategory(m) || 'Groceries';
    var ecNum = sfExtractNumber(raw);
    var ecCurr = Number((ctx.expenses && ctx.expenses[ecCat]) || 0);
    var ecNew = ecNum
      ? (/\d+\s*%/.test(raw) ? Math.round(ecCurr * (1 - ecNum / 100)) : Math.max(0, ecCurr - ecNum))
      : Math.round(ecCurr * 0.8);
    var ecSave = ecCurr - ecNew;
    var ecAnnual = ecSave * 12;
    return sfT(lang,
      '✂️ Expense Cut Scenario — ' + ecCat + ':\n\n' +
        '• Current spend: ' + sfFormatRs(ecCurr) + '\n' +
        '• After cut: ' + sfFormatRs(ecNew) + '\n' +
        '• Monthly saving: ' + sfFormatRs(ecSave) + '\n' +
        '• Annual saving: ' + sfFormatRs(ecAnnual) + '\n\n' +
        '💡 ' + sfFormatRs(ecSave) + '/month = ' + sfFormatRs(ecAnnual) + ' in 12 months. Small cuts compound!',
      '✂️ Expense Cut — ' + ecCat + ':\n\n' +
        '• Current kharch: ' + sfFormatRs(ecCurr) + '\n' +
        '• Cut ke baad: ' + sfFormatRs(ecNew) + '\n' +
        '• Mahana bachat: ' + sfFormatRs(ecSave) + '\n' +
        '• Salana bachat: ' + sfFormatRs(ecAnnual) + '\n\n' +
        '💡 ' + sfFormatRs(ecSave) + '/mahina = 1 saal mein ' + sfFormatRs(ecAnnual) + '. Chhoti bachat bhi bari hoti hai!'
    );
  }

  // ── HYPOTHETICAL: LOAN ──
  if (intent === 'loan_hypothetical') {
    var lhAmt = sfExtractNumber(raw);
    if (!lhAmt || lhAmt <= 0) {
      return sfT(lang,
        '🏦 What loan amount? e.g. "What if I took a loan of 5 lac?"',
        '🏦 Kitna loan? e.g. "Agar 5 lac ka loan loon?"'
      );
    }
    advisorState.lastEntities.lastLoan = lhAmt;
    var lhTenorMatch = raw.match(/(\d+)\s*(?:month|mahine)/i);
    var lhTenor = lhTenorMatch ? parseInt(lhTenorMatch[1]) : 12;
    var lhRate = 0.15;
    var lhMonthly = Math.round((lhAmt * (lhRate / 12)) / (1 - Math.pow(1 + lhRate / 12, -lhTenor)));
    var lhTotal = lhMonthly * lhTenor;
    var lhInterest = lhTotal - lhAmt;
    var lhCanAfford = lhMonthly <= ctx.remaining;
    var lhD2I = ctx.income > 0 ? Math.round((lhMonthly / ctx.income) * 100) : 0;
    return sfT(lang,
      '🏦 Loan Scenario: ' + sfFormatRs(lhAmt) + '\n\n' +
        '• Assumed rate: 15% per annum\n' +
        '• Repayment: ' + lhTenor + ' months\n' +
        '• Monthly installment: ~' + sfFormatRs(lhMonthly) + ' (' + lhD2I + '% of income)\n' +
        '• Total repayment: ~' + sfFormatRs(lhTotal) + '\n' +
        '• Total interest cost: ~' + sfFormatRs(lhInterest) + '\n\n' +
        (lhCanAfford
          ? '✅ Remaining budget (' + sfFormatRs(ctx.remaining) + ') can cover the installment.'
          : '⚠️ Remaining budget (' + sfFormatRs(ctx.remaining) + ') may NOT cover this.') +
        (lhD2I > 40 ? '\n⚠️ EMI is >40% of income — high debt burden risk.' : '') +
        '\n\n💡 Compare rates across banks before committing.',
      '🏦 Loan Scenario: ' + sfFormatRs(lhAmt) + '\n\n' +
        '• Rate: 15% per annum\n' +
        '• Repayment: ' + lhTenor + ' mahine\n' +
        '• Monthly installment: ~' + sfFormatRs(lhMonthly) + ' (income ka ' + lhD2I + '%)\n' +
        '• Total repayment: ~' + sfFormatRs(lhTotal) + '\n' +
        '• Interest: ~' + sfFormatRs(lhInterest) + '\n\n' +
        (lhCanAfford
          ? '✅ Remaining budget installment cover kar sakta hai.'
          : '⚠️ Remaining budget kaafi nahi hoga.') +
        (lhD2I > 40 ? '\n⚠️ EMI income ka 40% se zyada — zyada burden.' : '') +
        '\n\n💡 Banks se rates compare zaroor karein.'
    );
  }

  // ── HYPOTHETICAL: INFLATION ──
  if (intent === 'inflation_hypothetical') {
    var ihRate = null;
    var ihPctMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
    if (ihPctMatch) ihRate = parseFloat(ihPctMatch[1]);
    else {
      var ihClean = raw.replace(/(?:for\s+(?:the\s+)?next\s+|over\s+|in\s+)\d+\s*(?:year|saal)/gi, '');
      ihRate = sfExtractNumber(ihClean);
    }
    if (ihRate !== null && ihRate >= 0) advisorState.lastEntities.lastInflationRate = ihRate;
    else ihRate = advisorState.lastEntities.lastInflationRate || null;
    if (ihRate === null || ihRate < 0 || ihRate > 100) {
      return sfT(lang,
        '🤔 What inflation rate? e.g. "What if inflation was 8%?"',
        '🤔 Kaunsi inflation rate? e.g. "Agar mehngai 8% ho?"'
      );
    }
    var ihWordNums = { one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,ek:1,do:2,teen:3,chaar:4,panch:5 };
    var ihYears = null;
    var ihYDigit = raw.match(/(?:for\s+(?:the\s+)?next\s+|over\s+|in\s+|next\s+)(\d+)\s*(?:year|saal)/i) || raw.match(/(\d+)\s*(?:-\s*)?year/i);
    if (ihYDigit) ihYears = parseInt(ihYDigit[1]);
    else {
      var ihYWord = raw.match(/(?:for\s+(?:the\s+)?next\s+|over\s+|in\s+|next\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|ek|do|teen|chaar|panch)\s*(?:year|saal)/i);
      if (ihYWord) ihYears = ihWordNums[ihYWord[1].toLowerCase()] || null;
    }
    var ihReal = ctx.income > 0 ? Math.round(ctx.income / (1 + ihRate / 100)) : 0;
    var ihLoss = ctx.income - ihReal;
    var ihDoub = ihRate > 0 ? Math.round(70 / ihRate) : '∞';
    var ihActual = Number(ctx.inflation || 0);
    var ihDiff = ihRate - ihActual;
    var ihDiffText = ihDiff > 0
      ? sfT(lang,
          '⚠️ ' + ihDiff.toFixed(1) + '% higher than current (' + ihActual + '%). Purchasing power drops further.',
          '⚠️ Current rate (' + ihActual + '%) se ' + ihDiff.toFixed(1) + '% zyada. Purchasing power aur girega.')
      : ihDiff < 0
      ? sfT(lang,
          '✅ ' + Math.abs(ihDiff).toFixed(1) + '% lower than current. You\'d be better off.',
          '✅ Current rate se ' + Math.abs(ihDiff).toFixed(1) + '% kam — behtar hoga.')
      : sfT(lang, '➡️ Same as your current inflation rate.', '➡️ Current rate ke barabar.');
    var ihYrEn = '', ihYrUr = '';
    if (ihYears && ihYears > 0 && ctx.income > 0) {
      var ihFuture = Math.round(ctx.income / Math.pow(1 + ihRate / 100, ihYears));
      var ihTotalLoss = (ctx.income - ihFuture) * 12 * ihYears;
      ihYrEn = '\n• In ' + ihYears + ' years, real power: ~' + sfFormatRs(ihFuture) + '/month\n• Cumulative loss: ~' + sfFormatRs(ihTotalLoss);
      ihYrUr = '\n• ' + ihYears + ' saal baad: ~' + sfFormatRs(ihFuture) + '/mahina\n• Total nuksaan: ~' + sfFormatRs(ihTotalLoss);
    }
    return sfT(lang,
      '📉 Inflation Scenario at ' + ihRate + '%' + (ihYears ? ' (' + ihYears + ' years)' : '') + ':\n\n' +
        '• Income: ' + sfFormatRs(ctx.income) + '\n' +
        '• Real purchasing power: ~' + sfFormatRs(ihReal) + '\n' +
        '• Monthly loss: ~' + sfFormatRs(ihLoss) + '\n' +
        '• Prices double in ~' + ihDoub + ' years' + ihYrEn + '\n\n' +
        ihDiffText + '\n\n' +
        '💡 To beat ' + ihRate + '%: invest in instruments returning above ' + ihRate + '%.',
      '📉 Mehngai Scenario (' + ihRate + '%)' + (ihYears ? ' — ' + ihYears + ' saal' : '') + ':\n\n' +
        '• Income: ' + sfFormatRs(ctx.income) + '\n' +
        '• Real purchasing power: ~' + sfFormatRs(ihReal) + '\n' +
        '• Mahana nuksaan: ~' + sfFormatRs(ihLoss) + '\n' +
        '• Prices ~' + ihDoub + ' saal mein double' + ihYrUr + '\n\n' +
        ihDiffText + '\n\n' +
        '💡 ' + ihRate + '% se zyada return wale instruments mein invest karein.'
    );
  }

  // ── FALLBACK (rotates through 3 varied responses) ──
  advisorState.fallbackCount = (advisorState.fallbackCount || 0) + 1;
  return sfFallbackResponses[(advisorState.fallbackCount - 1) % sfFallbackResponses.length](ctx, lang);
}

// ── TYPING DELAY ──────────────────────────────────────────────
function sfTypingDelay(responseText) {
  var len = String(responseText || '').length;
  return Math.min(1800, Math.max(400, Math.round(len * 1.1)));
}

// ── SEND MESSAGE ──────────────────────────────────────────────
async function sendChatMessage() {
  try {
    var input = document.getElementById('chatInput');
    if (!input) return;
    var message = (input.value || '').trim();
    if (!message) return;
    input.value = '';
    removeQuickReplies();
    addChatBubble(message, 'user');
    removeTyping();
    showTyping();
    var ctx = getContext();
    conversationHistory.push({ role: 'user', content: message, ts: Date.now() });
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
    var reply = sfSafeReply(ctx, message);
    var delay = sfTypingDelay(reply);
    var lang = sfLang(message);
    setTimeout(function() {
      removeTyping();
      conversationHistory.push({ role: 'assistant', content: reply, ts: Date.now() });
      addChatBubble(reply, 'bot');
      renderQuickReplies(sfGetQuickReplies(advisorState.lastIntent, lang, advisorState.turnCount));
    }, delay);
  } catch (e) {
    removeTyping();
    addChatBubble('😅 Something went wrong. Please try again.', 'bot');
  }
}

// ── KEY HANDLER ───────────────────────────────────────────────
function handleChatKey(event) {
  if (event && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

// ── FINANCIAL CONTEXT ─────────────────────────────────────────
function getContext() {
  try {
    var planned      = JSON.parse(localStorage.getItem('sf_planned')      || '{}');
    var expenses     = JSON.parse(localStorage.getItem('sf_expenses')     || '{}');
    var transactions = JSON.parse(localStorage.getItem('sf_transactions') || '[]');
    var goal         = JSON.parse(localStorage.getItem('sf_goal')         || 'null');
    if (typeof planned  !== 'object' || Array.isArray(planned))   planned  = {};
    if (typeof expenses !== 'object' || Array.isArray(expenses))  expenses = {};
    if (!Array.isArray(transactions))                              transactions = [];
    var totalPlanned = Object.keys(planned).reduce(function(a, k)  { return a + (parseFloat(planned[k])  || 0); }, 0);
    var totalSpent   = Object.keys(expenses).reduce(function(a, k) { return a + (parseFloat(expenses[k]) || 0); }, 0);
    var remaining    = totalPlanned - totalSpent;
    var spendCats    = ['Groceries','Bills','Healthcare','Education'];
    var spendP = spendCats.reduce(function(a, c) { return a + (parseFloat(planned[c])  || 0); }, 0);
    var spendA = spendCats.reduce(function(a, c) { return a + (parseFloat(expenses[c]) || 0); }, 0);
    var spendRem = spendP - spendA;
    var healthScore = spendP > 0
      ? Math.max(0, Math.min(100, Math.round((spendRem / spendP) * 100))) : 100;
    var goalSaved = 0;
    if (goal && goal.saved != null) goalSaved = parseFloat(goal.saved) || 0;
    else goalSaved = parseFloat(expenses['Savings']) || 0;
    return {
      income:       parseFloat(localStorage.getItem('sf_income'))    || 0,
      inflation:    parseFloat(localStorage.getItem('sf_inflation')) || 0,
      planned:      planned,
      expenses:     expenses,
      transactions: transactions,
      totalPlanned: Math.round(totalPlanned),
      totalSpent:   Math.round(totalSpent),
      remaining:    Math.round(remaining),
      healthScore:  healthScore,
      riskLevel:    healthScore >= 70 ? 'Low Risk' : healthScore >= 40 ? 'Moderate Risk' : 'High Risk',
      goalName:     goal ? (goal.name || null) : null,
      goalTarget:   goal ? (parseFloat(goal.target) || 0) : 0,
      goalSaved:    goalSaved
    };
  } catch (e) {
    return {
      income: 0, inflation: 0, planned: {}, expenses: {}, transactions: [],
      totalPlanned: 0, totalSpent: 0, remaining: 0,
      healthScore: 100, riskLevel: 'Low Risk',
      goalName: null, goalTarget: 0, goalSaved: 0
    };
  }
}

// ── CHAT UI HELPERS ───────────────────────────────────────────
function sfFormatTimestamp(ts) {
  try {
    var d = ts ? new Date(ts) : new Date();
    var h = d.getHours(), mins = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (mins < 10 ? '0' : '') + mins + ' ' + ampm;
  } catch (e) { return ''; }
}

function addChatBubble(text, sender) {
  try {
    var chatWindow = document.getElementById('chatWindow');
    if (!chatWindow) return;
    var wrap = document.createElement('div');
    wrap.className = 'chat-bubble-wrap ' + (sender === 'bot-notice' ? 'bot notice' : sender);
    var safe = String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
      .replace(/•/g, '&bull;');
    var ts = sfFormatTimestamp(Date.now());
    wrap.innerHTML = '<div class="chat-bubble">' + safe + '</div><div class="chat-ts">' + ts + '</div>';
    chatWindow.appendChild(wrap);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  } catch (e) {}
}

function showTyping() {
  try {
    var chatWindow = document.getElementById('chatWindow');
    if (!chatWindow) return;
    var el = document.createElement('div');
    el.className = 'chat-bubble-wrap bot';
    el.id = 'typingIndicator';
    el.innerHTML =
      '<div class="chat-bubble">' +
        '<div class="typing-indicator">' +
          '<div class="typing-dot"></div>' +
          '<div class="typing-dot"></div>' +
          '<div class="typing-dot"></div>' +
        '</div>' +
      '</div>';
    chatWindow.appendChild(el);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  } catch (e) {}
}

function removeTyping() {
  try { var el = document.getElementById('typingIndicator'); if (el) el.remove(); } catch (e) {}
}

function renderQuickReplies(chips) {
  try {
    removeQuickReplies();
    var chatWindow = document.getElementById('chatWindow');
    if (!chatWindow || !chips || !chips.length) return;
    var row = document.createElement('div');
    row.id = 'quickRepliesRow';
    row.className = 'quick-replies-row';
    chips.forEach(function(chip) {
      var btn = document.createElement('button');
      btn.className = 'quick-reply-chip';
      btn.textContent = chip;
      btn.onclick = function() {
        var input = document.getElementById('chatInput');
        if (input) { input.value = chip; sendChatMessage(); }
      };
      row.appendChild(btn);
    });
    chatWindow.appendChild(row);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  } catch (e) {}
}

function removeQuickReplies() {
  try { var el = document.getElementById('quickRepliesRow'); if (el) el.remove(); } catch (e) {}
}

function clearChat() {
  try {
    var chatWindow = document.getElementById('chatWindow');
    if (chatWindow) chatWindow.innerHTML = '';
    conversationHistory = [];
    advisorState = { lastIntent: null, lastCategory: null, lastAsked: null, lastEntities: {}, turnCount: 0, fallbackCount: 0, lastLang: 'en', sessionStart: Date.now() };
    var ctx = getContext();
    addChatBubble(sfProfessionalWelcome(ctx, 'en'), 'bot');
    renderQuickReplies(sfGetQuickReplies('greet', 'en', 0));
  } catch (e) {}
}

// ── AUTO INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  try {
    var chatWindow = document.getElementById('chatWindow');
    if (chatWindow && chatWindow.children.length === 0) {
      var ctx = getContext();
      addChatBubble(sfProfessionalWelcome(ctx, 'en'), 'bot');
      renderQuickReplies(sfGetQuickReplies('greet', 'en', 0));
    }
  } catch (e) {}

  // Inject mic button after DOM is ready
  try { sfInjectVoiceButton(); } catch (e) {}

  // Retry injection after a short delay in case the input renders late
  setTimeout(function() {
    try { sfInjectVoiceButton(); } catch (e) {}
  }, 800);
});

// ══════════════════════════════════════════════════════════════
// ── VOICE INPUT (Web Speech API) — v7.2 fixed ────────────────
// ══════════════════════════════════════════════════════════════
var sfVoiceState = {
  recognition: null,
  isListening: false,
  interimText: ''
};

// ── Find the chat input using many possible selectors ─────────
function sfFindChatInput() {
  // Try the most common IDs and classes used in chat UIs
  var selectors = [
    '#chatInput',
    '#chat-input',
    '#messageInput',
    '#message-input',
    '#userInput',
    '#user-input',
    '.chat-input',
    '.message-input',
    '.chatbot-input',
    'input[placeholder*="Type"]',
    'input[placeholder*="type"]',
    'input[placeholder*="message"]',
    'input[placeholder*="Message"]',
    'input[placeholder*="ask"]',
    'input[placeholder*="Ask"]',
    'input[placeholder*="bol"]',
    'input[placeholder*="likho"]',
    'textarea.chat-input',
    'textarea[placeholder]',
    'input[type="text"]'
  ];
  for (var i = 0; i < selectors.length; i++) {
    try {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    } catch (e) {}
  }
  return null;
}

function sfVoiceSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function sfGetVoiceBtn() {
  return document.getElementById('sfVoiceBtn');
}

var MIC_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>';
var STOP_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
var SPIN_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

function sfSetVoiceBtnState(state) {
  var btn = sfGetVoiceBtn();
  if (!btn) return;
  btn.setAttribute('data-state', state);
  if (state === 'listening') {
    btn.title = 'Listening — click to stop';
    btn.innerHTML = STOP_ICON;
  } else if (state === 'processing') {
    btn.title = 'Processing…';
    btn.innerHTML = SPIN_ICON;
  } else {
    btn.title = 'Speak your question (Urdu or English)';
    btn.innerHTML = MIC_ICON;
  }
}

function sfShowVoiceStatus(msg) {
  var el = document.getElementById('sfVoiceStatus');
  if (!el) return;
  if (typeof msg === 'string' && msg) {
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function sfClearVoiceStatusAfter(ms) {
  setTimeout(function() { sfShowVoiceStatus(''); }, ms);
}

// ── VOICE TRANSCRIPT NORMALIZER ───────────────────────────────
// Fixes two problems:
//   1. Chrome/Edge adds punctuation (commas, periods) → strips them
//   2. en-IN mishears Roman Urdu words → maps to correct spelling
//   e.g. "Expenses, Butao." → "expenses batao"
//        "Expenses, but all." → "expenses batao"
function sfVoiceNormalize(text) {
  if (!text) return '';
  var s = text
    .toLowerCase()
    .replace(/[.,!?;:'"()\-]+/g, ' ')   // strip all punctuation
    .replace(/\s+/g, ' ')
    .trim();

  // Common Roman Urdu misrecognitions (browser hears English-like phonetics)
  var fixes = [
    // batao
    [/\b(butao|but\s*ao|but\s*all|but\s*ta|buta|batta|beta|butto|butt\s*ao)\b/g, 'batao'],
    // dikhao
    [/\b(dikh\s*ao|dick\s*how|dik\s*how|dekh\s*ao|dekha|dikhao|dikh)\b/g, 'dikhao'],
    // karo / karein / karna
    [/\b(cur\s*rent|karen|carry\s*in|carry\s*en|carry\s*in|carry|kren|kr\s*en)\b/g, 'karein'],
    [/\b(car\s*oh|karo|caro|car\s*o)\b/g, 'karo'],
    [/\b(kar\s*na|karna)\b/g, 'karna'],
    // mera / meri
    [/\b(my\s*ra|myra)\b/g, 'mera'],
    [/\b(my\s*ri|myri)\b/g, 'meri'],
    // agar
    [/\b(a\s*gar|ugar|ogar)\b/g, 'agar'],
    // kitna / kitni
    [/\b(kit\s*na|ki\s*tna|kidna|kitten\s*a)\b/g, 'kitna'],
    [/\b(kit\s*ni|ki\s*tni)\b/g, 'kitni'],
    // baqi / bacha / bachat
    [/\b(ba\s*ki|baa\s*ki|bucky|backy)\b/g, 'baqi'],
    [/\b(ba\s*cha|bacha)\b/g, 'bacha'],
    [/\b(bach\s*at|ba\s*chat|ba\s*chaat|bachet)\b/g, 'bachat'],
    // qarz
    [/\b(qar\s*z|karz|carz|cars)\b/g, 'qarz'],
    // kharch
    [/\b(kha\s*rach|khar\s*ch|kharach|harrach)\b/g, 'kharch'],
    // mahina
    [/\b(ma\s*heena|maheena|mahina|mahena)\b/g, 'mahina'],
    // salary
    [/\b(sa\s*lari|slari|salari)\b/g, 'salary'],
    // health score
    [/\b(health\s*s\s*core)\b/g, 'health score'],
    // show / dikhao synonyms from voice
    [/\b(show\s*me|show\s*my)\b/g, 'dikhao'],
    // tips do
    [/\b(tips?\s*doh|tip\s*do|tips?\s*give)\b/g, 'tips do'],
    // paisa / paise
    [/\b(pie\s*sa|paisa|pie\s*say)\b/g, 'paisa'],
    // income
    [/\b(in\s*come)\b/g, 'income'],
    // savings
    [/\b(savin\s*gs?|savin)\b/g, 'savings'],
    // goal
    [/\b(go\s*al)\b/g, 'goal'],
    // budget
    [/\b(bud\s*get)\b/g, 'budget']
  ];

  for (var i = 0; i < fixes.length; i++) {
    s = s.replace(fixes[i][0], fixes[i][1]);
  }
  return s.replace(/\s+/g, ' ').trim();
}

function sfStopVoice() {
  try {
    if (sfVoiceState.recognition) {
      sfVoiceState.recognition.abort();
      sfVoiceState.recognition = null;
    }
  } catch (e) {}
  sfVoiceState.isListening = false;
  sfVoiceState.interimText = '';
  sfSetVoiceBtnState('idle');
  sfShowVoiceStatus('');
}

function sfStartVoice() {
  if (!sfVoiceSupported()) {
    sfShowVoiceStatus('❌ Browser does not support voice. Use Chrome or Edge.');
    sfClearVoiceStatusAfter(4000);
    return;
  }

  if (sfVoiceState.isListening) {
    sfStopVoice();
    return;
  }

  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = new SpeechRec();

  // en-IN handles South Asian (Pakistani/Indian) accent far better than en-US.
  // Roman Urdu words like "batao", "dikhao", "kitna" are recognised more accurately.
  // The normalizer below fixes any remaining misrecognitions before intent detection.
  rec.lang            = 'en-IN';
  rec.continuous      = false;
  rec.interimResults  = true;
  rec.maxAlternatives = 3;

  sfVoiceState.recognition = rec;
  sfVoiceState.isListening = true;
  sfVoiceState.interimText = '';

  sfSetVoiceBtnState('listening');
  sfShowVoiceStatus('🎙️ Listening… speak now');

  rec.onresult = function(event) {
    var interim = '';
    var finalText = '';
    for (var i = event.resultIndex; i < event.results.length; i++) {
      // Check all alternatives and pick the longest one
      var bestTranscript = '';
      for (var a = 0; a < event.results[i].length; a++) {
        var alt = event.results[i][a].transcript;
        if (alt.length > bestTranscript.length) bestTranscript = alt;
      }
      if (event.results[i].isFinal) {
        finalText += bestTranscript;
      } else {
        interim += bestTranscript;
      }
    }
    var raw = finalText || interim;
    if (raw) {
      // Normalize fixes punctuation + Roman Urdu misrecognitions
      var normalized = sfVoiceNormalize(raw);
      sfVoiceState.interimText = normalized;
      // Show what was heard (raw) so user can see — send the normalized version
      sfShowVoiceStatus('🎙️ Heard: "' + raw + '"' + (normalized !== raw ? '  →  "' + normalized + '"' : ''));
      var inp = sfFindChatInput();
      if (inp) inp.value = normalized;
    }
  };

  rec.onspeechend = function() {
    sfSetVoiceBtnState('processing');
    sfShowVoiceStatus('⏳ Processing…');
  };

  rec.onend = function() {
    var captured = (sfVoiceState.interimText || '').trim();
    sfVoiceState.isListening = false;
    sfVoiceState.recognition = null;

    if (captured) {
      var inp = sfFindChatInput();
      if (inp) inp.value = captured;
      sfSetVoiceBtnState('processing');
      sfShowVoiceStatus('✅ "' + captured + '" — sending…');
      setTimeout(function() {
        sfStopVoice();
        // Try the standard send function, fall back to triggering Enter
        if (typeof sendChatMessage === 'function') {
          sendChatMessage();
        } else {
          var inp2 = sfFindChatInput();
          if (inp2) {
            var ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            inp2.dispatchEvent(ev);
          }
        }
      }, 350);
    } else {
      sfStopVoice();
      sfShowVoiceStatus('🔇 Nothing heard — please try again.');
      sfClearVoiceStatusAfter(3500);
    }
  };

  rec.onerror = function(event) {
    sfStopVoice();
    var msgs = {
      'not-allowed':   '🚫 Mic blocked — click the 🔒 lock in the browser address bar and allow microphone.',
      'no-speech':     '🔇 No speech detected — speak louder or closer to the mic.',
      'network':       '🌐 Network error — check your internet connection.',
      'audio-capture': '🎤 No microphone found — plug one in and try again.',
      'aborted':       ''
    };
    var msg = msgs[event.error] || ('⚠️ Voice error: ' + event.error);
    if (msg) {
      sfShowVoiceStatus(msg);
      sfClearVoiceStatusAfter(5000);
    }
  };

  try {
    rec.start();
  } catch (e) {
    sfStopVoice();
    sfShowVoiceStatus('⚠️ Could not start mic — check browser permissions.');
    sfClearVoiceStatusAfter(4000);
  }
}

function sfVoiceBtnPress() {
  if (sfVoiceState.isListening) {
    sfStopVoice();
  } else {
    sfStartVoice();
  }
}

// ── INJECT MIC BUTTON — robust multi-selector injection ───────
function sfInjectVoiceButton() {
  if (document.getElementById('sfVoiceBtn')) return; // already injected
  if (!sfVoiceSupported()) return;

  // ── 1. Create status bar ──────────────────────────────────
  if (!document.getElementById('sfVoiceStatus')) {
    var status = document.createElement('div');
    status.id        = 'sfVoiceStatus';
    status.className = 'sf-voice-status';
    status.style.display = 'none';
    // Append status bar to body as a fixed overlay — always visible
    document.body.appendChild(status);
  }

  // ── 2. Create mic button ──────────────────────────────────
  var btn = document.createElement('button');
  btn.id        = 'sfVoiceBtn';
  btn.type      = 'button';
  btn.className = 'sf-voice-btn';
  btn.setAttribute('data-state', 'idle');
  btn.title     = 'Speak your question (Urdu or English)';
  btn.innerHTML = MIC_ICON;
  btn.onclick   = sfVoiceBtnPress;

  // ── 3. Find the input and insert button next to it ────────
  var inp = sfFindChatInput();
  if (inp && inp.parentNode) {
    var par  = inp.parentNode;
    var next = inp.nextSibling;
    // Insert right after the input
    if (next) par.insertBefore(btn, next);
    else       par.appendChild(btn);
    return;
  }

  // ── 4. Fallback: floating fixed button ───────────────────
  // If we can't find the input, add a fixed floating mic button
  btn.className = 'sf-voice-btn sf-voice-btn-float';
  document.body.appendChild(btn);
}

// ── CSS INJECTION ─────────────────────────────────────────────
(function injectChatStyles() {
  if (document.getElementById('sf-chat-extra-styles')) return;
  var style = document.createElement('style');
  style.id = 'sf-chat-extra-styles';
  style.textContent = [
    '.chat-ts { font-size: 10px; color: #9ca3af; margin-top: 3px; padding: 0 4px; }',
    '.chat-bubble-wrap.user .chat-ts { text-align: right; }',
    '.chat-bubble-wrap.bot  .chat-ts { text-align: left; }',
    '.quick-replies-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 10px 10px; }',
    '.quick-reply-chip {',
    '  background: transparent; border: 1.5px solid #6366f1; color: #6366f1;',
    '  border-radius: 999px; padding: 5px 13px; font-size: 12px; font-weight: 500;',
    '  cursor: pointer; transition: background 0.15s, color 0.15s; white-space: nowrap;',
    '}',
    '.quick-reply-chip:hover { background: #6366f1; color: #fff; }',

    /* ── Mic button ── */
    '.sf-voice-btn {',
    '  display: inline-flex; align-items: center; justify-content: center;',
    '  width: 38px; height: 38px; border-radius: 50%;',
    '  border: none; cursor: pointer; flex-shrink: 0;',
    '  background: transparent; color: #6b7280;',
    '  transition: background 0.2s, color 0.2s, box-shadow 0.2s;',
    '  outline: none;',
    '}',
    '.sf-voice-btn:hover { background: #f3f4f6; color: #6366f1; }',

    /* Listening state,red pulsing ring */
    '.sf-voice-btn[data-state="listening"] {',
    '  background: #fee2e2; color: #ef4444;',
    '  box-shadow: 0 0 0 0 rgba(239,68,68,0.5);',
    '  animation: sf-mic-pulse 1.2s ease-out infinite;',
    '}',

    /* Processing state — indigo spinner */
    '.sf-voice-btn[data-state="processing"] {',
    '  background: #ede9fe; color: #6366f1;',
    '  animation: sf-spin 0.8s linear infinite;',
    '}',

    '@keyframes sf-mic-pulse {',
    '  0%   { box-shadow: 0 0 0 0   rgba(239,68,68,0.5); }',
    '  70%  { box-shadow: 0 0 0 10px rgba(239,68,68,0);   }',
    '  100% { box-shadow: 0 0 0 0   rgba(239,68,68,0);   }',
    '}',

    '@keyframes sf-spin {',
    '  from { transform: rotate(0deg); }',
    '  to   { transform: rotate(360deg); }',
    '}',

    /* Voice status — fixed bottom bar always on top */
    '#sfVoiceStatus {',
    '  position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999;',
    '  font-size: 13px; font-weight: 500; text-align: center;',
    '  color: #1f2937; background: #f0fdf4;',
    '  border-top: 2px solid #6366f1;',
    '  padding: 7px 16px;',
    '  box-shadow: 0 -2px 8px rgba(0,0,0,0.08);',
    '  transition: opacity 0.2s;',
    '}',

    /* Floating mic button fallback */
    '.sf-voice-btn-float {',
    '  position: fixed !important;',
    '  bottom: 80px; right: 20px; z-index: 99998;',
    '  width: 52px !important; height: 52px !important;',
    '  background: #6366f1 !important; color: #fff !important;',
    '  box-shadow: 0 4px 14px rgba(99,102,241,0.4);',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();
