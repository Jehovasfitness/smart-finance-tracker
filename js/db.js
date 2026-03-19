// ============================================================
// db.js — Firestore Database operations
// ============================================================

// ── SAVE BUDGET TO FIRESTORE ──
function saveBudgetToFirestore(income, inflation, planned) {
  var user = firebase.auth().currentUser;
  if (!user) return;
  db.collection('users').doc(user.uid).set({
    income: income, inflation: inflation, planned: planned,
    cleared: false, updatedAt: new Date().toISOString()
  }, { merge: true })
  .then(function() { console.log('Budget saved'); })
  .catch(function(err) { console.error('Save error:', err); });
}

// ── SAVE EXPENSE TO FIRESTORE ──
function saveExpenseToFirestore(expenses) {
  var user = firebase.auth().currentUser;
  if (!user) return;
  db.collection('users').doc(user.uid).set({
    expenses: expenses, cleared: false, updatedAt: new Date().toISOString()
  }, { merge: true })
  .then(function() { console.log('Expenses saved'); })
  .catch(function(err) { console.error('Save error:', err); });
}

// ── SAVE TRANSACTION TO FIRESTORE ──
function saveTransactionToFirestore(transaction) {
  var user = firebase.auth().currentUser;
  if (!user) return;
  db.collection('users').doc(user.uid).collection('transactions').add(transaction)
  .then(function() { console.log('Transaction saved'); })
  .catch(function(err) { console.error('Save error:', err); });
}

// ── DELETE TRANSACTION FROM FIRESTORE ──
function deleteTransactionFromFirestore(firestoreId) {
  var user = firebase.auth().currentUser;
  if (!user) return;
  db.collection('users').doc(user.uid).collection('transactions').doc(firestoreId).delete()
  .then(function() { console.log('Transaction deleted'); })
  .catch(function(err) { console.error('Delete error:', err); });
}

// ── SAVE GOAL TO FIRESTORE ──
function saveGoalToFirestore(goal) {
  var user = firebase.auth().currentUser;
  if (!user) return;
  db.collection('users').doc(user.uid).set({
    goal: goal, updatedAt: new Date().toISOString()
  }, { merge: true });
}

// ── LOAD ALL USER DATA FROM FIRESTORE ──
function loadUserDataFromFirestore() {
  var user = firebase.auth().currentUser;
  if (!user) return;

  db.collection('users').doc(user.uid).get()
    .then(function(doc) {
      if (doc.exists) {
        var data = doc.data();

        // If data was cleared in Firestore, don't load it
        if (data.cleared === true) {
          console.log('Data was cleared — skipping Firestore load');
          loadTransactionsFromFirestore();
          refreshDashboard();
          refreshExpenses();
          refreshInsights();
          refreshGoals();
          return;
        }

        // Load valid data from Firestore into localStorage
        if (data.income)    localStorage.setItem('sf_income',    data.income);
        if (data.inflation) localStorage.setItem('sf_inflation', data.inflation);

        if (data.planned && typeof data.planned === 'object' && Object.keys(data.planned).length > 0)
          localStorage.setItem('sf_planned', JSON.stringify(data.planned));

        if (data.expenses && typeof data.expenses === 'object' && Object.keys(data.expenses).length > 0) {
          // Only load if values are reasonable (not old test data)
          var totalExpenses = Object.values(data.expenses).reduce(function(a, b) { return a + b; }, 0);
          if (totalExpenses > 0)
            localStorage.setItem('sf_expenses', JSON.stringify(data.expenses));
        }

        if (data.goal) localStorage.setItem('sf_goal', JSON.stringify(data.goal));

        // Pre-fill income/inflation inputs
        if (data.income) {
          var inc = document.getElementById('incomeInput');
          if (inc) inc.value = data.income;
        }
        if (data.inflation) {
          var inf = document.getElementById('inflationInput');
          if (inf) inf.value = data.inflation;
        }

        console.log('User data loaded from Firestore');
      }

      loadTransactionsFromFirestore();
      refreshDashboard();
      refreshExpenses();
      refreshInsights();
      refreshGoals();
    })
    .catch(function(err) {
      console.error('Load error:', err);
      refreshDashboard();
    });
}

// ── LOAD TRANSACTIONS FROM FIRESTORE ──
function loadTransactionsFromFirestore() {
  var user = firebase.auth().currentUser;
  if (!user) return;

  db.collection('users').doc(user.uid)
    .collection('transactions').get()
    .then(function(snapshot) {
      var transactions = [];
      snapshot.forEach(function(doc) {
        var tx = doc.data();
        tx.firestoreId = doc.id;
        transactions.push(tx);
      });
      // Sort by timestamp descending (newest first)
      transactions.sort(function(a, b) {
        return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
      });
      localStorage.setItem('sf_transactions', JSON.stringify(transactions));
      refreshTransactions();
      console.log('Loaded ' + transactions.length + ' transactions');
    })
    .catch(function(err) {
      console.error('Load transactions error:', err);
      // Even if Firestore fails, show localStorage transactions
      refreshTransactions();
    });
}

// ── CLEAR ALL USER DATA ──
function clearAllDataFromFirestore() {
  var user = firebase.auth().currentUser;
  if (!user) return;

  // Set cleared flag so data doesn't reload on next login
  db.collection('users').doc(user.uid).set({
    income: '', inflation: '', planned: {}, expenses: {},
    goal: null, cleared: true, updatedAt: new Date().toISOString()
  });

  // Delete all transactions
  db.collection('users').doc(user.uid).collection('transactions').get()
    .then(function(snapshot) {
      snapshot.forEach(function(doc) { doc.ref.delete(); });
      console.log('All Firestore data cleared');
    });
}