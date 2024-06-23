// Get the login form element
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');

// Add event listener to the form submission
loginForm.addEventListener('submit', function(event) {
  event.preventDefault(); // Prevent form from submitting

  // Get the input values
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  // Perform login authentication
  login(email, password);
});

// Function to handle login authentication
function login(email, password) {
  // Make an API request to the server for authentication
  fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Authentication successful
      // Store the user token or session information
      localStorage.setItem('token', data.token);

      // Show success message
      loginMessage.style.display = 'block';

      // Redirect to the preferences page after a short delay
      setTimeout(() => {
        window.location.href = 'preferences.html';
      }, 2000);
    } else {
      // Authentication failed
      alert('Invalid email or password. Please try again.');
    }
  })
  .catch(error => {
    console.error('Login error:', error);
    alert('An error occurred during login. Please try again later.');
  });
}
