import { handleRsvp } from '../lib/invite.mjs';
import { getRate, getReplies } from '../lib/stores.mjs';

export const config = { path: '/api/rsvp' };
export default (request, context) => handleRsvp(request, getReplies, { getRate, ip: context?.ip });
