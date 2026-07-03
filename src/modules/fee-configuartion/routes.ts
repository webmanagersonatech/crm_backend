import { Router } from 'express';
import {
  upsertFeeConfiguration,
  getFeeConfigurationByInstitute,
  deleteFeeConfiguration,
  getFeeConfigurationByStudent,
  
} from './controller';
import { studentProtect } from '../../middlewares/studentAuth';
import { protect } from '../../middlewares/auth';

const router = Router();

router.post('/', protect, upsertFeeConfiguration);


router.get('/student', studentProtect, getFeeConfigurationByStudent);
router.get('/:instituteId', protect, getFeeConfigurationByInstitute);

router.delete('/:instituteId', protect, deleteFeeConfiguration);

export default router;