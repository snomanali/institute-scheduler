const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { query } = require('../../config/database');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch(e){next(e);}
});

router.put('/:id/read', authenticate, async (req, res, next) => {
  try {
    await query(`UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch(e){next(e);}
});

module.exports = router;
