// Function to check if the user is authenticated
function isAuthenticated() {
    // Check if the user token exists in local storage
    const token = localStorage.getItem('token');
    return token !== null;
  }
  
  // Function to redirect the user to the login page if not authenticated
  function redirectToLogin() {
    if (!isAuthenticated()) {
      window.location.href = 'login.html';
    }
  }
  
  // Function to handle user logout
  function logout() {
    // Remove the user token from local storage
    localStorage.removeItem('token');
    // Redirect to the login page
    window.location.href = 'login.html';
  }
  
  // Check authentication on page load
  document.addEventListener('DOMContentLoaded', function() {
    // Get the current page URL
    const currentPage = window.location.pathname.split('/').pop();
  
    // Pages that require authentication
    const authRequiredPages = ['preferences.html', 'recommendations.html', 'profile.html'];
  
    if (authRequiredPages.includes(currentPage)) {
      redirectToLogin();
    }
  
    // Add logout functionality
    const logoutLink = document.querySelector('a[href="logout"]');
    if (logoutLink) {
      logoutLink.addEventListener('click', function(event) {
        event.preventDefault();
        logout();
      });
    }
  });