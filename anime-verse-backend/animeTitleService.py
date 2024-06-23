from flask import Flask, jsonify
import random
from flask_cors import CORS

# Create an instance of the Flask class
app = Flask(__name__)
# Enable Cross-Origin Resource Sharing (CORS) for the Flask app
CORS(app)

# List of anime titles and their episodes
anime_titles = [
    {"title": "Naruto", "episodes": 220},
    {"title": "Naruto Shippuden", "episodes": 500},
    {"title": "One Piece", "episodes": 1000},
    {"title": "Attack on Titan", "episodes": 75},
    {"title": "My Hero Academia", "episodes": 88},
    {"title": "Demon Slayer", "episodes": 26},
    {"title": "Death Note", "episodes": 37},
    {"title": "Fullmetal Alchemist: Brotherhood", "episodes": 64},
    {"title": "Sword Art Online", "episodes": 25},
    {"title": "Tokyo Ghoul", "episodes": 12},
    {"title": "Hunter x Hunter", "episodes": 148},
    {"title": "Bleach", "episodes": 366},
    {"title": "Dragon Ball Z", "episodes": 291},
    {"title": "Fairy Tail", "episodes": 328},
    {"title": "Black Clover", "episodes": 170},
    {"title": "Neon Genesis Evangelion", "episodes": 26},
    {"title": "Cowboy Bebop", "episodes": 26},
    {"title": "Steins;Gate", "episodes": 24},
    {"title": "Code Geass", "episodes": 25},
    {"title": "Re:Zero", "episodes": 25},
    {"title": "Toradora!", "episodes": 25},
    {"title": "Clannad", "episodes": 23},
    {"title": "One Punch Man", "episodes": 12},
    {"title": "Mob Psycho 100", "episodes": 12},
    {"title": "Jujutsu Kaisen", "episodes": 24},
    {"title": "Blue Exorcist", "episodes": 25},
    {"title": "Haikyuu!!", "episodes": 25},
    {"title": "Kuroko's Basketball", "episodes": 25},
    {"title": "Yuri on Ice", "episodes": 12},
    {"title": "Violet Evergarden", "episodes": 13},
    {"title": "Your Lie in April", "episodes": 22},
    {"title": "Paranoia Agent", "episodes": 13},
    {"title": "Fruits Basket", "episodes": 63},
    {"title": "Ouran High School Host Club", "episodes": 26},
    {"title": "Anohana: The Flower We Saw That Day", "episodes": 11},
    {"title": "Erased", "episodes": 12},
    {"title": "The Promised Neverland", "episodes": 12},
    {"title": "Dr. Stone", "episodes": 24},
    {"title": "Fire Force", "episodes": 24},
    {"title": "D.Gray-man", "episodes": 103},
    {"title": "Soul Eater", "episodes": 51},
    {"title": "Neon Genesis Evangelion", "episodes": 26},
    {"title": "Rurouni Kenshin", "episodes": 95},
    {"title": "Samurai Champloo", "episodes": 26},
    {"title": "Gurren Lagann", "episodes": 27},
    {"title": "FLCL", "episodes": 6},
    {"title": "Akame ga Kill!", "episodes": 24},
    {"title": "Gintama", "episodes": 367}
]

# Define a route to return a random anime title
@app.route('/random-anime-title', methods=['GET'])
def random_anime_title():
    anime = random.choice(anime_titles)
    return jsonify(anime)

# Run the app on host 0.0.0.0 and port 5003 when the script is executed
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5003)
