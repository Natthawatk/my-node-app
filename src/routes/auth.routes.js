import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { limitLogin } from '../middleware/rateLimit.js';
import {
  register, login, logout, me, changePassword, check
} from '../controllers/auth.controller.js';

const router = Router();

const registerShape = {
  phone:    { required: true, type: 'string' },
  password: { required: true, type: 'string' },
  name:     { required: true, type: 'string' },
  role:     { required: false, type: 'string' }
};

const loginShape = {
  phone: { required: true, type: 'string' },
  password: { required: true, type: 'string' },
};

const changePassShape = {
  currentPassword: { required: true, type: 'string' },
  newPassword:     { required: true, type: 'string' },
};

router.post('/register', validate(registerShape), register);
router.post('/login', limitLogin, validate(loginShape), login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);
router.patch('/password', requireAuth, validate(changePassShape), changePassword);
router.get('/check', check);

export default router;