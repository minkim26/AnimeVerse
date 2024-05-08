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

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});