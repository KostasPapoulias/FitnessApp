/**
 * Route sentinel for a chat that hasn't been persisted yet.
 * `/ai/chat/new` renders the compose screen; the real thread id replaces it
 * in the URL once the first message comes back from the server.
 */
export const NEW_THREAD = 'new'
