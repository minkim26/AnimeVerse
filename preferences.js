// Get the preferences form element
const preferencesForm = document.getElementById('preferencesForm');

// Add event listener to the form submission
preferencesForm.addEventListener('submit', function(event) {
    event.preventDefault(); // Prevent form from submitting

    // Show confirmation pop-up
    const confirmUpdate = confirm("Are you sure you want to update your preferences? This action will change the recommendations you receive.");

    if (confirmUpdate) {
        // Get the selected genres
        const selectedGenres = Array.from(document.querySelectorAll('input[name="genres"]:checked')).map(checkbox => checkbox.value);

        // Save genres to localStorage
        localStorage.setItem('preferredGenres', JSON.stringify(selectedGenres));

        // Redirect to recommendations page
        window.location.href = 'recommendations.html';
    }
});