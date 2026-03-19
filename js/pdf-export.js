// ============================================================
// pdf-export.js — Generate professional PDF financial report
// ============================================================

function exportPDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { alert('PDF library not loaded. Please refresh and try again.'); return; }

  const doc = new jsPDF();

  // Get data
  const planned      = JSON.parse(localStorage.getItem('sf_planned'))      || {};
  const expenses     = JSON.parse(localStorage.getItem('sf_expenses'))     || {};
  const transactions = JSON.parse(localStorage.getItem('sf_transactions')) || [];
  const goal         = JSON.parse(localStorage.getItem('sf_goal'))         || null;
  const income       = localStorage.getItem('sf_income')    || 0;
  const inflation    = localStorage.getItem('sf_inflation') || 0;
  const session      = JSON.parse(localStorage.getItem('sf_session'))      || {};
  // Get user name from Firebase auth (most reliable)
  const firebaseUser = firebase.auth().currentUser;

  const totalPlanned = Object.values(planned).reduce((a, b) => a + b, 0);
  const totalSpent   = Object.values(expenses).reduce((a, b) => a + b, 0);
  const totalRemaining = Math.max(0, totalPlanned - totalSpent);
  // Use spending-only formula (exclude Savings) — same as dashboard & insights
  const spendCats    = ['Groceries', 'Bills', 'Healthcare', 'Education'];
  const spendP       = spendCats.reduce((a, c) => a + (planned[c]  || 0), 0);
  const spendA       = spendCats.reduce((a, c) => a + (expenses[c] || 0), 0);
  const spendRem     = Math.max(0, spendP - spendA);
  const healthScore  = spendP > 0
    ? Math.max(0, Math.min(100, Math.round((spendRem / spendP) * 100)))
    : 0;
  const riskLevel = healthScore >= 70 ? 'Low Risk' : healthScore >= 40 ? 'Moderate Risk' : 'High Risk';

  const pageW  = doc.internal.pageSize.getWidth();
  const margin = 20;
  let   y      = 0;

  // ── HEADER ──
  doc.setFillColor(79, 70, 229); // indigo
  doc.rect(0, 0, pageW, 42, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Smart Finance Tracker', margin, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Monthly Financial Report', margin, 28);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-PK')}`, margin, 36);

  // User name on right
  const userName = (firebaseUser && firebaseUser.displayName) || (firebaseUser && firebaseUser.email) || session.displayName || session.email || 'User';
  doc.text(`Prepared for: ${userName}`, pageW - margin, 28, { align: 'right' });

  y = 55;

  // ── SECTION: BUDGET SUMMARY ──
  sectionTitle(doc, 'Budget Summary', y); y += 10;

  const summaryData = [
    ['Monthly Income',          `Rs. ${Number(income).toLocaleString('en-PK')}`],
    ['Inflation Rate',          `${inflation}%`],
    ['Inflation-Adjusted Budget', `Rs. ${Math.round(totalPlanned).toLocaleString('en-PK')}`],
    ['Total Actual Spending',   `Rs. ${Math.round(totalSpent).toLocaleString('en-PK')}`],
    ['Remaining Budget',        `Rs. ${Math.round(totalRemaining).toLocaleString('en-PK')}`],
    ['Financial Health Score',  `${healthScore}%`],
    ['Risk Classification',     riskLevel],
  ];

  summaryData.forEach(([label, value]) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(label + ':', margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(value, pageW - margin, y, { align: 'right' });
    y += 8;
  });

  y += 6;

  // ── SECTION: BUDGET BREAKDOWN ──
  sectionTitle(doc, 'Budget Breakdown by Category', y); y += 10;

  // Table header
  tableHeader(doc, margin, y, pageW,
    ['Category', 'Planned (Rs.)', 'Actual (Rs.)', 'Remaining', 'Used %']);
  y += 8;

  const cats = ['Groceries', 'Bills', 'Healthcare', 'Education', 'Savings'];
  cats.forEach((cat, i) => {
    const p          = planned[cat]  || 0;
    const a          = expenses[cat] || 0;
    const isSavings  = cat === 'Savings';
    const rem        = isSavings ? Math.max(0, a - p) : Math.max(0, p - a); // savings: show extra saved
    const pct        = p > 0 ? Math.round((a / p) * 100) : 0;
    const over       = a > p && !isSavings; // savings never "over budget"

    // Alternate row background
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 5, pageW - margin * 2, 8, 'F');
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    // Savings: always dark text (green achievement), spending: red if over
    if (isSavings) {
      doc.setTextColor(22, 101, 52); // dark green for savings
    } else {
      doc.setTextColor(over ? 180 : 30, over ? 50 : 41, over ? 50 : 59);
    }
    doc.text(cat,                                              margin + 2,   y);
    doc.text(`Rs. ${Math.round(p).toLocaleString('en-PK')}`,  margin + 45,  y);
    doc.text(`Rs. ${Math.round(a).toLocaleString('en-PK')}`,  margin + 85,  y);
    // Remaining column
    const remLabel = isSavings
      ? (a >= p ? `+Rs. ${Math.round(rem).toLocaleString('en-PK')}` : `Rs. 0`)
      : `Rs. ${Math.round(rem).toLocaleString('en-PK')}`;
    doc.text(remLabel, margin + 125, y);
    // Used % column — right aligned, savings never shows (!!)
    const pctLabel = isSavings
      ? `${pct}% ${a >= p ? '[MET]' : ''}`
      : `${pct}%${over ? ' (!!)' : ''}`;
    doc.text(pctLabel, pageW - margin, y, { align: 'right' });
    y += 8;
  });

  y += 6;

  // ── SECTION: TRANSACTION HISTORY ──
  if (transactions.length > 0) {
    // New page if needed
    if (y > 220) { doc.addPage(); y = 20; }

    sectionTitle(doc, `Transaction History (${transactions.length} transactions)`, y); y += 10;

    tableHeader(doc, margin, y, pageW, ['#', 'Date', 'Time', 'Category', 'Note', 'Amount']);
    y += 8;

    // Show max 20 transactions in PDF
    const toShow = transactions.slice(0, 20);
    toShow.forEach((tx, i) => {
      if (y > 265) { doc.addPage(); y = 20; }

      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 5, pageW - margin * 2, 8, 'F');
      }

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(`${i + 1}`,      margin + 2,  y);
      doc.text(tx.date,         margin + 12, y);
      doc.text(tx.time,         margin + 42, y);
      doc.text(tx.category,     margin + 68, y);
      doc.text(tx.note.substring(0, 16), margin + 100, y);
      doc.text(`Rs. ${tx.amount.toLocaleString('en-PK')}`, pageW - margin - 2, y, { align: 'right' });
      y += 7;
    });

    if (transactions.length > 20) {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`... and ${transactions.length - 20} more transactions`, margin, y + 4);
      y += 10;
    }

    y += 4;
  }

  // ── SECTION: SAVINGS GOAL ──
  if (goal) {
    if (y > 240) { doc.addPage(); y = 20; }
    sectionTitle(doc, 'Savings Goal', y); y += 10;

    const saved  = expenses['Savings'] || 0;
    const pct    = Math.min(100, Math.round((saved / goal.target) * 100));

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Goal Name: ${goal.name}`,                                              margin, y); y += 7;
    doc.text(`Target: Rs. ${goal.target.toLocaleString('en-PK')}`,                  margin, y); y += 7;
    doc.text(`Saved: Rs. ${saved.toLocaleString('en-PK')} (${pct}% complete)`,      margin, y); y += 7;
    doc.text(`Remaining: Rs. ${Math.max(0, goal.target - saved).toLocaleString('en-PK')}`, margin, y);
    y += 10;
  }

  // ── FOOTER on all pages ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Smart Finance Tracker — Confidential Financial Report — Page ${i} of ${pageCount}`,
      pageW / 2, 290, { align: 'center' }
    );
  }

  // Save PDF
  const fileName = `smart-finance-report-${new Date().toLocaleDateString('en-PK').replace(/\//g, '-')}.pdf`;
  doc.save(fileName);
}


// ── HELPER: Section title ──
function sectionTitle(doc, title, y) {
  doc.setFillColor(238, 242, 255);
  doc.rect(18, y - 6, doc.internal.pageSize.getWidth() - 36, 10, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(79, 70, 229);
  doc.text(title, 20, y);
}

// ── HELPER: Table header ──
function tableHeader(doc, margin, y, pageW, cols) {
  doc.setFillColor(79, 70, 229);
  doc.rect(margin, y - 5, pageW - margin * 2, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);

  // Position columns evenly
  const positions = [
    margin + 2, margin + 45, margin + 85,
    margin + 125, margin + 125, pageW - margin
  ];

  cols.forEach((col, i) => {
    if (i === cols.length - 1) {
      doc.text(col, positions[i], y, { align: 'right' });
    } else {
      doc.text(col, positions[i], y);
    }
  });
}