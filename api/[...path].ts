import { handleApiRequest } from './_handlers.js';

/**
 * Vercel Serverless Function Catch-All Entry Point (/api/[...path]).
 * Dispatches all dynamic sub-paths through the consolidated router.
 */
export default async function handler(req: any, res: any) {
  try {
    return await handleApiRequest(req, res);
  } catch (err: any) {
    console.error('[Vercel API Catch-All Error]:', err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Internal server error in API catch-all handler.',
    });
  }
}

