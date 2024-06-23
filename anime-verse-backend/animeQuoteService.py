from flask import Flask, jsonify
import random
from flask_cors import CORS

# Create an instance of the Flask class
app = Flask(__name__)
# Enable Cross-Origin Resource Sharing (CORS) for the Flask app
CORS(app)

# List of anime quotes with the quote, character, and anime
anime_quotes = [
    {"quote": "I'll take a potato chip... and eat it!", "character": "Light Yagami", "anime": "Death Note"},
    {"quote": "I'm not a hero because I want your approval. I do it because I want to!", "character": "Izuku Midoriya", "anime": "My Hero Academia"},
    {"quote": "People die when they are killed.", "character": "Shirou Emiya", "anime": "Fate/stay night"},
    {"quote": "The only ones who should kill are those who are prepared to be killed.", "character": "Lelouch Lamperouge", "anime": "Code Geass"},
    {"quote": "I am gonna be the Pirate King!", "character": "Monkey D. Luffy", "anime": "One Piece"},
    {"quote": "In our society, letting others find out that you're a nice person is a very risky move. It's extremely likely that someone would take advantage of that.", "character": "Hitagi Senjougahara", "anime": "Bakemonogatari"},
    {"quote": "A lesson without pain is meaningless. For you cannot gain something without sacrificing something else in return.", "character": "Edward Elric", "anime": "Fullmetal Alchemist: Brotherhood"},
    {"quote": "Even if I can't see you... Even if we are separated far apart from each other... I'll always be watching you. I'll definitely watch over you forever.", "character": "Makarov Dreyar", "anime": "Fairy Tail"},
    {"quote": "If you don’t take risks, you can’t create a future!", "character": "Monkey D. Luffy", "anime": "One Piece"},
    {"quote": "If you don’t share someone’s pain, you can never understand them.", "character": "Nagato", "anime": "Naruto Shippuden"},
    {"quote": "I want to be the very best, like no one ever was.", "character": "Ash Ketchum", "anime": "Pokémon"},
    {"quote": "You can’t sit around envying other people’s worlds. You have to go out and change your own.", "character": "Rika Furude", "anime": "Higurashi: When They Cry"},
    {"quote": "The moment you think of giving up, think of the reason why you held on so long.", "character": "Natsu Dragneel", "anime": "Fairy Tail"},
    {"quote": "It’s not the face that makes someone a monster; it’s the choices they make with their lives.", "character": "Naruto Uzumaki", "anime": "Naruto"},
    {"quote": "If you win, you live. If you lose, you die. If you don’t fight, you can’t win!", "character": "Eren Yeager", "anime": "Attack on Titan"},
    {"quote": "Fear is not evil. It tells you what your weakness is. And once you know your weakness, you can become stronger as well as kinder.", "character": "Gildarts Clive", "anime": "Fairy Tail"},
    {"quote": "No matter how deep the night, it always turns to day, eventually.", "character": "Brook", "anime": "One Piece"},
    {"quote": "It’s more important to master the cards you’re holding than to complain about the ones your opponent was dealt.", "character": "Grimsley", "anime": "Pokémon"},
    {"quote": "Whatever you lose, you’ll find it again. But what you throw away you’ll never get back.", "character": "Himura Kenshin", "anime": "Rurouni Kenshin"},
    {"quote": "A person is very strong when he seeks to protect something.", "character": "Haku", "anime": "Naruto"},
    {"quote": "If you can’t do something, then don’t. Focus on what you can do.", "character": "Shiroe", "anime": "Log Horizon"},
    {"quote": "We are all like fireworks: we climb, we shine and always go our separate ways and become further apart. But even if that time comes, let’s not disappear like a firework, and continue to shine... forever.", "character": "Hitsugaya Toshiro", "anime": "Bleach"},
    {"quote": "If you have time to think of a beautiful end, then live beautifully until the end.", "character": "Gintoki Sakata", "anime": "Gintama"},
    {"quote": "Giving up is what kills people.", "character": "Alucard", "anime": "Hellsing"},
    {"quote": "The ticket to the future is always open.", "character": "Vash the Stampede", "anime": "Trigun"},
    {"quote": "Hard work betrays none, but dreams betray many.", "character": "Hachiman Hikigaya", "anime": "Oregairu"},
    {"quote": "The world isn’t perfect. But it’s there for us, doing the best it can. And that’s what makes it so damn beautiful.", "character": "Roy Mustang", "anime": "Fullmetal Alchemist"},
    {"quote": "Life is not a game of luck. If you wanna win, work hard.", "character": "Sora", "anime": "No Game No Life"},
    {"quote": "Whatever happens, happens.", "character": "Spike Spiegel", "anime": "Cowboy Bebop"},
    {"quote": "The only thing we’re allowed to do is to believe that we won’t regret the choice we made.", "character": "Levi Ackerman", "anime": "Attack on Titan"},
    {"quote": "If you don’t share someone’s pain, you can never understand them.", "character": "Nagato", "anime": "Naruto"},
    {"quote": "When you give up, that’s when the game ends.", "character": "Mitsuyoshi Anzai", "anime": "Slam Dunk"},
    {"quote": "A real sin is something you can never atone for.", "character": "Ban", "anime": "Seven Deadly Sins"},
    {"quote": "Power comes in response to a need, not a desire. You have to create that need.", "character": "Goku", "anime": "Dragon Ball Z"},
    {"quote": "No matter how hard or impossible it is, never lose sight of your goal.", "character": "Monkey D. Luffy", "anime": "One Piece"},
    {"quote": "If you don’t take risks, you can’t create a future!", "character": "Monkey D. Luffy", "anime": "One Piece"},
    {"quote": "It’s not the face that makes someone a monster; it’s the choices they make with their lives.", "character": "Naruto Uzumaki", "anime": "Naruto"},
    {"quote": "If you win, you live. If you lose, you die. If you don’t fight, you can’t win!", "character": "Eren Yeager", "anime": "Attack on Titan"},
    {"quote": "Fear is not evil. It tells you what your weakness is. And once you know your weakness, you can become stronger as well as kinder.", "character": "Gildarts Clive", "anime": "Fairy Tail"},
    {"quote": "No matter how deep the night, it always turns to day, eventually.", "character": "Brook", "anime": "One Piece"},
    {"quote": "It’s more important to master the cards you’re holding than to complain about the ones your opponent was dealt.", "character": "Grimsley", "anime": "Pokémon"},
    {"quote": "Whatever you lose, you’ll find it again. But what you throw away you’ll never get back.", "character": "Himura Kenshin", "anime": "Rurouni Kenshin"},
    {"quote": "A person is very strong when he seeks to protect something.", "character": "Haku", "anime": "Naruto"},
    {"quote": "If you can’t do something, then don’t. Focus on what you can do.", "character": "Shiroe", "anime": "Log Horizon"},
    {"quote": "We are all like fireworks: we climb, we shine and always go our separate ways and become further apart. But even if that time comes, let’s not disappear like a firework, and continue to shine... forever.", "character": "Hitsugaya Toshiro", "anime": "Bleach"},
    {"quote": "If you have time to think of a beautiful end, then live beautifully until the end.", "character": "Gintoki Sakata", "anime": "Gintama"},
    {"quote": "Giving up is what kills people.", "character": "Alucard", "anime": "Hellsing"}
]

# Define a route to return a random anime quote
@app.route('/random-anime-quote', methods=['GET'])
def random_anime_quote():
    quote = random.choice(anime_quotes)
    return jsonify(quote)

# Run the app on host 0.0.0.0 and port 5001 when the script is executed
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
