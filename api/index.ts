import { handleApiRequest } from './_handlers.js';

/**
 * Primary Vercel Serverless Function Entry Point.
 * Dispatches all API requests through the consolidated handler.
 */
export default async function handler(req: any, res: any) {
  try {
    return await handleApiRequest(req, res);
  } catch (err: any) {
    console.error('[Vercel API Index Error]:', err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Internal server error in API handler.',
    });
  }
}

