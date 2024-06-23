// Get elements from the DOM
const emailInput = document.getElementById('email');
const oldPasswordInput = document.getElementById('old-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const passwordForm = document.getElementById('password-form');
const preferencesList = document.getElementById('preferences-list');
const profilePicture = document.getElementById('profile-picture');
const randomProfilePictureBtn = document.getElementById('random-profile-picture-btn');
const animePicture = document.getElementById('anime-picture');
const animeDescription = document.getElementById('anime-description');
const animeTitle = document.getElementById('anime-title');
const randomAnimePictureBtn = document.getElementById('random-anime-picture-btn');
const animeTitleText = document.getElementById('anime-title-text');
const randomAnimeTitleBtn = document.getElementById('random-anime-title-btn');
const logoutBtn = document.getElementById('logout-btn'); 

// Function to display the user's current preferences
function displayPreferences() {
  const preferences = JSON.parse(localStorage.getItem('preferredGenres')) || [];
  preferencesList.innerHTML = '';
  preferences.forEach(preference => {
    const listItem = document.createElement('li');
    listItem.textContent = preference.charAt(0).toUpperCase() + preference.slice(1);
    preferencesList.appendChild(listItem);
  });
}

// Function to handle the password form submission
function updatePassword(event) {
  event.preventDefault();

  const email = emailInput.value;
  const oldPassword = oldPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  // Check if the new password and confirm password match
  if (newPassword !== confirmPassword) {
    alert('New password and confirm password do not match. Please try again.');
    return;
  }

  // Make an API request to update the password
  fetch('http://localhost:3000/api/updatePassword', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, oldPassword, newPassword })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Clear the form fields
        emailInput.value = '';
        oldPasswordInput.value = '';
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';

        // Display a success message
        alert('Password updated successfully!');
      } else {
        alert('Failed to update password. ' + data.message);
      }
    })
    .catch(error => {
      console.error('Error updating password:', error);
      alert('An error occurred while updating the password. Please try again later.');
    });
}

// Function to fetch and display a random profile picture
async function fetchRandomProfilePicture() {
  try {
    const response = await fetch('http://localhost:5000/random-profile-image');
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const data = await response.json();
    const imageUrl = data.image_url;

    // Log the URL for debugging
    console.log('Fetched random profile picture URL:', imageUrl);

    // Update the profile picture element and save the URL to localStorage
    profilePicture.src = imageUrl;
    profilePicture.alt = "Profile Picture";
    localStorage.setItem('profilePictureUrl', imageUrl);
  } catch (error) {
    console.error('Failed to fetch random profile picture:', error);
  }
}

// Function to display the profile picture from localStorage
function displayProfilePicture() {
  const savedImageUrl = localStorage.getItem('profilePictureUrl');
  if (savedImageUrl) {
    profilePicture.src = savedImageUrl;
    profilePicture.alt = "Profile Picture";
  } else {
    // Fetch a new random profile picture if none is saved
    fetchRandomProfilePicture();
  }
}

// Function to fetch and display a random anime picture and description
async function fetchRandomAnimePicture() {
  try {
    const response = await fetch('http://localhost:5002/random-anime');
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const data = await response.json();
    const imageUrl = data.image_url;
    const description = data.description;
    const title = data.title;

    // Log the URL and description for debugging
    console.log('Fetched random anime picture URL:', imageUrl);
    console.log('Fetched random anime description:', description);
    console.log('Fetched random anime title:', title);

    // Update the anime picture element
    animePicture.src = imageUrl;
    animePicture.alt = "Anime Picture";
    animeDescription.textContent = description;
    animeTitle.textContent = title;
    animeDescription.style.display = 'none';
    animeTitle.style.display = 'none';
  } catch (error) {
    console.error('Failed to fetch random anime picture:', error);
  }
}

// Function to fetch and display a random anime title
async function fetchRandomAnimeTitle() {
  try {
    const response = await fetch('http://localhost:5003/random-anime-title');
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const data = await response.json();
    animeTitleText.textContent = `${data.title} - ${data.episodes} episodes`;
  } catch (error) {
    console.error('Failed to fetch random anime title:', error);
  }
}

// Function to fetch and display a random anime quote
async function fetchRandomAnimeQuote() {
  try {
    const response = await fetch('http://localhost:5001/random-anime-quote');
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const data = await response.json();
    const quoteElement = document.getElementById('anime-quote');
    quoteElement.innerHTML = `"${data.quote}" - <strong>${data.character}</strong>, <em>${data.anime}</em>`;
  } catch (error) {
    console.error('Failed to fetch random anime quote:', error);
  }
}

// Function to handle logout
function logout() {
  // Clear local storage
  localStorage.clear();

  // Redirect to login page
  window.location.href = 'login.html';
}

// Event listeners for form submissions and button clicks
passwordForm.addEventListener('submit', updatePassword);
randomProfilePictureBtn.addEventListener('click', fetchRandomProfilePicture);
randomAnimePictureBtn.addEventListener('click', fetchRandomAnimePicture);
animePicture.addEventListener('click', () => {
  animeDescription.style.display = animeDescription.style.display === 'none' ? 'block' : 'none';
  animeTitle.style.display = animeTitle.style.display === 'none' ? 'block' : 'none';
});
randomAnimeTitleBtn.addEventListener('click', fetchRandomAnimeTitle);
logoutBtn.addEventListener('click', logout); // Assuming you add a logout button in your HTML

// Call the functions to display preferences and profile picture
displayPreferences();
displayProfilePicture();
fetchRandomAnimeQuote();
fetchRandomAnimePicture();
fetchRandomAnimeTitle();
