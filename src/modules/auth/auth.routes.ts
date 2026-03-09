import { Router } from 'express';
import {
    register, login, listUsers, listallUsers, updateUser,
    deleteUser, changePasswordwithotpverfiedperson, changePassword, toggleTempAdminAccess, getTempAdminAccess
} from './auth.controller';
import { protect } from '../../middlewares/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get("/users", protect, listUsers);
router.get("/list-all", protect, listallUsers);
router.get("/temp-access", protect, getTempAdminAccess);
router.put("/:id", protect, updateUser);
router.delete("/:id", protect, deleteUser);
router.patch("/:id/temp-admin", protect, toggleTempAdminAccess);

router.post("/changenewpasswordvialogin", protect, changePassword);
router.post("/changenewpassword", changePasswordwithotpverfiedperson);


export default router;
