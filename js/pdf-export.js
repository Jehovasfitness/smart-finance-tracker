// ============================================================
// pdf-export.js  —  Smart Finance Tracker  —  PDF Export
// Fixes applied in this version
//  1. Savings row overlap  → "Remaining" col right-aligned,
//     "Used %" nudged further right with enough gap
//  2. Unicode garble       → all special chars replaced with
//     plain ASCII equivalents (jsPDF built-in fonts are
//     WinAnsi only; u2265 / u2502 / u2013 / u2014 / u2026
//     all render as garbage)
//  3. Header col clip      → "Remaining/Extra" shortened to
//     "Remaining" in header; "Used %" right-aligned anchor
//  4. Transaction "Amount" cut off -> tPos[5] uses pageW-margin
//     with right-align, matching the rect boundary exactly
//  5. 6th transaction missing -> checkPageBreak threshold
//     corrected; slim header repeated after page break
//  6. Column math redone   -> all positions derived from a
//     single CONTENT_WIDTH so nothing overflows
//  7. Risk footnote        -> plain ASCII only
//  8. Garbled footnote line 2 -> rewritten in plain ASCII
//  9. Savings "+Rs. X extra" too long -> trimmed label
// 10. toLocaleString('en-PK') -> fmt() helper avoids
//     browser fallback surprises
// 11. Firebase crash guard, safeJSON, safeNum, formatDate
//     carried forward from previous fix
// ============================================================
 
function exportPDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { alert('PDF library not loaded. Please refresh and try again.'); return; }
 
  const doc = new jsPDF();
 
  // -- DATA --------------------------------------------------
  const planned      = safeJSON('sf_planned',      {});
  const expenses     = safeJSON('sf_expenses',     {});
  const transactions = safeJSON('sf_transactions', []);
  const goal         = safeJSON('sf_goal',         null);
  const income       = safeNum(localStorage.getItem('sf_income'));
  const inflation    = safeNum(localStorage.getItem('sf_inflation'));
  const session      = safeJSON('sf_session',      {});
 
  // -- FIREBASE (safe) ---------------------------------------
  let firebaseUser = null;
  try {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebaseUser = firebase.auth().currentUser;
    }
  } catch (_) {}
 
  // -- CALCULATIONS ------------------------------------------
  const spendCats      = ['Groceries', 'Bills', 'Healthcare', 'Education'];
  const spendActual    = spendCats.reduce((a, c) => a + safeNum(expenses[c]), 0);
  const spendPlanned   = spendCats.reduce((a, c) => a + safeNum(planned[c]),  0);
  const spendRemaining = Math.max(0, spendPlanned - spendActual);
  const remainingBudget = Math.max(0, income - spendActual);
  const savedAmount    = safeNum(expenses['Savings']);
 
  const healthScore = spendPlanned > 0
    ? Math.max(0, Math.min(100, Math.round((spendRemaining / spendPlanned) * 100)))
    : 0;
  const riskLevel = healthScore >= 70 ? 'Low Risk'
                  : healthScore >= 40 ? 'Moderate Risk'
                  :                     'High Risk';
 
  const inflationAdjusted = Math.round(income * (1 + inflation / 100));
 
  // -- PAGE CONSTANTS ----------------------------------------
  const pageW    = doc.internal.pageSize.getWidth();   // 210 mm A4
  const pageH    = doc.internal.pageSize.getHeight();  // 297 mm A4
  const margin   = 18;
  const contentW = pageW - margin * 2;
  let   y        = 0;
 
  // -- USER NAME ---------------------------------------------
  const userName = (firebaseUser && (firebaseUser.displayName || firebaseUser.email))
                 || session.displayName || session.email || 'User';
 
  // =========================================================
  // PAGE 1 HEADER
  // =========================================================
  drawPageHeader(doc, pageW, margin, userName);
  y = 50;
 
  // =========================================================
  // SECTION: BUDGET SUMMARY
  // =========================================================
  sectionTitle(doc, 'Budget Summary', y, pageW, margin);
  y += 10;
 
  const summaryRows = [
    ['Monthly Income',              'Rs. ' + fmt(income)],
    ['Inflation Rate',              inflation + '%'],
    ['Inflation-Adjusted Income',   'Rs. ' + fmt(inflationAdjusted)],
    ['Total Actual Spending',       'Rs. ' + fmt(Math.round(spendActual))],
    ['Total Saved (Savings)',       'Rs. ' + fmt(Math.round(savedAmount))],
    ['Remaining (Unspent Budget)',  'Rs. ' + fmt(Math.round(remainingBudget))],
    ['Spending Health Score',       healthScore + '%'],
    ['Risk Classification',         riskLevel],
  ];
 
  summaryRows.forEach(function(row) {
    var label = row[0], value = row[1];
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(label + ':', margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(value, pageW - margin, y, { align: 'right' });
    y += 8;
  });
 
  // Footnote — PLAIN ASCII ONLY (jsPDF WinAnsi cannot render
  // Unicode u2265, u2502, u2013, u2014, u2026 etc.)
  y += 2;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Spending Health Score = % of spending budget remaining (Groceries, Bills, Healthcare, Education).',
    margin, y
  );
  y += 5;
  doc.text(
    'Risk levels:  Low = 70%+   |   Moderate = 40-69%   |   High = below 40%',
    margin, y
  );
  y += 10;
 
  // =========================================================
  // SECTION: BUDGET BREAKDOWN
  // =========================================================
  y = checkPageBreak(doc, y, 70, pageW, pageH, margin, userName);
  sectionTitle(doc, 'Budget Breakdown by Category', y, pageW, margin);
  y += 10;
 
  // Column layout (5 cols)
  // Col 0  Category     left  @ margin+2
  // Col 1  Planned      left  @ margin+55
  // Col 2  Actual       left  @ margin+98
  // Col 3  Remaining    RIGHT @ pageW-margin-36  (gap of 36 before Used%)
  // Col 4  Used %       RIGHT @ pageW-margin
  //
  // By right-aligning both col3 and col4 the Savings "+Rs. X"
  // and "112% [MET]" text never collide regardless of length.
  const bCols   = ['Category', 'Planned (Rs.)', 'Actual (Rs.)', 'Remaining', 'Used %'];
  const bPos    = [
    margin + 2,
    margin + 55,
    margin + 98,
    pageW - margin - 36,   // right-anchor for Remaining
    pageW - margin,        // right-anchor for Used %
  ];
  const bRAlign = [false, false, false, true, true];
 
  tableHeader(doc, margin, y, pageW, bCols, bPos, bRAlign);
  y += 8;
 
  var cats = ['Groceries', 'Bills', 'Healthcare', 'Education', 'Savings'];
  cats.forEach(function(cat, i) {
    y = checkPageBreak(doc, y, 10, pageW, pageH, margin, userName);
 
    var p         = safeNum(planned[cat]);
    var a         = safeNum(expenses[cat]);
    var isSavings = cat === 'Savings';
    var rem       = isSavings ? Math.max(0, a - p) : Math.max(0, p - a);
    var pct       = p > 0 ? Math.round((a / p) * 100) : 0;
    var over      = !isSavings && a > p;
 
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 5, contentW, 8, 'F');
    }
 
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
 
    if (isSavings)    { doc.setTextColor(22, 101, 52); }
    else if (over)    { doc.setTextColor(180, 50, 50); }
    else              { doc.setTextColor(30, 41, 59);  }
 
    // Keep Remaining label short — right-aligned so it won't bleed
    var remLabel = isSavings
      ? (a >= p ? '+Rs. ' + fmt(Math.round(rem)) : 'Rs. 0')
      : 'Rs. ' + fmt(Math.round(rem));
 
    // Used% label — right-aligned
    var pctLabel = isSavings
      ? (pct + '%' + (a >= p ? ' [MET]' : ''))
      : (pct + '%'  + (over   ? ' (!!)' : ''));
 
    doc.text(cat,                          bPos[0], y);
    doc.text('Rs. ' + fmt(Math.round(p)), bPos[1], y);
    doc.text('Rs. ' + fmt(Math.round(a)), bPos[2], y);
    doc.text(remLabel,                     bPos[3], y, { align: 'right' });
    doc.text(pctLabel,                     bPos[4], y, { align: 'right' });
    y += 8;
  });
 
  // Savings footnote — plain ASCII
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(148, 163, 184);
  doc.text(
    '* Savings "Remaining" = extra saved above target (+) or Rs. 0 if target not yet met.',
    margin, y + 2
  );
  y += 10;
 
  // =========================================================
  // SECTION: TRANSACTION HISTORY
  // =========================================================
  if (transactions.length > 0) {
    y = checkPageBreak(doc, y, 45, pageW, pageH, margin, userName);
    sectionTitle(doc, 'Transaction History (' + transactions.length + ' transactions)', y, pageW, margin);
    y += 10;
 
    // Column layout (6 cols)
    // Available content ~174 units.
    // #=8  Date=32  Time=26  Category=36  Note=32  Amount=right-anchored
    const tCols   = ['#', 'Date', 'Time', 'Category', 'Note', 'Amount'];
    const tPos    = [
      margin + 2,      // #
      margin + 12,     // Date
      margin + 46,     // Time
      margin + 74,     // Category
      margin + 114,    // Note
      pageW - margin,  // Amount (right-aligned)
    ];
    const tRAlign = [false, false, false, false, false, true];
 
    tableHeader(doc, margin, y, pageW, tCols, tPos, tRAlign);
    y += 8;
 
    var toShow = transactions.slice(0, 20);
    toShow.forEach(function(tx, i) {
      y = checkPageBreak(doc, y, 9, pageW, pageH, margin, userName);
 
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 5, contentW, 8, 'F');
      }
 
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
 
      // Plain '-' dash — \u2014 is unsafe in WinAnsi Helvetica
      var rawNote   = (tx.note != null && String(tx.note).trim() !== '') ? String(tx.note) : '-';
      // Plain '...' — \u2026 is also unsafe
      var noteLabel = rawNote.length > 13 ? rawNote.substring(0, 12) + '...' : rawNote;
 
      doc.text(String(i + 1),                    tPos[0], y);
      doc.text(tx.date     || '-',               tPos[1], y);
      doc.text(tx.time     || '-',               tPos[2], y);
      doc.text(tx.category || '-',               tPos[3], y);
      doc.text(noteLabel,                         tPos[4], y);
      doc.text('Rs. ' + fmt(safeNum(tx.amount)), tPos[5], y, { align: 'right' });
      y += 7;
    });
 
    if (transactions.length > 20) {
      y = checkPageBreak(doc, y, 10, pageW, pageH, margin, userName);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184);
      doc.text(
        '... and ' + (transactions.length - 20) + ' more transactions (visible in the app)',
        margin, y + 4
      );
      y += 12;
    }
    y += 4;
  }
 
  // =========================================================
  // SECTION: SAVINGS GOAL
  // =========================================================
  if (goal) {
    y = checkPageBreak(doc, y, 52, pageW, pageH, margin, userName);
    sectionTitle(doc, 'Savings Goal', y, pageW, margin);
    y += 10;
 
    var target = safeNum(goal.target);
    var gpct   = target > 0 ? Math.min(100, Math.round((savedAmount / target) * 100)) : 0;
 
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('Goal Name: '     + (goal.name || '-'),                              margin, y); y += 7;
    doc.text('Target: Rs. '    + fmt(target),                                     margin, y); y += 7;
    doc.text('Saved: Rs. '     + fmt(savedAmount) + ' (' + gpct + '% complete)',  margin, y); y += 7;
    doc.text('Still needed: Rs. ' + fmt(Math.max(0, target - savedAmount)),       margin, y);
    y += 10;
  }
 
  // =========================================================
  // FOOTER — all pages
  // =========================================================
  var pageCount = doc.internal.getNumberOfPages();
  for (var p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    // Plain ASCII dashes — \u2014 is unsafe
    doc.text(
      'Smart Finance Tracker  --  Confidential  --  Page ' + p + ' of ' + pageCount,
      pageW / 2, pageH - 8, { align: 'center' }
    );
  }
 
  // -- SAVE -------------------------------------------------
  var fileName = 'smart-finance-report-' + formatDate(new Date()).replace(/\//g, '-') + '.pdf';
  doc.save(fileName);
}
 
 
// =============================================================
// HELPERS
// =============================================================
 
/**
 * Draw the full indigo page header (page 1 only).
 */
function drawPageHeader(doc, pageW, margin, userName) {
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageW, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Smart Finance Tracker', margin, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Monthly Financial Report',     margin, 26);
  doc.text('Generated: ' + formatDate(new Date()), margin, 34);
  doc.text('Prepared for: ' + userName, pageW - margin, 26, { align: 'right' });
}
 
/**
 * If y + needed would overflow the page, add a new page with a
 * slim branded header and return the updated y position.
 * Always returns the (possibly updated) y.
 */
function checkPageBreak(doc, y, needed, pageW, pageH, margin, userName) {
  var BOTTOM = pageH - 20; // 20-unit bottom safety margin
  if (y + needed > BOTTOM) {
    doc.addPage();
    // Slim continuation header
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pageW, 20, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Smart Finance Tracker  --  Continued', margin, 13);
    return 28; // y restarts below the slim header
  }
  return y;
}
 
/** Indigo section title banner */
function sectionTitle(doc, title, y, pageW, margin) {
  doc.setFillColor(238, 242, 255);
  doc.rect(margin - 2, y - 6, pageW - (margin - 2) * 2, 10, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(79, 70, 229);
  doc.text(title, margin, y);
}
 
/**
 * Render a table header row.
 * cols    — column labels
 * positions — x anchor per column
 * rAlign  — boolean per column; true = right-align
 */
function tableHeader(doc, margin, y, pageW, cols, positions, rAlign) {
  doc.setFillColor(79, 70, 229);
  doc.rect(margin, y - 5, pageW - margin * 2, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  cols.forEach(function(col, i) {
    var align = (rAlign && rAlign[i]) ? 'right' : 'left';
    doc.text(col, positions[i], y, { align: align });
  });
}
 
/** Safely parse a localStorage key as JSON */
function safeJSON(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    var parsed = JSON.parse(raw);
    return parsed != null ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}
 
/** Coerce to finite number or return 0 */
function safeNum(v) {
  var n = Number(v);
  return isFinite(n) ? n : 0;
}
 
/**
 * Format number with comma separators.
 * Falls back to a regex if en-US locale is unavailable.
 */
function fmt(n) {
  try {
    return Number(n).toLocaleString('en-US');
  } catch (_) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}
 
/** Build DD/MM/YYYY without relying on any locale */
function formatDate(d) {
  return (
    String(d.getDate()).padStart(2, '0')      + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    d.getFullYear()
  );
}