const express = require('express');
const router = express.Router();
const { createUser, getUserByEmail, getDeviceByUserId, updateDeviceStatus, deleteAllUserData } = require('../db/database');
const { hashPassword, comparePassword, generateToken, authenticateUser } = require('../utils/security');
const { validateEmail, validatePassword } = require('../utils/validators');

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Format email tidak valid' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password minimal 8 karakter dan maksimal 72 byte' });
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

// Logout (P2-8: Set status perangkat offline di server)
router.post('/logout', authenticateUser, (req, res) => {
  try {
    const dev = getDeviceByUserId(req.user.id);
    if (dev) {
      updateDeviceStatus(dev.id, false);
    }
    res.json({ message: 'Logout berhasil, perangkat ditandai offline' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Gagal melakukan logout' });
  }
});

// Current User Profile
router.get('/me', authenticateUser, (req, res) => {
  res.json({
    user: req.user
  });
});

// P3-4: Endpoint "Hapus Semua Data Saya" (Penghapusan Akun & Jejak Permanen)
router.delete('/me/data', authenticateUser, (req, res) => {
  try {
    deleteAllUserData(req.user.id);
    res.json({
      success: true,
      message: 'Seluruh akun, perangkat, tempat favorit, dan riwayat lokasi Anda telah dihapus permanen.'
    });
  } catch (err) {
    console.error('Delete user data error:', err);
    res.status(500).json({ error: 'Gagal menghapus data pengguna' });
  }
});

module.exports = router;
