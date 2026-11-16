import { handleAdmin } from '../lib/invite.mjs';
import { getReplies, getSessions } from '../lib/stores.mjs';

export const config = { path: '/api/admin/:action' };
export default (request, context) => handleAdmin(request, context.params.action, {
  getReplies,
  getSessions,
  password: process.env.ADMIN_PASSWORD
});
