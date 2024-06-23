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

  const genreFilter = genres.map(genre => `filter[genres]=${encodeURIComponent(genre)}`).join('&');
  fetch(`https://kitsu.io/api/edge/anime?${genreFilter}&page[limit]=12`)
    .then(response => response.json())
    .then(data => {
      displayAnimes(data, container);
    })
    .catch(error => {
      console.error('Error fetching anime:', error);
      container.innerHTML = '<p>Error loading recommendations. Please try again later.</p>';
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
  container.innerHTML = '<p>Loading random recommendations...</p>'; // Show loading message

  let allAnime = [];
  let page = 0;
  const pageSize = 20;
  const totalCount = 100;

  function fetchPage() {
    page++;
    fetch(`https://kitsu.io/api/edge/anime?sort=-userCount&page[limit]=${pageSize}&page[offset]=${pageSize * (page - 1)}`)
      .then(response => response.json())
      .then(data => {
        allAnime = allAnime.concat(data.data);
        if (allAnime.length < totalCount) {
          fetchPage(); // Fetch next page
        } else {
          allAnime = allAnime.slice(0, totalCount); // Ensure only the top 200 are taken if extra are fetched
          displayRandomSelection(allAnime);
        }
      })
      .catch(error => {
        console.error('Error fetching anime:', error);
        container.innerHTML = '<p>Error loading random recommendations. Please try again later.</p>';
      });
  }

  function displayRandomSelection(animeList) {
    // Shuffle the data and select 12 random items
    const shuffled = animeList.sort(() => 0.5 - Math.random());
    const selectedAnimes = shuffled.slice(0, 12);

    container.innerHTML = ''; // Clear the loading message

    // Iterate through the selected random anime data and display each item
    selectedAnimes.forEach(anime => {
      const div = document.createElement('div');
      div.className = 'anime-item';
      div.innerHTML = `
        <h3>${anime.attributes.titles.en || anime.attributes.titles.en_jp}</h3>
        <img src="${anime.attributes.posterImage.small}" alt="${anime.attributes.titles.en || anime.attributes.titles.en_jp}" style="cursor: pointer;">
        <p class="anime-synopsis" style="display: none;">${anime.attributes.synopsis}</p>
      `;
      container.appendChild(div);

      // Add event listeners for toggling the synopsis on click
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

  fetchPage();
}



function fetchNewReleases() {
  const container = document.getElementById('newReleasesContainer');
  fetch(`https://kitsu.io/api/edge/anime?filter[status]=current&sort=-startDate&page[limit]=12`)
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