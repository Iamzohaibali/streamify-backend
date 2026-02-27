import express from 'express';
import {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  deleteAccount,
  changePassword,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/update-profile', protect, upload.single('avatar'), updateProfile);
router.put('/change-password', protect, changePassword);
router.delete('/delete-account', protect, deleteAccount);

export default router;