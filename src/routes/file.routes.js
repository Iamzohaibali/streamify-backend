import express from 'express';
import {
  uploadFiles,
  getUserFiles,
  deleteFile,
  deleteMultipleFiles,
} from '../controllers/file.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();

// All file routes are protected
router.use(protect);

router.post('/upload', upload.array('files', 10), uploadFiles);
router.get('/', getUserFiles);
router.delete('/bulk', deleteMultipleFiles);   // Must be before /:id
router.delete('/:id', deleteFile);

export default router;