import { Router } from 'express';
import { createLead, listLeads, getLead, updateLead, deleteLead, exportLeads, getduplicateLeads, createLeadfromonline, bulkUploadLeads, uploadMiddleware } from './controller';
import { protect } from '../../middlewares/auth';

const router = Router();

router.get('/export', protect, exportLeads);
router.post("/bulk-upload", protect, uploadMiddleware, bulkUploadLeads);
router.get('/', protect, listLeads);
router.get('/duplicates', protect, getduplicateLeads);
router.post('/', protect, createLead);
router.post('/enquiry', createLeadfromonline);
router.get('/:id', protect, getLead);
router.put('/:id', protect, updateLead);
router.delete('/:id', protect, deleteLead);


export default router;
