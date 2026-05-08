// ============================================================
// auth.js — Firebase Authentication
// Login, Signup, Logout using Firebase Auth
// ============================================================
 
// ── CHECK IF USER IS ALREADY LOGGED IN ──
firebase.auth().onAuthStateChanged(function(user) {
  if (user) {
    // Check if this is a different user than last session
    var lastUserId = localStorage.getItem('sf_last_user_id');
    if (lastUserId && lastUserId !== user.uid) {
      // Different user logged in — clear all previous user's data
      var keysToRemove = [
        'sf_income', 'sf_inflation', 'sf_planned', 'sf_expenses',
        'sf_transactions', 'sf_goal', 'sf_last_month', 'sf_dark_mode'
      ];
      keysToRemove.forEach(function(key) { localStorage.removeItem(key); });
      console.log('New user detected — localStorage cleared.');
    }
    // Save current user ID
    localStorage.setItem('sf_last_user_id', user.uid);
 
    // Save session info to localStorage for PDF and other uses
    localStorage.setItem('sf_session', JSON.stringify({
      displayName: user.displayName || '',
      email:       user.email       || ''
    }));
    showApp(user);
  } else {
    showAuth();
  }
});
 
// ── LOGIN ──
function handleLogin() {
  var email    = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;
 
  if (!email)    { showAuthError('Please enter your email address.'); return; }
  if (!password) { showAuthError('Please enter your password.');      return; }
 
  var btn = document.querySelector('#loginForm .btn-primary');
  btn.textContent = 'Logging in...';
  btn.disabled    = true;
 
  firebase.auth().signInWithEmailAndPassword(email, password)
    .then(function(result) {
      btn.textContent = 'Login to Dashboard';
      btn.disabled    = false;
    })
    .catch(function(error) {
      btn.textContent = 'Login to Dashboard';
      btn.disabled    = false;
      if (error.code === 'auth/user-not-found')       showAuthError('No account found with this email.');
      else if (error.code === 'auth/wrong-password')  showAuthError('Incorrect password. Please try again.');
      else if (error.code === 'auth/invalid-email')   showAuthError('Please enter a valid email address.');
      else if (error.code === 'auth/invalid-credential') showAuthError('Incorrect email or password.');
      else showAuthError('Login failed. Please try again.');
    });
}
 
// ── SIGNUP ──
function handleSignup() {
  var name     = document.getElementById('signupName').value.trim();
  var email    = document.getElementById('signupEmail').value.trim();
  var password = document.getElementById('signupPassword').value;
 
  if (!name)               { showAuthError('Please enter your full name.');              return; }
  if (!email)              { showAuthError('Please enter your email address.');          return; }
  if (!email.includes('@')){ showAuthError('Please enter a valid email address.');       return; }
  if (!password)           { showAuthError('Please enter a password.');                  return; }
  if (password.length < 6) { showAuthError('Password must be at least 6 characters.');  return; }
 
  var btn = document.querySelector('#signupForm .btn-primary');
  btn.textContent = 'Creating account...';
  btn.disabled    = true;
 
  firebase.auth().createUserWithEmailAndPassword(email, password)
    .then(function(result) {
      return result.user.updateProfile({ displayName: name });
    })
    .then(function() {
      showAuthSuccess('Account created! Redirecting...');
      btn.textContent = 'Create Account';
      btn.disabled    = false;
    })
    .catch(function(error) {
      btn.textContent = 'Create Account';
      btn.disabled    = false;
      if (error.code === 'auth/email-already-in-use') showAuthError('An account with this email already exists.');
      else if (error.code === 'auth/weak-password')   showAuthError('Password is too weak. Use at least 6 characters.');
      else if (error.code === 'auth/invalid-email')   showAuthError('Please enter a valid email address.');
      else showAuthError('Signup failed. Please try again.');
    });
}
 
// ── LOGOUT ──
function handleLogout() {
  if (!confirm('Are you sure you want to logout?')) return;
  firebase.auth().signOut()
    .then(function() {
      showAuth();
    });
}
 
// ── ENTER KEY SUPPORT ──
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var loginForm  = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    if (!loginForm.classList.contains('hidden'))  handleLogin();
    if (!signupForm.classList.contains('hidden')) handleSignup();
  }
});
 
// ── GOOGLE SIGN-IN ──
function handleGoogleSignIn() {
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
 
  var btns = document.querySelectorAll('.btn-google');
  btns.forEach(function(btn) { btn.textContent = 'Connecting...'; btn.disabled = true; });
 
  firebase.auth().signInWithPopup(provider)
    .then(function(result) {
      console.log('Google sign-in success:', result.user.displayName);
    })
    .catch(function(error) {
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
        firebase.auth().signInWithRedirect(provider);
      } else {
        btns.forEach(function(btn) {
          btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18" alt="Google"/> Continue with Google';
          btn.disabled = false;
        });
        showAuthError('Google sign-in failed. Please try again.');
        console.error('Google sign-in error:', error);
      }
    });
}
 
// Handle redirect result on page load
firebase.auth().getRedirectResult()
  .then(function(result) {
    if (result && result.user) {
      console.log('Google redirect sign-in success:', result.user.displayName);
    }
  })
  .catch(function(error) {
    if (error.code !== 'auth/no-auth-event') {
      console.error('Redirect result error:', error);
    }
  });