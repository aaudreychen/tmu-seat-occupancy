const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors()); 
app.use(express.json());

const mongoURI = 'mongodb+srv://audreychen:peanuts@occupancydata.ie1evjc.mongodb.net/OccupancyData?retryWrites=true&w=majority';

mongoose.connect(mongoURI)
  .then(() => console.log('SUCCESS: Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB Connection Error:', err.message));

const SeatSchema = new mongoose.Schema({
  room_id: String,
  occupied: Number
});

const Seat = mongoose.model('Seat', SeatSchema, 'OccupancyInfo');

app.get('/api/seats', async (req, res) => {
  try {
    const seats = await Seat.find();
    res.json(seats);
  } catch (error) {
    res.status(500).json({ message: "Error fetching seats" });
  }
});

app.listen(5000, () => console.log('Backend running on port 5000'));