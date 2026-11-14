const express = require('express');
const router = express.Router();
const { createUser, getUserByEmail } = require('../db/database');
const { hashPassword, comparePassword, generateToken, authenticateUser } = require('../utils/security');

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }

    const existing = getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email sudah terdaftar. Silakan login.' });
    }

    const passwordHash = await hashPassword(password);
    const user = createUser(email, passwordHash);
    const token = generateToken({ id: user.id, email: user.email });

    res.status(201).json({
      message: 'Registrasi berhasil',
      user: { id: user.id, email: user.email },
      token
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server saat registrasi' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const token = generateToken({ id: user.id, email: user.email });

    res.json({
      message: 'Login berhasil',
      user: { id: user.id, email: user.email },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server saat login' });
  }
});

// Current User Profile
router.get('/me', authenticateUser, (req, res) => {
  res.json({
    user: req.user
  });
});

module.exports = router;
