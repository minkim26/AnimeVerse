// Function to fetch recommended animes
function fetchRecommendedAnimes() {
    fetch('http://api.example.com/animes/recommended')
      .then(response => response.json())
      .then(data => {
        // Process the response data and update the DOM
        const animeList = document.getElementById('anime-list');
        data.forEach(anime => {
          const li = document.createElement('li');
          li.textContent = anime.title;
          animeList.appendChild(li);
        });
      })
      .catch(error => {
        console.log('Error:', error);
      });
  }
  
  // Call the function when the page loads
  window.addEventListener('load', fetchRecommendedAnimes);