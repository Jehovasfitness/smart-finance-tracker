// ============================================================
// transactions.js — Transaction history table and delete
// ============================================================

// REFRESH TRANSACTIONS — called when switching to Transactions tab
function refreshTransactions() {
  const transactions = JSON.parse(localStorage.getItem('sf_transactions')) || [];
  const wrap = document.getElementById('transactionTableWrap');
  if (!wrap) return;

  // Show empty state if no transactions
  if (transactions.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📋</span>
        <strong>No transactions yet</strong>
        <p>Add expenses in the Expenses section to see them here</p>
      </div>`;
    return;
  }

  // Build table
  let html = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Date</th>
            <th>Time</th>
            <th>Category</th>
            <th>Note</th>
            <th>Amount</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>`;

  transactions.forEach((tx, index) => {
    const badgeClass = 'badge-' + tx.category.toLowerCase();
    html += `
      <tr>
        <td style="color:var(--text-light); font-size:12px;">${index + 1}</td>
        <td>${tx.date}</td>
        <td style="color:var(--text-light)">${tx.time}</td>
        <td>
          <span class="category-badge ${badgeClass}">
            ${CATEGORY_ICONS[tx.category] || ''} ${tx.category}
          </span>
        </td>
        <td style="color:var(--text-mid)">${tx.note}</td>
        <td style="font-weight:700; color:var(--text-dark)">${formatRs(tx.amount)}</td>
        <td>
          <button class="btn btn-danger" onclick="deleteTransaction(${tx.id})">
            🗑 Delete
          </button>
        </td>
      </tr>`;
  });

  html += `</tbody></table></div>`;

  // Add total row at bottom
  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  html += `
    <div style="display:flex; justify-content:space-between; align-items:center;
      padding:16px 14px; border-top:2px solid var(--border); margin-top:4px;">
      <span style="font-size:13px; color:var(--text-mid); font-weight:600;">
        Total Transactions: ${transactions.length}
      </span>
      <span style="font-size:16px; font-weight:800; color:var(--text-dark);">
        Total: ${formatRs(total)}
      </span>
    </div>`;

  wrap.innerHTML = html;
}


// DELETE TRANSACTION
function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;

  // Get transactions and find the one to delete
  let transactions = JSON.parse(localStorage.getItem('sf_transactions')) || [];
  const tx = transactions.find(t => t.id === id);

  if (!tx) return;

  // Remove from transaction list
  transactions = transactions.filter(t => t.id !== id);
  localStorage.setItem('sf_transactions', JSON.stringify(transactions));

  // Also subtract from expenses totals
  let expenses = JSON.parse(localStorage.getItem('sf_expenses')) || {};
  if (expenses[tx.category]) {
    expenses[tx.category] = Math.max(0, expenses[tx.category] - tx.amount);
  }
  localStorage.setItem('sf_expenses', JSON.stringify(expenses));

  // Also update Firestore expenses
  if (typeof saveExpenseToFirestore === 'function') saveExpenseToFirestore(expenses);

  // Delete from Firestore if firestoreId exists
  if (tx.firestoreId && typeof deleteTransactionFromFirestore === 'function') {
    deleteTransactionFromFirestore(tx.firestoreId);
  }

  // Refresh all affected sections
  refreshTransactions();
  refreshDashboard();
  refreshExpenses();
  refreshInsights();
}