import { Router } from 'express';
import {
  upsertAdditionalFeeConfiguration,
  getAdditionalFeeConfigurationByInstitute,
  deleteAdditionalFeeConfiguration,
  getAdditionalFeeConfigurationByStudent,
  getAdditionalFeeConfigurationByAdmin
} from './controller';
import { studentProtect } from '../../middlewares/studentAuth';
import { protect } from '../../middlewares/auth';

const router = Router();

// Create or update additional fee configuration (admin only)
router.post('/', protect, upsertAdditionalFeeConfiguration);

// Get additional fee configuration for student (student only)
router.get('/student', studentProtect, getAdditionalFeeConfigurationByStudent);

// Get additional fee configuration for admin by student ID (admin only)
router.get('/admin/:studentId', protect, getAdditionalFeeConfigurationByAdmin);

// Get additional fee configuration by institute ID (admin only)
router.get('/:instituteId', protect, getAdditionalFeeConfigurationByInstitute);

// Delete additional fee configuration by institute ID (admin only)
router.delete('/:instituteId', protect, deleteAdditionalFeeConfiguration);

export default router;