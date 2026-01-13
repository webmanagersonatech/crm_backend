import { Router } from 'express';
import { dashboardData, getNewAndFollowupLeads } from './controller';
import { protect } from '../../middlewares/auth';
const router = Router();

router.get('/', protect, dashboardData);
router.get('/new-followup', protect, getNewAndFollowupLeads);

export default router;
