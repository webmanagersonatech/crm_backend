import { Router } from 'express';
import { createLead, listLeads, createThirdPartyLead,getLeadsByPhoneSimple,verifyFacebookWebhook,getPhoneMatchedLeads,getMediumSources,receiveFacebookWebhook, getLead, exportFollowups,markAsNonDuplicate, updateLead, deleteLead, exportLeads, listOnlyFollowups, getduplicateLeads, createLeadfromonline, uploadMiddleware } from './controller';
import { protect } from '../../middlewares/auth';
import { thirdPartyAuth } from '../../middlewares/thirdpartyAuth';

const router = Router();

router.get('/export', protect, exportLeads);
// router.post("/bulk-upload", protect, uploadMiddleware, bulkUploadLeads);
// router.post('/update-program-ids', updateProgramIdsForOldLeads);
router.get('/', protect, listLeads);

router.get('/medium-sources', protect, getMediumSources); 
router.get('/duplicates', protect, getduplicateLeads);
router.get("/facebook/webhook", verifyFacebookWebhook);
router.get('/phone-matched', protect, getPhoneMatchedLeads);
router.get('/match-by-phone-simple', protect, getLeadsByPhoneSimple);
router.post("/facebook/webhook", receiveFacebookWebhook);
router.patch('/:id/non-duplicate', protect, markAsNonDuplicate);
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
