import { handleGiftCounts } from '../lib/invite.mjs';
import { getReplies } from '../lib/stores.mjs';

export const config = { path: '/api/gifts' };
export default (request) => handleGiftCounts(request, getReplies);
