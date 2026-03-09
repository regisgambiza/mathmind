const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const db = await getDb();
        const teacher = db.prepare('SELECT * FROM teachers WHERE username = ? AND password = ?').get(username, password);

        if (teacher) {
            // In a real app, we'd use JWT. For this simple case, we'll return user info.
            return res.json({
                success: true,
                user: { id: teacher.id, username: teacher.username },
                token: 'fake-jwt-token'
            });
        } else {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
