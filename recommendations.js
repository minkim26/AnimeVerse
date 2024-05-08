document.addEventListener('DOMContentLoaded', function() {
  const genres = JSON.parse(localStorage.getItem('preferredGenres')) || [];
  fetchAnimeByGenres(genres);
  fetchTrendingNow();
  fetchNewReleases();
  fetchRandomRecommendations();
});

function fetchAnimeByGenres(genres) {
  const container = document.getElementById('recommendationsContainer');
  container.innerHTML = '<p>Loading recommendations...</p>'; // Show loading message

  genres.forEach(genre => {
    fetch(`https://kitsu.io/api/edge/anime?filter[genres]=${encodeURIComponent(genre)}`)
      .then(response => response.json())
      .then(data => {
        displayAnimes(data, container);
      })
      .catch(error => {
        console.error('Error fetching anime:', error);
        container.innerHTML = '<p>Error loading recommendations. Please try again later.</p>';
      });
  });
}

function fetchTrendingNow() {
  const container = document.getElementById('trendingContainer');
  fetch(`https://kitsu.io/api/edge/trending/anime?limit=12`)
    .then(response => response.json())
    .then(data => displayAnimes(data, container))
    .catch(error => console.error('Error fetching trending anime:', error));
}

function fetchRandomRecommendations() {
  const container = document.getElementById('randomContainer');
  fetch(`https://kitsu.io/api/edge/anime?sort=-userCount&limit=50`) // Fetch a broad set of popular anime
    .then(response => response.json())
    .then(data => {
      const shuffled = data.data.sort(() => 0.5 - Math.random());
      displayAnimes({ data: shuffled.slice(0, 12) }, container); // Display 12 random anime
    })
    .catch(error => console.error('Error fetching random recommendations:', error));
}

function fetchNewReleases() {
  const container = document.getElementById('newReleasesContainer');
  fetch(`https://kitsu.io/api/edge/anime?filter[status]=current&sort=-updatedAt&limit=12`)
    .then(response => response.json())
    .then(data => displayAnimes(data, container))
    .catch(error => console.error('Error fetching new releases:', error));
}

function displayAnimes(data, container) {
  container.innerHTML = ''; // Clear previous content

  data.data.forEach(anime => {
    const div = document.createElement('div');
    div.className = 'anime-item';
    div.innerHTML = `
      <h3>${anime.attributes.titles.en || anime.attributes.titles.en_jp}</h3>
      <img src="${anime.attributes.posterImage.small}" alt="${anime.attributes.titles.en || anime.attributes.titles.en_jp}" style="cursor: pointer;">
      <p class="anime-synopsis" style="display: none;">${anime.attributes.synopsis}</p>
    `;
    container.appendChild(div);

    // Event listeners for toggling synopsis on click
    const title = div.querySelector('h3');
    const image = div.querySelector('img');
    const synopsis = div.querySelector('.anime-synopsis');
    [title, image].forEach(element => {
      element.addEventListener('click', () => {
        synopsis.style.display = synopsis.style.display === 'none' ? 'block' : 'none';
      });
    });
  });
}

