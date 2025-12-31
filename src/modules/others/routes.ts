import { Router } from 'express';
import {
  importOthers,
  createOther,
  listOthers,
  getOther,
  updateOther,
  deleteOther
} from './controller';
import { protect } from '../../middlewares/auth';
import multer from 'multer';

const router = Router();

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// CRUD
router.get('/', protect, listOthers);
router.post('/', protect, createOther);
router.get('/:id', protect, getOther);
router.put('/:id', protect, updateOther);
router.delete('/:id', protect, deleteOther);

// CSV import
router.post('/import', protect, upload.single('file'), importOthers);

export default router;
