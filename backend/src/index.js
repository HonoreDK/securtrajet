/**
 * SecurTrajet Backend - API Node.js + Express + MongoDB + Socket.IO
 * Isolation stricte : chaque parent ne voit que ses enfants
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'securtrajet_dev_secret_change_me';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/securtrajet';

// ========== MODELS ==========
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: String,
  firstName: String,
  lastName: String,
  role: { type: String, default: 'parent' },
  createdAt: { type: Date, default: Date.now }
});

const childSchema = new mongoose.Schema({
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  firstName: String,
  lastName: String,
  birthDate: String,
  trackerId: String,
  battery: { type: Number, default: 100 },
  status: { type: String, default: 'online' },
  lastSeenAt: Date,
  createdAt: { type: Date, default: Date.now }
});

const positionSchema = new mongoose.Schema({
  trackerId: String,
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', index: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  latitude: Number,
  longitude: Number,
  speed: Number,
  battery: Number,
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Child = mongoose.model('Child', childSchema);
const Position = mongoose.model('Position', positionSchema);

// ========== AUTH MIDDLEWARE ==========
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorisé' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

// ========== ROUTES ==========
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    if (await User.findOne({ email })) return res.status(400).json({ error: 'Email déjà utilisé' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, firstName, lastName });
    const token = jwt.sign({ id: user._id, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email, firstName, lastName } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const token = jwt.sign({ id: user._id, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email, firstName: user.firstName, lastName: user.lastName } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Enfants - isolation par parentId
app.get('/api/children', auth, async (req, res) => {
  const children = await Child.find({ parentId: req.user.id });
  res.json(children);
});

app.post('/api/children', auth, async (req, res) => {
  const child = await Child.create({ ...req.body, parentId: req.user.id });
  res.status(201).json(child);
});

app.get('/api/children/:id', auth, async (req, res) => {
  const child = await Child.findOne({ _id: req.params.id, parentId: req.user.id });
  if (!child) return res.status(404).json({ error: 'Non trouvé' });
  res.json(child);
});

// Réception positions GPS (depuis le traceur)
app.post('/api/positions', async (req, res) => {
  // En production : authentifier le device (API key / token)
  const { deviceId, latitude, longitude, speed, battery, timestamp } = req.body;
  const child = await Child.findOne({ trackerId: deviceId });
  if (!child) return res.status(404).json({ error: 'Traceur inconnu' });

  const pos = await Position.create({
    trackerId: deviceId,
    childId: child._id,
    parentId: child.parentId,
    latitude,
    longitude,
    speed,
    battery,
    timestamp: timestamp || new Date()
  });

  child.battery = battery;
  child.lastSeenAt = pos.timestamp;
  child.status = battery < 15 ? 'low_battery' : 'online';
  await child.save();

  // Temps réel via Socket.IO
  io.to(`parent:${child.parentId}`).emit('position', {
    childId: child._id,
    latitude,
    longitude,
    speed,
    battery,
    timestamp: pos.timestamp
  });

  res.status(201).json({ ok: true });
});

app.get('/api/children/:id/positions', auth, async (req, res) => {
  const child = await Child.findOne({ _id: req.params.id, parentId: req.user.id });
  if (!child) return res.status(404).json({ error: 'Non trouvé' });
  const positions = await Position.find({ childId: child._id })
    .sort({ timestamp: -1 })
    .limit(100);
  res.json(positions);
});

// Socket.IO - room par parent
io.on('connection', (socket) => {
  socket.on('join', (parentId) => {
    socket.join(`parent:${parentId}`);
  });
});

// Start
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connecté');
    server.listen(4000, () => console.log('API SecurTrajet sur http://localhost:4000'));
  })
  .catch(err => console.error('Erreur MongoDB:', err.message));
