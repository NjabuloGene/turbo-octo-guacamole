require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('./db');
const { hashPassword, comparePassword, generateToken, verifyToken } = require('./auth');
const { compareFaces } = require('./geminiServices');
const md5 = require('md5');

const app = express();
const port = process.env.PORT || 3000;

// ============= MIDDLEWARE =============
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// ============= FILE UPLOAD CONFIGURATION =============
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|webm|ogg/;
        if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed'));
        }
    }
});

// ============= GEMINI INITIALIZATION =============
let genAI;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('✅ Gemini initialized');
} else {
    console.log('❌ Gemini API key missing');
}

// ============= PAYFAST HELPER =============
/**
 * Generates a PayFast MD5 signature.
 *
 * Mirrors PayFast's official PHP reference exactly:
 *
 *   foreach($data as $key => $val) {
 *     if($val !== '') $pfOutput .= $key .'='. urlencode(trim($val)) .'&';
 *   }
 *   $getString = substr($pfOutput, 0, -1);
 *   if($passPhrase !== null) $getString .= '&passphrase='.urlencode(trim($passPhrase));
 *   return md5($getString);
 *
 * Notes:
 *   - ALL non-empty fields are included in order (including merchant_key)
 *   - 'signature' field is excluded from hashing
 *   - Values are trim()'d then urlencode()'d (spaces → '+', rest is standard percent-encoding)
 *   - encodeURIComponent already produces uppercase hex — no extra transform needed
 *   - Passphrase appended ONLY if it is set and non-empty
 */
function generatePayFastSignature(data, passphrase = null) {
    // PHP urlencode(): encodeURIComponent handles hex correctly (uppercase),
    // only difference is spaces should be '+' not '%20'
    const phpUrlencode = (val) =>
        encodeURIComponent(String(val).trim()).replace(/%20/g, '+');

    let pfOutput = '';
    for (const [key, val] of Object.entries(data)) {
        if (key === 'signature') continue;
        if (val === '' || val === null || val === undefined) continue;
        pfOutput += `${key}=${phpUrlencode(val)}&`;
    }

    // Remove trailing '&' (matches PHP substr($pfOutput, 0, -1))
    let getString = pfOutput.slice(0, -1);

    // Append passphrase exactly as PayFast expects
    if (passphrase !== null && passphrase !== undefined && String(passphrase).trim() !== '') {
        getString += `&passphrase=${phpUrlencode(passphrase)}`;
    }

    console.log('\n🔑 PayFast string to hash:\n', getString, '\n');
    const sig = md5(getString);
    console.log('🔑 PayFast signature:', sig);
    return sig;
}

// ============= HEALTH CHECK =============
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        port,
        geminiConfigured: !!genAI,
        timestamp: new Date().toISOString()
    });
});

// ============= AUTH ROUTES =============
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, user_type = 'freelancer', skills = [], user_role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password are required' });
        }

        if (!user_role || !['helper', 'hirer', 'admin'].includes(user_role)) {
            return res.status(400).json({ error: 'Please select whether you are a helper or hirer' });
        }

        if (user_role === 'admin') {
            if (req.body.adminCode !== process.env.ADMIN_SECRET_CODE) {
                return res.status(403).json({ error: 'Invalid admin secret code' });
            }
        }

        const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        const passwordHash = await hashPassword(password);

        // Ensure user_role column exists
        await pool.query(`
            DO $$ BEGIN
                ALTER TABLE users ADD COLUMN user_role VARCHAR(50) DEFAULT 'helper';
            EXCEPTION WHEN duplicate_column THEN NULL;
            END $$;
        `);

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, user_type, skills, user_role)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name, email, user_type, user_role, created_at`,
            [name, email, passwordHash, user_type, skills, user_role]
        );

        const newUser = result.rows[0];
        const token = generateToken(newUser);

        res.status(201).json({ success: true, message: 'User registered successfully', user: newUser, token });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to register user', details: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];
        const isValid = await comparePassword(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Default role if missing
        if (!user.user_role) {
            user.user_role = 'helper';
            await pool.query('UPDATE users SET user_role = $1 WHERE id = $2', ['helper', user.id]);
        }

        delete user.password_hash;
        const token = generateToken(user);

        console.log('User logging in:', { id: user.id, email: user.email, role: user.user_role });

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                user_type: user.user_type,
                user_role: user.user_role,
                created_at: user.created_at
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Failed to login', details: error.message });
    }
});

app.get('/api/me', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, user_type, user_role, skills, bio, profile_picture, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Debug endpoint — call this from browser console to see what role your token has
// GET /api/me/role  → { tokenRole, dbRole, match }
app.get('/api/me/role', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT user_role, name, email FROM users WHERE id = $1', [req.user.id]);
        const dbRole    = result.rows[0]?.user_role || null;
        const tokenRole = req.user.user_role || null;
        console.log(`🔍 Role check: user ${req.user.id} — token='${tokenRole}' db='${dbRole}'`);
        res.json({ success: true, tokenRole, dbRole, match: tokenRole === dbRole, userId: req.user.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/profile', verifyToken, async (req, res) => {
    try {
        const { name, location, bio } = req.body;
        await pool.query(
            'UPDATE users SET name = $1, location = $2, bio = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
            [name, location, bio, req.user.id]
        );
        res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ============= FILE UPLOAD ENDPOINTS =============
app.post('/api/upload/profile-pic', verifyToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ success: true, url: `http://localhost:${port}/uploads/${req.file.filename}`, filename: req.file.filename });
});

app.post('/api/upload/photo', verifyToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ success: true, url: `http://localhost:${port}/uploads/${req.file.filename}`, filename: req.file.filename });
});

app.post('/api/upload/document', verifyToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ success: true, url: `http://localhost:${port}/uploads/${req.file.filename}`, filename: req.file.filename });
});

app.post('/api/upload/video', verifyToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ success: true, url: `http://localhost:${port}/uploads/${req.file.filename}`, filename: req.file.filename });
});

// ============= IDENTITY VERIFICATION =============
app.post('/api/verify-identity', verifyToken, upload.fields([
    { name: 'livePhoto', maxCount: 1 },
    { name: 'idPhoto', maxCount: 1 }
]), async (req, res) => {
    try {
        if (!req.files?.livePhoto || !req.files?.idPhoto) {
            return res.status(400).json({ error: 'Both live photo and ID photo are required' });
        }

        const livePhotoPath = req.files.livePhoto[0].path;
        const idPhotoPath = req.files.idPhoto[0].path;

        const comparison = await compareFaces(livePhotoPath, idPhotoPath);

        try { fs.unlinkSync(livePhotoPath); fs.unlinkSync(idPhotoPath); } catch (_) {}

        res.json({ success: true, verification: comparison, timestamp: new Date().toISOString() });
    } catch (error) {
        try {
            if (req.files?.livePhoto) fs.unlinkSync(req.files.livePhoto[0].path);
            if (req.files?.idPhoto) fs.unlinkSync(req.files.idPhoto[0].path);
        } catch (_) {}
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Failed to verify identity', details: error.message });
    }
});

// ============= GEMINI TEST =============
app.get('/api/test-gemini', async (req, res) => {
    try {
        if (!genAI) return res.status(500).json({ error: 'Gemini not configured' });
        const model = genAI.getGenerativeModel({ model: 'models/gemini-2.5-flash' });
        const result = await model.generateContent('Say hello in one word');
        res.json({ success: true, message: 'Gemini is working!', response: result.response.text() });
    } catch (error) {
        console.error('Gemini test error:', error);
        res.status(500).json({ error: 'Gemini test failed', details: error.message });
    }
});

// ============= INTERVIEW ENDPOINTS =============
app.post('/api/interview/questions', verifyToken, async (req, res) => {
    try {
        const { role, skills, experience, questionCount = 5 } = req.body;

        const defaultQuestions = [
            { id: 1, question: 'Tell me about your experience caring for others.', category: 'behavioral', expectedKeywords: ['experience', 'care', 'compassion'] },
            { id: 2, question: 'How do you handle stressful situations?', category: 'situational', expectedKeywords: ['calm', 'patient', 'solution'] },
            { id: 3, question: 'Why do you want to work in this field?', category: 'general', expectedKeywords: ['passion', 'help', 'dedication'] },
            { id: 4, question: 'Describe a time you had to deal with a difficult client or situation.', category: 'behavioral', expectedKeywords: ['conflict', 'resolution', 'professional'] },
            { id: 5, question: 'What are your greatest strengths and weaknesses?', category: 'general', expectedKeywords: ['strengths', 'weaknesses', 'improvement'] }
        ];

        if (genAI) {
            try {
                const model = genAI.getGenerativeModel({ model: 'models/gemini-2.5-flash' });
                const prompt = `Generate ${questionCount} interview questions for a ${role} position.
Skills/Experience: ${skills.join(', ')}
Experience level: ${experience}
Return a JSON array with objects: { id, question, category ("behavioral"|"situational"|"general"), expectedKeywords[] }
Make questions relevant to South African context. Return ONLY valid JSON, no markdown.`;

                const result = await model.generateContent(prompt);
                const text = result.response.text();
                const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/);
                const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
                const questions = JSON.parse(jsonStr);
                return res.json({ success: true, questions, sessionId: Date.now().toString() });
            } catch (geminiError) {
                console.error('Gemini error, using defaults:', geminiError);
            }
        }

        res.json({ success: true, questions: defaultQuestions.slice(0, questionCount), sessionId: Date.now().toString() });
    } catch (error) {
        console.error('Interview questions error:', error);
        res.status(500).json({ error: 'Failed to generate questions' });
    }
});

app.post('/api/interview/submit-answer', verifyToken, async (req, res) => {
    try {
        const { questionId, question, answer, expectedKeywords } = req.body;
        if (!question || !answer) return res.status(400).json({ error: 'Question and answer are required' });

        res.json({
            success: true,
            evaluation: {
                score: Math.floor(Math.random() * 30) + 70,
                feedback: 'Your answer was good. Consider providing more specific examples in future responses.',
                strengths: ['Answered the question', 'Showed understanding'],
                improvements: ['Could provide more detail', 'Consider giving specific examples'],
                keywordMatch: expectedKeywords ? Math.floor(expectedKeywords.length * 0.7) : 0
            }
        });
    } catch (error) {
        console.error('Answer evaluation error:', error);
        res.status(500).json({ error: 'Failed to evaluate answer' });
    }
});

app.post('/api/interview/save-results', verifyToken, async (req, res) => {
    try {
        const { sessionId, results, totalScore, role, completedAt } = req.body;

        await pool.query(`
            CREATE TABLE IF NOT EXISTS interview_results (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                session_id VARCHAR(100),
                results JSONB,
                total_score INTEGER,
                role VARCHAR(100),
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(
            `INSERT INTO interview_results (user_id, session_id, results, total_score, role, completed_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [req.user.id, sessionId, JSON.stringify(results), totalScore, role, completedAt]
        );

        res.json({ success: true, message: 'Interview results saved' });
    } catch (error) {
        console.error('Save results error:', error);
        res.status(500).json({ error: 'Failed to save results' });
    }
});

// ============= PROFILE ENDPOINTS =============
app.post('/api/profiles', verifyToken, async (req, res) => {
    try {
        const { name, role, rate, experience, location, service_type, bio, profile_pic, photos, documents, video } = req.body;
        const userId = req.user.id;

        const existing = await pool.query('SELECT id FROM profiles WHERE user_id = $1', [userId]);

        if (existing.rows.length > 0) {
            const result = await pool.query(
                `UPDATE profiles SET name=$1, role=$2, rate=$3, experience=$4, location=$5,
                 service_type=$6, bio=$7, profile_pic=$8, photos=$9, documents=$10, video=$11,
                 updated_at=CURRENT_TIMESTAMP WHERE user_id=$12 RETURNING id`,
                [name, role, rate, experience, location, service_type, bio, profile_pic, photos, documents, video, userId]
            );
            res.json({ success: true, message: 'Profile updated successfully', profileId: result.rows[0].id });
        } else {
            const result = await pool.query(
                `INSERT INTO profiles (user_id, name, role, rate, experience, location, service_type, bio, profile_pic, photos, documents, video)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
                [userId, name, role, rate, experience, location, service_type, bio, profile_pic, photos, documents, video]
            );
            res.status(201).json({ success: true, message: 'Profile created successfully', profileId: result.rows[0].id });
        }
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Failed to create/update profile', details: error.message });
    }
});

app.get('/api/profiles/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ error: 'Search query required' });

        const result = await pool.query(
            `SELECT p.*, u.email, u.name as user_name FROM profiles p
             JOIN users u ON p.user_id = u.id
             WHERE p.is_available = true
               AND (p.name ILIKE $1 OR p.role ILIKE $1 OR p.location ILIKE $1 OR p.bio ILIKE $1)
             ORDER BY p.rating DESC LIMIT 50`,
            [`%${q}%`]
        );
        res.json({ success: true, profiles: result.rows });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/profiles/browse', verifyToken, async (req, res) => {
    try {
        const { search, location, minRating, serviceType } = req.query;
        const params = [];
        let paramIndex = 1;

        let query = `SELECT p.*, u.email, u.name as user_name, u.user_role
                     FROM profiles p JOIN users u ON p.user_id = u.id
                     WHERE p.is_available = true`;

        if (search) {
            query += ` AND (p.name ILIKE $${paramIndex} OR p.role ILIKE $${paramIndex} OR p.bio ILIKE $${paramIndex})`;
            params.push(`%${search}%`); paramIndex++;
        }
        if (location) {
            query += ` AND p.location ILIKE $${paramIndex}`;
            params.push(`%${location}%`); paramIndex++;
        }
        if (serviceType) {
            query += ` AND p.service_type = $${paramIndex}`;
            params.push(serviceType); paramIndex++;
        }
        if (minRating) {
            query += ` AND p.rating >= $${paramIndex}`;
            params.push(parseFloat(minRating)); paramIndex++;
        }

        query += ` ORDER BY p.rating DESC, p.created_at DESC LIMIT 50`;
        const result = await pool.query(query, params);
        res.json({ success: true, profiles: result.rows, count: result.rows.length });
    } catch (error) {
        console.error('Browse profiles error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch profiles' });
    }
});

app.get('/api/profiles', async (req, res) => {
    try {
        const { service } = req.query;
        const params = [];
        let query = `SELECT p.*, u.email, u.name as user_name FROM profiles p
                     JOIN users u ON p.user_id = u.id WHERE p.is_available = true`;

        if (service) { query += ` AND p.service_type = $1`; params.push(service); }
        query += ` ORDER BY p.rating DESC, p.created_at DESC LIMIT 50`;

        const result = await pool.query(query, params);
        res.json({ success: true, profiles: result.rows });
    } catch (error) {
        console.error('Get profiles error:', error);
        res.status(500).json({ error: 'Failed to get profiles' });
    }
});

app.get('/api/profiles/:id/details', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, u.email, u.name as user_name, u.created_at as user_since
             FROM profiles p JOIN users u ON p.user_id = u.id WHERE p.id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Profile not found' });
        res.json({ success: true, profile: result.rows[0] });
    } catch (error) {
        console.error('Get profile details error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch profile' });
    }
});

app.get('/api/profiles/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, u.email, u.name as user_name FROM profiles p
             JOIN users u ON p.user_id = u.id WHERE p.id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
        res.json({ success: true, profile: result.rows[0] });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// ============= SAVED PROFILES =============
app.post('/api/profiles/:id/save', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') return res.status(403).json({ error: 'Only hirers can save profiles' });

        const { id } = req.params;
        const existing = await pool.query(
            'SELECT id FROM saved_profiles WHERE hirer_id = $1 AND profile_id = $2',
            [req.user.id, id]
        );

        if (existing.rows.length > 0) {
            await pool.query('DELETE FROM saved_profiles WHERE hirer_id = $1 AND profile_id = $2', [req.user.id, id]);
            return res.json({ success: true, saved: false, message: 'Profile removed from saved' });
        }

        await pool.query('INSERT INTO saved_profiles (hirer_id, profile_id) VALUES ($1, $2)', [req.user.id, id]);
        res.json({ success: true, saved: true, message: 'Profile saved successfully' });
    } catch (error) {
        console.error('Save profile error:', error);
        res.status(500).json({ error: 'Failed to save profile' });
    }
});

app.get('/api/saved-profiles', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, u.name as user_name, sp.created_at as saved_at
             FROM saved_profiles sp JOIN profiles p ON sp.profile_id = p.id
             JOIN users u ON p.user_id = u.id WHERE sp.hirer_id = $1
             ORDER BY sp.created_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, savedProfiles: result.rows });
    } catch (error) {
        console.error('Get saved profiles error:', error);
        res.status(500).json({ error: 'Failed to get saved profiles' });
    }
});

// ============= MESSAGING ENDPOINTS =============
// NOTE: Specific routes (/unread/count, /conversations) MUST come before /:userId

app.get('/api/messages/unread/count', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT COUNT(*) as count FROM messages WHERE receiver_id = $1 AND is_read = false',
            [req.user.id]
        );
        res.json({ success: true, unreadCount: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

app.get('/api/messages/conversations', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(`
            SELECT DISTINCT
                u.id as user_id, u.name as user_name, u.user_role,
                p.id as profile_id, p.name as profile_name, p.profile_pic,
                (
                    SELECT message FROM messages m2
                    WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id)
                       OR (m2.sender_id = u.id AND m2.receiver_id = $1)
                    ORDER BY m2.created_at DESC LIMIT 1
                ) as last_message,
                (
                    SELECT created_at FROM messages m2
                    WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id)
                       OR (m2.sender_id = u.id AND m2.receiver_id = $1)
                    ORDER BY m2.created_at DESC LIMIT 1
                ) as last_message_time,
                COUNT(CASE WHEN m.receiver_id = $1 AND m.is_read = false THEN 1 END) as unread_count
            FROM messages m
            JOIN users u ON (u.id = m.sender_id OR u.id = m.receiver_id)
            LEFT JOIN profiles p ON p.user_id = u.id
            WHERE (m.sender_id = $1 OR m.receiver_id = $1) AND u.id != $1
            GROUP BY u.id, u.name, u.user_role, p.id, p.name, p.profile_pic
            ORDER BY last_message_time DESC
        `, [userId]);
        res.json({ success: true, conversations: result.rows });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
});

app.post('/api/messages', verifyToken, async (req, res) => {
    try {
        const { receiver_id, profile_id, message } = req.body;
        if (!receiver_id || !message) return res.status(400).json({ error: 'Receiver and message are required' });

        const result = await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, profile_id, message, is_read)
             VALUES ($1, $2, $3, $4, false) RETURNING id, created_at`,
            [req.user.id, receiver_id, profile_id, message]
        );
        res.json({ success: true, message: 'Message sent successfully', messageId: result.rows[0].id, created_at: result.rows[0].created_at });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.get('/api/messages/:userId', verifyToken, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const { userId } = req.params;

        await pool.query(
            `UPDATE messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false`,
            [userId, currentUserId]
        );

        const result = await pool.query(`
            SELECT m.*, u.name as sender_name, u.user_role as sender_role
            FROM messages m JOIN users u ON m.sender_id = u.id
            WHERE (m.sender_id = $1 AND m.receiver_id = $2)
               OR (m.sender_id = $2 AND m.receiver_id = $1)
            ORDER BY m.created_at ASC
        `, [currentUserId, userId]);

        res.json({ success: true, messages: result.rows });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// ============= HIRE REQUESTS =============
app.post('/api/hire-requests', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') return res.status(403).json({ error: 'Only hirers can create hire requests' });

        const { helper_id, profile_id, start_date, duration, message, schedule, total_hours, total_amount, hourly_rate } = req.body;
        const hirer_id = req.user.id;

        const existing = await pool.query(
            `SELECT id FROM hire_requests WHERE hirer_id = $1 AND helper_id = $2 AND status = 'pending'`,
            [hirer_id, helper_id]
        );
        if (existing.rows.length > 0) return res.status(400).json({ error: 'You already have a pending request for this helper' });

        let result;
        let calculatedTotalAmount = 0;

        if (schedule && Array.isArray(schedule) && schedule.length > 0) {
            const calculatedTotalHours = total_hours || schedule.reduce((sum, day) => sum + (parseFloat(day.hours) || 0), 0);
            calculatedTotalAmount = total_amount || (calculatedTotalHours * (hourly_rate || 0));
            const calculatedDuration = duration || `${calculatedTotalHours} hours over ${schedule.length} day(s)`;
            const calculatedStartDate = start_date || schedule[0]?.date;

            result = await pool.query(
                `INSERT INTO hire_requests (hirer_id, helper_id, profile_id, start_date, duration, message, schedule, total_hours, total_amount, hourly_rate)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, created_at`,
                [hirer_id, helper_id, profile_id, calculatedStartDate, calculatedDuration, message || '', JSON.stringify(schedule), calculatedTotalHours, calculatedTotalAmount, hourly_rate || 0]
            );
        } else {
            result = await pool.query(
                `INSERT INTO hire_requests (hirer_id, helper_id, profile_id, start_date, duration, message)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
                [hirer_id, helper_id, profile_id, start_date, duration, message]
            );
        }

        res.json({ success: true, message: 'Hire request sent successfully', requestId: result.rows[0].id, total_amount: calculatedTotalAmount });
    } catch (error) {
        console.error('Create hire request error:', error);
        res.status(500).json({ error: 'Failed to create hire request', details: error.message });
    }
});

// ── Role-aware middleware ──────────────────────────────────────────────────────
// Always reads user_role fresh from the DB so stale JWTs never cause 403s.
async function requireRole(...roles) {
    return async (req, res, next) => {
        try {
            const dbUser = await pool.query(
                'SELECT user_role FROM users WHERE id = $1', [req.user.id]
            );
            if (dbUser.rows.length === 0) {
                return res.status(401).json({ error: 'User not found' });
            }
            const role = dbUser.rows[0].user_role;
            // Keep req.user.user_role in sync with DB truth
            req.user.user_role = role;
            if (!roles.includes(role)) {
                console.log(`🚫 Role check failed: user ${req.user.id} has role '${role}', needs one of [${roles}]`);
                return res.status(403).json({
                    error: `Access requires role: ${roles.join(' or ')}`,
                    yourRole: role
                });
            }
            next();
        } catch (err) {
            console.error('requireRole error:', err);
            res.status(500).json({ error: 'Role check failed' });
        }
    };
}

// Specific hire-request sub-routes MUST come before /:id
app.get('/api/hire-requests/pending-payments', verifyToken, async (req, res) => {
    try {
        // Re-read role from DB — never trust stale JWT alone
        const dbUser = await pool.query('SELECT user_role FROM users WHERE id = $1', [req.user.id]);
        const role = dbUser.rows[0]?.user_role;
        console.log(`📋 pending-payments: user ${req.user.id} role='${role}' (JWT had '${req.user.user_role}')`);

        if (role !== 'hirer') {
            return res.status(403).json({ error: 'Only hirers can view pending payments', yourRole: role });
        }

        const result = await pool.query(`
            SELECT hr.*, p.name as helper_name, p.profile_pic, p.user_id as helper_user_id
            FROM hire_requests hr JOIN profiles p ON hr.helper_id = p.user_id
            WHERE hr.hirer_id = $1 AND hr.status = 'accepted'
              AND (hr.payment_status IS NULL OR hr.payment_status = 'pending')
            ORDER BY hr.updated_at DESC
        `, [req.user.id]);
        res.json({ success: true, payments: result.rows });
    } catch (error) {
        console.error('Pending payments error:', error);
        res.status(500).json({ error: 'Failed to fetch pending payments' });
    }
});

app.get('/api/hire-requests/accepted', verifyToken, async (req, res) => {
    try {
        const dbUser = await pool.query('SELECT user_role FROM users WHERE id = $1', [req.user.id]);
        const role = dbUser.rows[0]?.user_role;
        if (role !== 'hirer') {
            return res.status(403).json({ error: 'Only hirers can view accepted requests', yourRole: role });
        }

        const result = await pool.query(`
            SELECT hr.*, p.name as helper_name, p.profile_pic, p.user_id as helper_user_id
            FROM hire_requests hr JOIN profiles p ON hr.helper_id = p.user_id
            WHERE hr.hirer_id = $1 AND hr.status = 'accepted'
              AND (hr.payment_status IS NULL OR hr.payment_status = 'pending')
            ORDER BY hr.updated_at DESC
        `, [req.user.id]);
        res.json({ success: true, acceptedRequests: result.rows });
    } catch (error) {
        console.error('Get accepted requests error:', error);
        res.status(500).json({ error: 'Failed to fetch accepted requests' });
    }
});

app.get('/api/hire-requests/my-active-jobs', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT hr.*, u.name as hirer_name, u.email as hirer_email
            FROM hire_requests hr JOIN users u ON hr.hirer_id = u.id
            WHERE hr.helper_id = $1 AND hr.status IN ('paid', 'in_progress', 'completed')
            ORDER BY hr.created_at DESC
        `, [req.user.id]);
        res.json({ success: true, jobs: result.rows });
    } catch (error) {
        console.error('Get active jobs error:', error);
        res.status(500).json({ error: 'Failed to fetch active jobs' });
    }
});

app.get('/api/hire-requests/my-active-hires', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT hr.*, p.name as helper_name, p.profile_pic
            FROM hire_requests hr JOIN profiles p ON hr.helper_id = p.user_id
            WHERE hr.hirer_id = $1 AND hr.status IN ('paid', 'in_progress', 'completed', 'rated')
            ORDER BY hr.created_at DESC
        `, [req.user.id]);
        res.json({ success: true, jobs: result.rows });
    } catch (error) {
        console.error('Get active hires error:', error);
        res.status(500).json({ error: 'Failed to fetch active hires' });
    }
});

app.get('/api/hire-requests', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.user_role;
        let query, params;

        if (userRole === 'hirer') {
            query = `SELECT hr.*, p.name as helper_name, p.profile_pic as helper_pic, p.role as helper_role, pr.name as profile_name
                     FROM hire_requests hr JOIN profiles p ON hr.helper_id = p.user_id
                     LEFT JOIN profiles pr ON hr.profile_id = pr.id
                     WHERE hr.hirer_id = $1 ORDER BY hr.created_at DESC`;
            params = [userId];
        } else if (userRole === 'helper') {
            query = `SELECT hr.*, u.name as hirer_name, u.email as hirer_email, pr.name as profile_name
                     FROM hire_requests hr JOIN users u ON hr.hirer_id = u.id
                     LEFT JOIN profiles pr ON hr.profile_id = pr.id
                     WHERE hr.helper_id = $1 ORDER BY hr.created_at DESC`;
            params = [userId];
        } else {
            return res.status(403).json({ error: 'Invalid user role' });
        }

        const result = await pool.query(query, params);
        res.json({ success: true, hireRequests: result.rows });
    } catch (error) {
        console.error('Get hire requests error:', error);
        res.status(500).json({ error: 'Failed to get hire requests' });
    }
});

app.put('/api/hire-requests/:id/payment-success', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const hireRequest = await pool.query('SELECT * FROM hire_requests WHERE id = $1 AND hirer_id = $2', [id, req.user.id]);
        if (hireRequest.rows.length === 0) return res.status(404).json({ error: 'Request not found' });

        await pool.query(
            `UPDATE hire_requests SET status='paid', payment_status='completed', paid_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
            [id]
        );
        res.json({ success: true, message: 'Payment recorded successfully' });
    } catch (error) {
        console.error('Payment success error:', error);
        res.status(500).json({ error: 'Failed to update payment status' });
    }
});

app.put('/api/hire-requests/:id/start', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const hireRequest = await pool.query('SELECT * FROM hire_requests WHERE id = $1 AND helper_id = $2', [id, req.user.id]);
        if (hireRequest.rows.length === 0) return res.status(404).json({ error: 'Request not found or not authorized' });
        if (hireRequest.rows[0].status !== 'paid') return res.status(400).json({ error: 'Job must be paid before starting' });

        await pool.query(
            `UPDATE hire_requests SET status='in_progress', started_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
            [id]
        );
        res.json({ success: true, message: 'Job started successfully' });
    } catch (error) {
        console.error('Start job error:', error);
        res.status(500).json({ error: 'Failed to start job' });
    }
});

app.put('/api/hire-requests/:id/complete', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const hireRequest = await pool.query('SELECT * FROM hire_requests WHERE id = $1 AND helper_id = $2', [id, req.user.id]);
        if (hireRequest.rows.length === 0) return res.status(404).json({ error: 'Request not found or not authorized' });
        if (hireRequest.rows[0].status !== 'in_progress') return res.status(400).json({ error: 'Job must be in progress to complete' });

        await pool.query(
            `UPDATE hire_requests SET status='completed', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
            [id]
        );
        res.json({ success: true, message: 'Job completed successfully' });
    } catch (error) {
        console.error('Complete job error:', error);
        res.status(500).json({ error: 'Failed to complete job' });
    }
});

app.post('/api/hire-requests/:id/rate', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, review } = req.body;

        if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

        const hireRequest = await pool.query('SELECT * FROM hire_requests WHERE id = $1 AND hirer_id = $2', [id, req.user.id]);
        if (hireRequest.rows.length === 0) return res.status(404).json({ error: 'Request not found or not authorized' });
        if (hireRequest.rows[0].status !== 'completed') return res.status(400).json({ error: 'Job must be completed before rating' });

        const profile = await pool.query('SELECT id, rating, review_count FROM profiles WHERE user_id = $1', [hireRequest.rows[0].helper_id]);
        if (profile.rows.length > 0) {
            const currentRating = parseFloat(profile.rows[0].rating) || 0;
            const reviewCount = parseInt(profile.rows[0].review_count) || 0;
            const newRating = (currentRating * reviewCount + rating) / (reviewCount + 1);
            await pool.query(
                `UPDATE profiles SET rating=$1, review_count=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
                [newRating, reviewCount + 1, profile.rows[0].id]
            );
        }

        await pool.query(
            `UPDATE hire_requests SET status='rated', helper_rating=$1, helper_review=$2, rated_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
            [rating, review || null, id]
        );
        res.json({ success: true, message: 'Rating submitted successfully' });
    } catch (error) {
        console.error('Rate helper error:', error);
        res.status(500).json({ error: 'Failed to submit rating' });
    }
});

app.put('/api/hire-requests/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user.id;

        if (!['pending', 'accepted', 'rejected', 'completed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const hireRequest = await pool.query('SELECT * FROM hire_requests WHERE id = $1', [id]);
        if (hireRequest.rows.length === 0) return res.status(404).json({ error: 'Hire request not found' });

        const request = hireRequest.rows[0];
        if (req.user.user_role === 'helper' && request.helper_id !== userId) return res.status(403).json({ error: 'Not authorized' });
        if (req.user.user_role === 'hirer' && request.hirer_id !== userId) return res.status(403).json({ error: 'Not authorized' });

        const acceptedAt = status === 'accepted' ? new Date() : null;
        await pool.query(
            `UPDATE hire_requests SET status=$1, updated_at=CURRENT_TIMESTAMP, accepted_at=COALESCE($2, accepted_at) WHERE id=$3`,
            [status, acceptedAt, id]
        );
        res.json({ success: true, message: `Hire request ${status}` });
    } catch (error) {
        console.error('Update hire request error:', error);
        res.status(500).json({ error: 'Failed to update hire request' });
    }
});

// ============= ADMIN ENDPOINTS =============
const adminCheck = (req, res, next) => {
    if (req.user.user_role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied. Admin privileges required.' });
    }
    next();
};

app.get('/api/admin/stats', verifyToken, adminCheck, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE user_role = 'helper') as total_helpers,
                (SELECT COUNT(*) FROM users WHERE user_role = 'hirer') as total_hirers,
                (SELECT COUNT(*) FROM users WHERE user_role = 'admin') as total_admins,
                (SELECT COUNT(*) FROM profiles) as total_profiles,
                (SELECT COUNT(*) FROM interview_results) as total_interviews,
                (SELECT ROUND(AVG(total_score)) FROM interview_results) as avg_interview_score,
                (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days') as new_users_week
        `);
        res.json({ success: true, stats: stats.rows[0] });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
});

app.get('/api/admin/users', verifyToken, adminCheck, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.email, u.user_role, u.user_type, u.created_at,
                   COUNT(DISTINCT p.id) as profile_count,
                   COUNT(DISTINCT i.id) as interview_count
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            LEFT JOIN interview_results i ON u.id = i.user_id
            GROUP BY u.id ORDER BY u.created_at DESC
        `);
        res.json({ success: true, users: result.rows });
    } catch (error) {
        console.error('Admin get users error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
});

app.get('/api/admin/interviews', verifyToken, adminCheck, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT i.*, u.name as user_name, u.email
            FROM interview_results i JOIN users u ON i.user_id = u.id
            ORDER BY i.created_at DESC LIMIT 100
        `);
        res.json({ success: true, interviews: result.rows });
    } catch (error) {
        console.error('Admin get interviews error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch interviews' });
    }
});

app.put('/api/admin/users/:id/role', verifyToken, adminCheck, async (req, res) => {
    try {
        const { user_role } = req.body;
        if (!['helper', 'hirer', 'admin'].includes(user_role)) return res.status(400).json({ success: false, error: 'Invalid role' });

        await pool.query('UPDATE users SET user_role = $1 WHERE id = $2', [user_role, req.params.id]);
        res.json({ success: true, message: 'User role updated successfully' });
    } catch (error) {
        console.error('Admin update role error:', error);
        res.status(500).json({ success: false, error: 'Failed to update user role' });
    }
});

app.delete('/api/admin/users/:id', verifyToken, adminCheck, async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Admin delete user error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete user' });
    }
});

// ============= BUSINESS ENDPOINTS =============
app.post('/api/business/register', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') return res.status(403).json({ error: 'Only employers can register a business' });

        const { company_name, registration_number, tax_number, industry, company_size, website } = req.body;
        if (!company_name) return res.status(400).json({ error: 'Company name is required' });

        const result = await pool.query(
            `INSERT INTO businesses (user_id, company_name, registration_number, tax_number, industry, company_size, website)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, company_name, verified`,
            [req.user.id, company_name, registration_number, tax_number, industry, company_size, website]
        );
        res.status(201).json({ success: true, message: 'Business registered successfully', business: result.rows[0] });
    } catch (error) {
        console.error('Business registration error:', error);
        res.status(500).json({ error: 'Failed to register business' });
    }
});

app.get('/api/business', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM businesses WHERE user_id = $1', [req.user.id]);
        res.json({ success: true, business: result.rows[0] || null });
    } catch (error) {
        console.error('Get business error:', error);
        res.status(500).json({ error: 'Failed to get business' });
    }
});

app.post('/api/business/jobs', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') return res.status(403).json({ error: 'Only employers can post jobs' });

        const business = await pool.query('SELECT id FROM businesses WHERE user_id = $1', [req.user.id]);
        if (business.rows.length === 0) return res.status(400).json({ error: 'Please register your business first' });

        const { title, description, employment_type, salary_min, salary_max, location, remote_allowed, requirements, benefits, experience_required } = req.body;
        if (!title || !description) return res.status(400).json({ error: 'Title and description are required' });

        const result = await pool.query(
            `INSERT INTO business_jobs (business_id, title, description, employment_type, salary_min, salary_max, location, remote_allowed, requirements, benefits, experience_required)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [business.rows[0].id, title, description, employment_type, salary_min, salary_max, location, remote_allowed || false, requirements || [], benefits || [], experience_required]
        );
        res.status(201).json({ success: true, message: 'Job posted successfully', jobId: result.rows[0].id });
    } catch (error) {
        console.error('Post job error:', error);
        res.status(500).json({ error: 'Failed to post job' });
    }
});

app.get('/api/business/jobs', async (req, res) => {
    try {
        const { search, location, employment_type, min_salary } = req.query;
        const params = [];
        let paramIndex = 1;

        let query = `SELECT j.*, b.company_name, b.industry,
                     (SELECT COUNT(*) FROM job_applications WHERE job_id = j.id) as application_count
                     FROM business_jobs j JOIN businesses b ON j.business_id = b.id
                     WHERE j.status = 'open'`;

        if (search) { query += ` AND (j.title ILIKE $${paramIndex} OR j.description ILIKE $${paramIndex})`; params.push(`%${search}%`); paramIndex++; }
        if (location) { query += ` AND j.location ILIKE $${paramIndex}`; params.push(`%${location}%`); paramIndex++; }
        if (employment_type) { query += ` AND j.employment_type = $${paramIndex}`; params.push(employment_type); paramIndex++; }
        if (min_salary) { query += ` AND j.salary_max >= $${paramIndex}`; params.push(parseFloat(min_salary)); paramIndex++; }

        query += ` ORDER BY j.created_at DESC LIMIT 50`;
        const result = await pool.query(query, params);
        res.json({ success: true, jobs: result.rows });
    } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({ error: 'Failed to get jobs' });
    }
});

app.get('/api/business/my-applications', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'helper') return res.status(403).json({ error: 'Only helpers can view applications' });

        const result = await pool.query(`
            SELECT a.*, j.title, j.salary_min, j.salary_max, j.location, j.employment_type, b.company_name, b.industry
            FROM job_applications a JOIN business_jobs j ON a.job_id = j.id
            JOIN businesses b ON j.business_id = b.id
            WHERE a.candidate_id = $1 ORDER BY a.created_at DESC
        `, [req.user.id]);
        res.json({ success: true, applications: result.rows });
    } catch (error) {
        console.error('Get applications error:', error);
        res.status(500).json({ error: 'Failed to get applications' });
    }
});

app.get('/api/business/my-job-applications', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') return res.status(403).json({ error: 'Only employers can view applications' });

        const business = await pool.query('SELECT id FROM businesses WHERE user_id = $1', [req.user.id]);
        if (business.rows.length === 0) return res.json({ success: true, applications: [] });

        const result = await pool.query(`
            SELECT a.*, u.name as candidate_name, u.email as candidate_email,
                   p.profile_pic, p.role, p.rating, p.experience, j.title as job_title
            FROM job_applications a JOIN business_jobs j ON a.job_id = j.id
            JOIN users u ON a.candidate_id = u.id
            LEFT JOIN profiles p ON a.candidate_id = p.user_id
            WHERE j.business_id = $1 ORDER BY a.created_at DESC
        `, [business.rows[0].id]);
        res.json({ success: true, applications: result.rows });
    } catch (error) {
        console.error('Get job applications error:', error);
        res.status(500).json({ error: 'Failed to get applications' });
    }
});

app.get('/api/business/jobs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE business_jobs SET view_count = view_count + 1 WHERE id = $1', [id]);

        const result = await pool.query(`
            SELECT j.*, b.company_name, b.industry, b.logo_url, b.verified as business_verified
            FROM business_jobs j JOIN businesses b ON j.business_id = b.id WHERE j.id = $1
        `, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

        res.json({ success: true, job: result.rows[0], hasApplied: false, applicationStatus: null });
    } catch (error) {
        console.error('Get job error:', error);
        res.status(500).json({ error: 'Failed to get job' });
    }
});

app.post('/api/business/jobs/:id/apply', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'helper') return res.status(403).json({ error: 'Only helpers can apply for jobs' });

        const { id } = req.params;
        const { cover_letter, expected_salary } = req.body;

        const existing = await pool.query('SELECT id FROM job_applications WHERE job_id = $1 AND candidate_id = $2', [id, req.user.id]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'You have already applied for this job' });

        const profile = await pool.query('SELECT id FROM profiles WHERE user_id = $1', [req.user.id]);
        const result = await pool.query(
            `INSERT INTO job_applications (job_id, candidate_id, profile_id, cover_letter, expected_salary)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [id, req.user.id, profile.rows[0]?.id || null, cover_letter || '', expected_salary || null]
        );
        await pool.query('UPDATE business_jobs SET application_count = application_count + 1 WHERE id = $1', [id]);

        res.status(201).json({ success: true, message: 'Application submitted successfully', applicationId: result.rows[0].id });
    } catch (error) {
        console.error('Apply error:', error);
        res.status(500).json({ error: 'Failed to apply for job' });
    }
});

app.put('/api/business/applications/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        if (!['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const application = await pool.query(
            `SELECT a.*, j.business_id FROM job_applications a JOIN business_jobs j ON a.job_id = j.id WHERE a.id = $1`,
            [id]
        );
        if (application.rows.length === 0) return res.status(404).json({ error: 'Application not found' });

        const business = await pool.query('SELECT id FROM businesses WHERE user_id = $1', [req.user.id]);
        if (application.rows[0].business_id !== business.rows[0]?.id) return res.status(403).json({ error: 'Not authorized' });

        await pool.query(
            'UPDATE job_applications SET status = $1, notes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [status, notes || '', id]
        );

        if (status === 'hired') {
            const job = await pool.query('SELECT * FROM business_jobs WHERE id = $1', [application.rows[0].job_id]);
            const salary = job.rows[0].salary_max || job.rows[0].salary_min || 0;
            const feePercentage = 12;
            const feeAmount = salary * (feePercentage / 100);

            const placement = await pool.query(
                `INSERT INTO placements (business_id, candidate_id, job_id, agreed_salary, fee_percentage, fee_amount, start_date, probation_end_date)
                 VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,CURRENT_DATE + INTERVAL '30 days') RETURNING id`,
                [business.rows[0].id, application.rows[0].candidate_id, application.rows[0].job_id, salary, feePercentage, feeAmount]
            );

            const invoiceNumber = 'INV-' + Date.now() + '-' + placement.rows[0].id;
            await pool.query(
                `INSERT INTO placement_invoices (business_id, placement_id, invoice_number, amount, due_date)
                 VALUES ($1,$2,$3,$4,CURRENT_DATE + INTERVAL '14 days')`,
                [business.rows[0].id, placement.rows[0].id, invoiceNumber, feeAmount]
            );
        }

        res.json({ success: true, message: `Application ${status}` });
    } catch (error) {
        console.error('Update application error:', error);
        res.status(500).json({ error: 'Failed to update application' });
    }
});

// ============= CALENDAR ENDPOINTS =============
app.post('/api/calendar/event', verifyToken, async (req, res) => {
    try {
        const { job_id, title, event_type, event_date, start_time, end_time, notes } = req.body;
        const result = await pool.query(
            `INSERT INTO calendar_events (user_id, job_id, title, event_type, event_date, start_time, end_time, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [req.user.id, job_id, title, event_type, event_date, start_time, end_time, notes]
        );
        res.status(201).json({ success: true, message: 'Event added to calendar', eventId: result.rows[0].id });
    } catch (error) {
        console.error('Add calendar event error:', error);
        res.status(500).json({ error: 'Failed to add event' });
    }
});

app.get('/api/calendar/events', verifyToken, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const params = [req.user.id];
        let query = `SELECT ce.*, j.title as job_title FROM calendar_events ce
                     LEFT JOIN business_jobs j ON ce.job_id = j.id WHERE ce.user_id = $1`;

        if (start_date && end_date) { query += ` AND ce.event_date BETWEEN $2 AND $3`; params.push(start_date, end_date); }
        query += ` ORDER BY ce.event_date ASC, ce.start_time ASC`;

        const result = await pool.query(query, params);
        res.json({ success: true, events: result.rows });
    } catch (error) {
        console.error('Get calendar events error:', error);
        res.status(500).json({ error: 'Failed to get events' });
    }
});

// ============= B2B ESCROW =============
app.post('/api/b2b/escrow/deposit', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') return res.status(403).json({ error: 'Only employers can deposit funds' });

        const { placement_id, amount, payment_method } = req.body;
        const placement = await pool.query('SELECT * FROM placements WHERE id = $1', [placement_id]);
        if (placement.rows.length === 0) return res.status(404).json({ error: 'Placement not found' });

        const result = await pool.query(
            `INSERT INTO b2b_escrow (placement_id, business_id, candidate_id, amount, payment_method, status)
             VALUES ($1,$2,$3,$4,$5,'held') RETURNING id`,
            [placement_id, placement.rows[0].business_id, placement.rows[0].candidate_id, amount, payment_method]
        );
        await pool.query('UPDATE placements SET status = $1 WHERE id = $2', ['active', placement_id]);

        res.json({ success: true, message: 'Payment deposited to escrow', escrowId: result.rows[0].id });
    } catch (error) {
        console.error('Deposit error:', error);
        res.status(500).json({ error: 'Failed to deposit funds' });
    }
});

app.post('/api/b2b/escrow/release', verifyToken, async (req, res) => {
    try {
        const { placement_id } = req.body;
        const escrow = await pool.query(`SELECT * FROM b2b_escrow WHERE placement_id = $1 AND status = 'held'`, [placement_id]);
        if (escrow.rows.length === 0) return res.status(404).json({ error: 'No pending escrow found' });

        await pool.query(
            `UPDATE b2b_escrow SET status='released', released_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
            [escrow.rows[0].id]
        );
        await pool.query('UPDATE placements SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', ['completed', placement_id]);
        await pool.query(`UPDATE placement_invoices SET status='paid', paid_at=CURRENT_TIMESTAMP WHERE placement_id=$1`, [placement_id]);

        res.json({ success: true, message: 'Payment released to candidate' });
    } catch (error) {
        console.error('Release payment error:', error);
        res.status(500).json({ error: 'Failed to release payment' });
    }
});

// ============= PAYFAST INTEGRATION =============
app.post('/api/payfast/create', verifyToken, async (req, res) => {
    try {
        const { amount, item_name, item_description, job_id, candidate_id } = req.body;

        if (!amount || !item_name) {
            return res.status(400).json({ error: 'amount and item_name are required' });
        }

        const merchantId  = process.env.PAYFAST_MERCHANT_ID;
        const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
        const isSandbox   = process.env.PAYFAST_SANDBOX === 'true';

        // CRITICAL: passphrase must be null (not empty string) when not set.
        // Only populate if you have a passphrase configured in your PayFast dashboard.
        const passphrase = (process.env.PAYFAST_PASSPHRASE && process.env.PAYFAST_PASSPHRASE.trim() !== '')
            ? process.env.PAYFAST_PASSPHRASE.trim()
            : null;

        if (!merchantId || !merchantKey) {
            return res.status(500).json({ error: 'PayFast merchant credentials not configured' });
        }

        const orderId     = String(Date.now()); // unique order ID string
        const frontendUrl = (process.env.FRONTEND_URL || `http://localhost:${port}`).replace(/\/$/, '');
        const backendUrl  = (process.env.BACKEND_URL  || frontendUrl).replace(/\/$/, '');
        const amountStr   = parseFloat(amount).toFixed(2);

        // Build form data in PayFast's documented field order.
        // Only include fields that have real values — undefined/null/''/0-ish empties are removed.
        // The signature function will iterate these in insertion order.
        const payfastData = {};

        // Merchant (required)
        payfastData.merchant_id  = merchantId;
        payfastData.merchant_key = merchantKey;

        // URLs (required)
        payfastData.return_url = `${frontendUrl}/payment-success.html`;
        payfastData.cancel_url = `${frontendUrl}/payment-cancel.html`;
        payfastData.notify_url = `${backendUrl}/api/payfast/ipn`;

        // Transaction (required)
        payfastData.m_payment_id = orderId;          // your reference — returned in IPN
        payfastData.amount       = amountStr;
        payfastData.item_name    = item_name.substring(0, 100).trim();

        // Optional but useful
        if (item_description && item_description.trim()) {
            payfastData.item_description = item_description.substring(0, 255).trim();
        }

        // Custom fields — only add if they have values
        if (job_id)       payfastData.custom_str1 = String(job_id);
        if (candidate_id) payfastData.custom_str2 = String(candidate_id);
        payfastData.custom_str3 = String(req.user.id);

        // Email confirmation
        payfastData.email_confirmation   = '1';
        if (req.user.email) payfastData.confirmation_address = req.user.email;

        // Generate signature from payfastData (merchant_key IS included per PayFast PHP SDK)
        const signature = generatePayFastSignature(payfastData, passphrase);
        payfastData.signature = signature;

        console.log('💳 PayFast form data:', JSON.stringify(payfastData, null, 2));

        // Persist pending transaction
        await pool.query(
            `INSERT INTO escrow_transactions (job_id, employer_id, candidate_id, amount, status, transaction_id)
             VALUES ($1, $2, $3, $4, 'pending', $5)`,
            [job_id || null, req.user.id, candidate_id || null, parseFloat(amount), orderId]
        );

        const payfastUrl = isSandbox
            ? 'https://sandbox.payfast.co.za/eng/process'
            : 'https://www.payfast.co.za/eng/process';

        console.log(`✅ PayFast payment created: order ${orderId}, amount R${amountStr}, sandbox=${isSandbox}`);

        res.json({ success: true, payfastUrl, formData: payfastData });
    } catch (error) {
        console.error('PayFast create error:', error);
        res.status(500).json({ error: 'Failed to create payment', details: error.message });
    }
});

// PayFast IPN — must use raw urlencoded body
app.post('/api/payfast/ipn', express.urlencoded({ extended: false }), async (req, res) => {
    try {
        const ipnData = req.body;
        console.log('📩 PayFast IPN received:', ipnData);

        // m_payment_id is our order reference (matches transaction_id in escrow_transactions)
        const { payment_status, m_payment_id: orderId, custom_str1: jobId, pf_payment_id } = ipnData;

        // Optional: verify signature here for security
        // const receivedSig = ipnData.signature;
        // const { signature, ...dataWithoutSig } = ipnData;
        // const expectedSig = generatePayFastSignature(dataWithoutSig, process.env.PAYFAST_PASSPHRASE);
        // if (receivedSig !== expectedSig) { return res.status(400).send('Invalid signature'); }

        if (payment_status === 'COMPLETE') {
            await pool.query(
                `UPDATE escrow_transactions
                 SET status='held', payment_method='payfast', transaction_id=$1, updated_at=CURRENT_TIMESTAMP
                 WHERE transaction_id=$2`,
                [pf_payment_id, orderId]
            );
            if (jobId) {
                await pool.query(`UPDATE business_jobs SET status='in_progress' WHERE id=$1`, [jobId]);
            }
            console.log(`✅ PayFast payment COMPLETE for order: ${orderId}`);
        } else if (payment_status === 'FAILED') {
            await pool.query(
                `UPDATE escrow_transactions SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE transaction_id=$1`,
                [orderId]
            );
            console.log(`❌ PayFast payment FAILED for order: ${orderId}`);
        } else if (payment_status === 'CANCELLED') {
            await pool.query(
                `UPDATE escrow_transactions SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE transaction_id=$1`,
                [orderId]
            );
            console.log(`⚠️ PayFast payment CANCELLED for order: ${orderId}`);
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('PayFast IPN error:', error);
        res.status(500).send('Error');
    }
});

app.get('/api/payfast/status/:orderId', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM escrow_transactions WHERE transaction_id = $1`,
            [req.params.orderId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });

        res.json({ success: true, status: result.rows[0].status, amount: result.rows[0].amount, createdAt: result.rows[0].created_at });
    } catch (error) {
        console.error('Check status error:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

app.post('/api/payfast/release', verifyToken, async (req, res) => {
    try {
        const { escrow_id } = req.body;
        const escrow = await pool.query(`SELECT * FROM escrow_transactions WHERE id = $1 AND status = 'held'`, [escrow_id]);
        if (escrow.rows.length === 0) return res.status(404).json({ error: 'Escrow not found or already released' });

        await pool.query(
            `UPDATE escrow_transactions SET status='released', released_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
            [escrow_id]
        );
        await pool.query(
            `INSERT INTO placements (job_id, employer_id, candidate_id, agreed_salary, fee_percentage, fee_amount, status)
             VALUES ($1,$2,$3,$4,10,$4 * 0.10,'completed')`,
            [escrow.rows[0].job_id, escrow.rows[0].employer_id, escrow.rows[0].candidate_id, escrow.rows[0].amount]
        );

        res.json({ success: true, message: 'Payment released to candidate' });
    } catch (error) {
        console.error('Release error:', error);
        res.status(500).json({ error: 'Failed to release payment' });
    }
});

// ============= SERVER START =============
app.listen(port, () => {
    console.log(`✅ Server running on http://localhost:${port}`);
});