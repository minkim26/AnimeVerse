const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express(); // Add this line to create an instance of Express
app.use(cors());
app.use(bodyParser.json());

// Dummy user data (replace with actual database)
const users = [];

// Dummy user preferences data (replace with actual database)
const userPreferences = {};

// Dummy user watchlist data (replace with actual database)
const userWatchlists = {};

// Dummy user reviews data (replace with actual database)
const userReviews = {};

// Secret key for JWT
const secretKey = 'your-secret-key';

// Login route
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  // Find the user by email
  const user = users.find(user => user.email === email);

  if (user && bcrypt.compareSync(password, user.password)) {
    // Generate a JWT token
    const token = jwt.sign({ userId: user.id }, secretKey);
    res.json({ success: true, token });
  } else {
    res.json({ success: false, message: 'Invalid email or password' });
  }
});

// Signup route
app.post('/api/signup', (req, res) => {
  const { email, password } = req.body;

  // Check if user already exists
  const existingUser = users.find(user => user.email === email);

  if (existingUser) {
    res.json({ success: false, message: 'User already exists' });
  } else {
    // Hash the password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Create a new user
    const newUser = {
      id: users.length + 1,
      email,
      password: hashedPassword
    };

    users.push(newUser);
    res.json({ success: true, message: 'Signup successful' });
  }
});

// Update password route
app.post('/api/updatePassword', (req, res) => {
  const { email, oldPassword, newPassword } = req.body;

  // Find the user by email
  const user = users.find(user => user.email === email);

  if (!user) {
    return res.status(400).json({ success: false, message: 'User not found' });
  }

  // Check if the old password is correct
  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(400).json({ success: false, message: 'Old password is incorrect' });
  }

  // Hash the new password
  const hashedNewPassword = bcrypt.hashSync(newPassword, 10);

  // Update the user's password
  user.password = hashedNewPassword;

  res.json({ success: true, message: 'Password updated successfully' });
});

// Update username route
app.post('/api/updateUsername', (req, res) => {
  const { email, newUsername } = req.body;

  // Find the user by email
  const user = users.find(user => user.email === email);

  if (!user) {
    return res.status(400).json({ success: false, message: 'User not found' });
  }

  // Update the user's username
  user.username = newUsername;

  res.json({ success: true, message: 'Username updated successfully' });
});

// Get user preferences
app.get('/api/preferences/:email', (req, res) => {
  const email = req.params.email;
  const preferences = userPreferences[email] || [];
  res.json({ success: true, preferences });
});

// Update user preferences
app.post('/api/preferences', (req, res) => {
  const { email, preferences } = req.body;

  // Update user preferences
  userPreferences[email] = preferences;
  res.json({ success: true, message: 'Preferences updated successfully' });
});

// Get user watchlist
app.get('/api/watchlist/:email', (req, res) => {
  const email = req.params.email;
  const watchlist = userWatchlists[email] || [];
  res.json({ success: true, watchlist });
});

// Update user watchlist
app.post('/api/watchlist', (req, res) => {
  const { email, watchlist } = req.body;

  // Update user watchlist
  userWatchlists[email] = watchlist;
  res.json({ success: true, message: 'Watchlist updated successfully' });
});

// Get user reviews
app.get('/api/reviews/:email', (req, res) => {
  const email = req.params.email;
  const reviews = userReviews[email] || [];
  res.json({ success: true, reviews });
});

// Add a user review
app.post('/api/reviews', (req, res) => {
  const { email, animeId, review } = req.body;

  if (!userReviews[email]) {
    userReviews[email] = [];
  }

  // Add the new review
  userReviews[email].push({ animeId, review });
  res.json({ success: true, message: 'Review added successfully' });
});

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
