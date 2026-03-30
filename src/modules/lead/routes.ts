import { Router } from 'express';
import { createLead, listLeads, createThirdPartyLead, getLead,exportFollowups, updateLead, deleteLead, exportLeads, listOnlyFollowups, getduplicateLeads, createLeadfromonline, uploadMiddleware } from './controller';
import { protect } from '../../middlewares/auth';
import { thirdPartyAuth } from '../../middlewares/thirdpartyAuth';

const router = Router();

router.get('/export', protect, exportLeads);
// router.post("/bulk-upload", protect, uploadMiddleware, bulkUploadLeads);
router.get('/', protect, listLeads);
router.get('/duplicates', protect, getduplicateLeads);
router.get('/followupsreport', protect, listOnlyFollowups);
router.get('/export-followups', protect, exportFollowups);
router.post('/', protect, createLead);
router.post(
    "/third-party",
    thirdPartyAuth,
    createThirdPartyLead
);
router.post('/enquiry', createLeadfromonline);
router.get('/:id', protect, getLead);
router.put('/:id', protect, updateLead);
router.delete('/:id', protect, deleteLead);


export default router;
