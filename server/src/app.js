const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');

const app = express();

const allowedOrigins = ['http://localhost:5173', 'http://localhost:5173/', 'http://localhost:5000'];
app.use(cors({
  origin: true, // Allow all origins for testing
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static('public')); 

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Metaverse Server is running' });
});

module.exports = app; 