import { Router } from 'express';
import { createLead, listLeads, getLead, updateLead, deleteLead, createLeadfromonline } from './controller';
import { protect } from '../../middlewares/auth';

const router = Router();

router.get('/', protect, listLeads);
router.post('/', protect, createLead);
router.post('/enquiry', createLeadfromonline);
router.get('/:id', protect, getLead);
router.put('/:id', protect, updateLead);
router.delete('/:id', protect, deleteLead);

export default router;
