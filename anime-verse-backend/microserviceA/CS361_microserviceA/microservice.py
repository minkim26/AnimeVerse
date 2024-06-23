from flask import Flask, jsonify, send_from_directory, request
import os
import random
from flask_cors import CORS

# Create an instance of the Flask class
app = Flask(__name__)
# Enable Cross-Origin Resource Sharing (CORS) for the Flask app
CORS(app)

# Path to the configuration file
CONFIG_PATH = 'config.txt'

# Function to read the image directory path from the configuration file
def get_image_directory():
    with open(CONFIG_PATH, 'r') as file:
        config_lines = file.readlines()
    # Convert configuration lines into a dictionary
    config = dict(line.strip().split('=') for line in config_lines)
    # Return the image directory path, default to 'images' if not found
    return config.get('image_directory', 'images')

# Define a route to return a random profile image URL
@app.route('/random-profile-image', methods=['GET'])
def random_profile_image():
    image_directory = get_image_directory()
    # Get a list of all files in the image directory
    images = [f for f in os.listdir(image_directory) if os.path.isfile(os.path.join(image_directory, f))]
    if not images:
        # Return an error if no images are found
        return jsonify({"error": "No images found"}), 404
    # Select a random image from the list
    image_filename = random.choice(images)
    # Construct the image URL
    image_url = request.host_url + 'images/' + image_filename
    # Log the image URL for debugging
    print('Generated image URL:', image_url)
    # Return the image URL as JSON
    return jsonify({"image_url": image_url})

# Define a route to serve images from the image directory
@app.route('/images/<filename>')
def get_image(filename):
    image_directory = get_image_directory()
    # Send the requested image file from the image directory
    return send_from_directory(image_directory, filename)

# Run the app on host 0.0.0.0 and port 5000 when the script is executed
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
