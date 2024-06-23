from flask import Flask, jsonify
import random
import requests
from flask_cors import CORS

# Create an instance of the Flask class
app = Flask(__name__)
# Enable Cross-Origin Resource Sharing (CORS) for the Flask app
CORS(app)

# Kitsu API endpoint for anime
KITSU_API_URL = "https://kitsu.io/api/edge/anime"
cache = []

# Function to fetch a random anime from Kitsu API
def fetch_random_anime():
    global cache
    if not cache:
        for i in range(1, 6):  # Fetching 5 pages to get a wider range of anime
            response = requests.get(KITSU_API_URL, params={"page[limit]": 20, "page[offset]": (i-1) * 20})
            data = response.json()
            cache.extend(data["data"])
    random_anime = random.choice(cache)
    return {
        "title": random_anime["attributes"]["titles"]["en"] if random_anime["attributes"]["titles"]["en"] else random_anime["attributes"]["titles"]["en_jp"],
        "image_url": random_anime["attributes"]["posterImage"]["medium"],
        "description": random_anime["attributes"]["synopsis"]
    }

# Define a route to return a random anime picture URL and description
@app.route('/random-anime', methods=['GET'])
def random_anime():
    anime = fetch_random_anime()
    return jsonify(anime)

# Run the app on host 0.0.0.0 and port 5002 when the script is executed
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)
