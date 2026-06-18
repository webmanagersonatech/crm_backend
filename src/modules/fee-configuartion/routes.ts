import { Router } from 'express';
import {
  upsertFeeConfiguration,
  getFeeConfigurationByInstitute,
  deleteFeeConfiguration,
} from './controller';

import { protect } from '../../middlewares/auth';

const router = Router();

router.post('/', protect, upsertFeeConfiguration);

router.get('/:instituteId', protect, getFeeConfigurationByInstitute);

router.delete('/:instituteId', protect, deleteFeeConfiguration);

export default router;