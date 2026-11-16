import { getStore } from '@netlify/blobs';

export const getReplies = () => getStore({ name: 'rael-respostas', consistency: 'strong' });
export const getSessions = () => getStore({ name: 'rael-sessoes', consistency: 'strong' });
export const getRate = () => getStore({ name: 'rael-limite-envios', consistency: 'strong' });
