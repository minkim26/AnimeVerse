// Get the signup form element
const signupForm = document.getElementById('signupForm');

// Add event listener to the form submission
signupForm.addEventListener('submit', function(event) {
  event.preventDefault(); // Prevent form from submitting

  // Get the input values
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  // Perform signup
  signup(email, password);
});

// Function to handle signup
function signup(email, password) {
  // Make an API request to the server for signup
  fetch('http://localhost:3000/api/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Signup successful
      alert('Signup successful! Please log in to continue.');
      // Redirect to the login page
      window.location.href = 'login.html';
    } else {
      // Signup failed
      alert('Signup failed. ' + data.message);
    }
  })
  .catch(error => {
    console.error('Signup error:', error);
    alert('An error occurred during signup. Please try again later.');
  });
}