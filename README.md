# CS361_microserviceA


# Random Profile Image Microservice

## Overview
This microservice provides a random profile image when a user creates an account. It serves an HTTP request that returns the URL of a randomly selected image from a specified directory.

## Installation Process

### Prerequisites
- Python 3.x
- `pip` (Python package installer)

### Install Dependencies:
pip install -r requirements.txt

### Setup Configuration:
Ensure your config.txt file is correctly set up in the root directory. AKA make sure that the images directory has the proper images for the profile pictures. 
  
## Usuage

### How it Works
The microservice has two main endpoints:

Get a Random Profile Image URL:

- Endpoint: /random-profile-image

- Method: GET

- Response: JSON object containing the URL of a randomly selected image.

Serve Images:

- Endpoint: /images/<filename>

- Method: GET

- Response: Serves the requested image file.

### Example Usuage
Using the Fetch API in JavaScript:

<pre>
        async function createAccount() {
            try {
                const response = await fetch('http://localhost:5000/random-profile-image');
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                const data = await response.json();
                const profileImage = document.getElementById('profile-picture');
                profileImage.src = data.image_url;
                profileImage.alt = "Profile Picture";
            } catch (error) {
                console.error('Failed to fetch random profile image:', error);
            }
        }
</pre>


## Running the Microservice / Starting the Sevrver:
<pre>
python3 microservice.py
</pre>

Replace the config file's image directory path or replace the current images in the images folder with your desired profile pictures before running. 

## UML Sequence Diagram: 

![Screenshot 2024-05-21 234552](https://github.com/minkim26/CS361_microserviceA/assets/130433401/0bed6309-ba4f-427b-91b1-a3be80002109)

