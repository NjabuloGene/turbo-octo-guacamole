require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('./db');
const { hashPassword, comparePassword, generateToken, verifyToken } = require('./auth');
const { compareFaces, generateInterviewQuestions } = require('./geminiServices');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static('uploads'));

// Create uploads folder if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// ============= FILE UPLOAD CONFIGURATION =============
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|webm|ogg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
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

// ============= HEALTH CHECK =============
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        port: port,
        geminiConfigured: !!genAI,
        geminiKeyPresent: !!process.env.GEMINI_API_KEY,
        timestamp: new Date().toISOString()
    });
});

// ============= AUTHENTICATION ROUTES =============
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, user_type = 'freelancer', skills = [], user_role } = req.body;
        
        // Validate required fields
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password are required' });
        }
        
        // Validate user_role (helper or hirer)
        if (!user_role || !['helper', 'hirer', 'admin'].includes(user_role)) {
            return res.status(400).json({ error: 'Please select whether you are a helper (looking for work) or hirer (looking to hire)' });
        }

        // Add this after validating user_role
if (user_role === 'admin') {
    const { adminCode } = req.body;
    //  set in .env file
    if (adminCode !== process.env.ADMIN_SECRET_CODE) {
        return res.status(403).json({ error: 'Invalid admin secret code' });
    }
}
        
        // Check if user already exists
        const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        
        // Hash password
        const passwordHash = await hashPassword(password);
        
        // Ensure user_role column exists
        await pool.query(`
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE users ADD COLUMN user_role VARCHAR(50) DEFAULT 'helper';
                EXCEPTION
                    WHEN duplicate_column THEN 
                        NULL;
                END;
            END;
        $$`);
        
        // Insert new user with role
        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, user_type, skills, user_role)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name, email, user_type, user_role, created_at`,
            [name, email, passwordHash, user_type, skills, user_role]
        );
        
        const newUser = result.rows[0];
        const token = generateToken(newUser);
        
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: newUser,
            token
        });
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
        
        delete user.password_hash;
        const token = generateToken(user);
        
        res.json({
            success: true,
            message: 'Login successful',
            user,
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
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            success: true,
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// ============= FILE UPLOAD ENDPOINTS =============
app.post('/api/upload/profile-pic', verifyToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const fileUrl = `http://localhost:${port}/uploads/${req.file.filename}`;
        res.json({ 
            success: true, 
            url: fileUrl, 
            filename: req.file.filename 
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.post('/api/upload/photo', verifyToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const fileUrl = `http://localhost:${port}/uploads/${req.file.filename}`;
        res.json({ success: true, url: fileUrl, filename: req.file.filename });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.post('/api/upload/document', verifyToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const fileUrl = `http://localhost:${port}/uploads/${req.file.filename}`;
        res.json({ success: true, url: fileUrl, filename: req.file.filename });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.post('/api/upload/video', verifyToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const fileUrl = `http://localhost:${port}/uploads/${req.file.filename}`;
        res.json({ success: true, url: fileUrl, filename: req.file.filename });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// ============= IDENTITY VERIFICATION =============
app.post('/api/verify-identity', verifyToken, upload.fields([
    { name: 'livePhoto', maxCount: 1 },
    { name: 'idPhoto', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('🔐 Starting identity verification...');
        
        if (!req.files || !req.files.livePhoto || !req.files.idPhoto) {
            return res.status(400).json({ 
                error: 'Both live photo and ID photo are required' 
            });
        }
        
        const livePhotoPath = req.files.livePhoto[0].path;
        const idPhotoPath = req.files.idPhoto[0].path;
        
        console.log('📷 Live photo saved to:', livePhotoPath);
        console.log('🪪 ID photo saved to:', idPhotoPath);

        // Use the compareFaces function from geminiServices
        const comparison = await compareFaces(livePhotoPath, idPhotoPath);
        
        // Clean up uploaded files
        try {
            fs.unlinkSync(livePhotoPath);
            fs.unlinkSync(idPhotoPath);
            console.log('🧹 Cleaned up temporary files');
        } catch (cleanupError) {
            console.log('Cleanup warning:', cleanupError.message);
        }
        
        res.json({
            success: true,
            verification: comparison,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Verification error:', error);
        
        // Try to clean up files even on error
        try {
            if (req.files) {
                if (req.files.livePhoto) fs.unlinkSync(req.files.livePhoto[0].path);
                if (req.files.idPhoto) fs.unlinkSync(req.files.idPhoto[0].path);
            }
        } catch (cleanupError) {
            // Ignore cleanup errors
        }
        
        res.status(500).json({ 
            error: 'Failed to verify identity', 
            details: error.message 
        });
    }
});

// ============= INTERVIEW QUESTIONS ENDPOINT =============
app.post('/api/interview/questions', verifyToken, async (req, res) => {
  try {
    const { role, skills, experience, questionCount = 5 } = req.body;
    
    console.log('📝 Generating interview questions for:', { role, skills, experience });
    
    // Default questions if Gemini fails
    const defaultQuestions = [
      { id: 1, question: "Tell me about your experience caring for others.", category: "behavioral", expectedKeywords: ["experience", "care", "compassion"] },
      { id: 2, question: "How do you handle stressful situations?", category: "situational", expectedKeywords: ["calm", "patient", "solution"] },
      { id: 3, question: "Why do you want to work in this field?", category: "general", expectedKeywords: ["passion", "help", "dedication"] },
      { id: 4, question: "Describe a time you had to deal with a difficult client or situation.", category: "behavioral", expectedKeywords: ["conflict", "resolution", "professional"] },
      { id: 5, question: "What are your greatest strengths and weaknesses?", category: "general", expectedKeywords: ["strengths", "weaknesses", "improvement"] }
    ];
    
    // If Gemini is configured, try to get AI-generated questions
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });
        
        const prompt = `Generate ${questionCount} interview questions for a ${role} position.
        
Skills/Experience: ${skills.join(', ')}
Experience level: ${experience}

Return a JSON array with objects containing:
- id: number (1-${questionCount})
- question: the interview question text
- category: "behavioral" or "situational" or "general"
- expectedKeywords: array of 3-5 key terms to look for in answers

Make questions practical, relevant to South African context, and appropriate for the role.
Return ONLY valid JSON array, no other text.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log('📥 Gemini response:', text.substring(0, 200) + '...');
        
        // Try to parse JSON from response
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/);
        const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text;
        const questions = JSON.parse(jsonStr);
        
        return res.json({ success: true, questions, sessionId: Date.now().toString() });
      } catch (geminiError) {
        console.error('❌ Gemini error, using default questions:', geminiError);
        return res.json({ success: true, questions: defaultQuestions.slice(0, questionCount), sessionId: Date.now().toString() });
      }
    } else {
      console.log('⚠️ Gemini not configured, using default questions');
      return res.json({ success: true, questions: defaultQuestions.slice(0, questionCount), sessionId: Date.now().toString() });
    }
  } catch (error) {
    console.error('❌ Interview questions error:', error);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
});

// ============= SUBMIT ANSWER ENDPOINT =============
app.post('/api/interview/submit-answer', verifyToken, async (req, res) => {
  try {
    const { questionId, question, answer, expectedKeywords } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are required' });
    }
    
    console.log('📝 Evaluating answer for question:', questionId);
    
    // Simple evaluation (can be enhanced with Gemini later)
    const score = Math.floor(Math.random() * 30) + 70; // Random score between 70-100
    const strengths = ['Answered the question', 'Showed understanding'];
    const improvements = ['Could provide more detail', 'Consider giving specific examples'];
    
    res.json({
      success: true,
      evaluation: {
        score,
        feedback: 'Your answer was good. Consider providing more specific examples in future responses.',
        strengths,
        improvements,
        keywordMatch: expectedKeywords ? Math.floor(expectedKeywords.length * 0.7) : 0
      }
    });
    
  } catch (error) {
    console.error('❌ Answer evaluation error:', error);
    res.status(500).json({ error: 'Failed to evaluate answer' });
  }
});

// ============= SAVE INTERVIEW RESULTS =============
app.post('/api/interview/save-results', verifyToken, async (req, res) => {
  try {
    const { sessionId, results, totalScore, role, completedAt } = req.body;
    const userId = req.user.id;
    
    // Create interview_results table if it doesn't exist
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
    
    // Save results
    await pool.query(
      `INSERT INTO interview_results 
       (user_id, session_id, results, total_score, role, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, sessionId, JSON.stringify(results), totalScore, role, completedAt]
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
        const { 
            name, role, rate, experience, location, 
            service_type, bio, profile_pic, photos, 
            documents, video 
        } = req.body;
        
        const userId = req.user.id;
        
        // Check if user already has a profile
        const existingProfile = await pool.query(
            'SELECT id FROM profiles WHERE user_id = $1',
            [userId]
        );
        
        if (existingProfile.rows.length > 0) {
            // Update existing profile
            const result = await pool.query(
                `UPDATE profiles 
                 SET name = $1, role = $2, rate = $3, experience = $4, 
                     location = $5, service_type = $6, bio = $7, 
                     profile_pic = $8, photos = $9, documents = $10, 
                     video = $11, updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $12
                 RETURNING id`,
                [name, role, rate, experience, location, service_type, bio, 
                 profile_pic, photos, documents, video, userId]
            );
            
            res.json({ 
                success: true, 
                message: 'Profile updated successfully',
                profileId: result.rows[0].id
            });
        } else {
            // Create new profile
            const result = await pool.query(
                `INSERT INTO profiles 
                 (user_id, name, role, rate, experience, location, 
                  service_type, bio, profile_pic, photos, documents, video)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                 RETURNING id`,
                [userId, name, role, rate, experience, location, service_type, 
                 bio, profile_pic, photos, documents, video]
            );
            
            res.status(201).json({ 
                success: true, 
                message: 'Profile created successfully',
                profileId: result.rows[0].id
            });
        }
    } catch (error) {
        console.error('Profile creation error:', error);
        res.status(500).json({ error: 'Failed to create profile', details: error.message });
    }
});

app.get('/api/profiles', async (req, res) => {
    try {
        const { service } = req.query;
        let query = `
            SELECT p.*, u.email, u.name as user_name
            FROM profiles p
            JOIN users u ON p.user_id = u.id
            WHERE p.is_available = true
        `;
        const params = [];
        
        if (service) {
            query += ` AND p.service_type = $1`;
            params.push(service);
        }
        
        query += ` ORDER BY p.rating DESC, p.created_at DESC LIMIT 50`;
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            profiles: result.rows
        });
    } catch (error) {
        console.error('Get profiles error:', error);
        res.status(500).json({ error: 'Failed to get profiles' });
    }
});

// ============= BROWSE PROFILES (for hirers) =============
app.get('/api/profiles/browse', verifyToken, async (req, res) => {
  try {
    const { search, location, minRating, serviceType } = req.query;
    
    let query = `
      SELECT p.*, u.email, u.name as user_name, u.user_role
      FROM profiles p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_available = true
    `;
    const params = [];
    let paramIndex = 1;
    
    // Add filters
    if (search) {
      query += ` AND (p.name ILIKE $${paramIndex} OR p.role ILIKE $${paramIndex} OR p.bio ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (location) {
      query += ` AND p.location ILIKE $${paramIndex}`;
      params.push(`%${location}%`);
      paramIndex++;
    }
    
    if (serviceType) {
      query += ` AND p.service_type = $${paramIndex}`;
      params.push(serviceType);
      paramIndex++;
    }
    
    if (minRating) {
      query += ` AND p.rating >= $${paramIndex}`;
      params.push(parseFloat(minRating));
      paramIndex++;
    }
    
    query += ` ORDER BY p.rating DESC, p.created_at DESC LIMIT 50`;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      profiles: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Browse profiles error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch profiles' 
    });
  }
});

// ============= GET PROFILE DETAILS (for hirers) =============
app.get('/api/profiles/:id/details', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT p.*, u.email, u.name as user_name, u.created_at as user_since
       FROM profiles p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Profile not found' 
      });
    }
    
    res.json({
      success: true,
      profile: result.rows[0]
    });
  } catch (error) {
    console.error('Get profile details error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch profile' 
    });
  }
});

app.get('/api/profiles/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Search query required' });
        }
        
        const result = await pool.query(
            `SELECT p.*, u.email, u.name as user_name
             FROM profiles p
             JOIN users u ON p.user_id = u.id
             WHERE p.is_available = true 
               AND (p.name ILIKE $1 OR p.role ILIKE $1 OR p.location ILIKE $1 OR p.bio ILIKE $1)
             ORDER BY p.rating DESC
             LIMIT 50`,
            [`%${q}%`]
        );
        
        res.json({
            success: true,
            profiles: result.rows
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/profiles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            `SELECT p.*, u.email, u.name as user_name
             FROM profiles p
             JOIN users u ON p.user_id = u.id
             WHERE p.id = $1`,
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        res.json({
            success: true,
            profile: result.rows[0]
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// ============= ADMIN ENDPOINTS =============

// Get all users (admin only)
app.get('/api/admin/users', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.user_role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Admin privileges required.' 
      });
    }
    
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.user_role, u.user_type, 
             u.created_at, 
             COUNT(DISTINCT p.id) as profile_count,
             COUNT(DISTINCT i.id) as interview_count
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      LEFT JOIN interview_results i ON u.id = i.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    
    res.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch users' 
    });
  }
});

// Get all interview results (admin only)
app.get('/api/admin/interviews', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.user_role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Admin privileges required.' 
      });
    }
    
    const result = await pool.query(`
      SELECT i.*, u.name as user_name, u.email
      FROM interview_results i
      JOIN users u ON i.user_id = u.id
      ORDER BY i.created_at DESC
      LIMIT 100
    `);
    
    res.json({
      success: true,
      interviews: result.rows
    });
  } catch (error) {
    console.error('Admin get interviews error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch interviews' 
    });
  }
});

// Update user role (admin only)
app.put('/api/admin/users/:id/role', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.user_role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Admin privileges required.' 
      });
    }
    
    const { id } = req.params;
    const { user_role } = req.body;
    
    if (!['helper', 'hirer', 'admin'].includes(user_role)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid role' 
      });
    }
    
    await pool.query(
      'UPDATE users SET user_role = $1 WHERE id = $2',
      [user_role, id]
    );
    
    res.json({
      success: true,
      message: 'User role updated successfully'
    });
  } catch (error) {
    console.error('Admin update role error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user role' 
    });
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.user_role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Admin privileges required.' 
      });
    }
    
    const { id } = req.params;
    
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete user' 
    });
  }
});

// Get platform stats (admin only)
app.get('/api/admin/stats', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.user_role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Admin privileges required.' 
      });
    }
    
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
    
    res.json({
      success: true,
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch stats' 
    });
  }
});

// ============= GEMINI TEST ENDPOINT =============
app.get('/api/test-gemini', async (req, res) => {
    try {
        if (!genAI) {
            return res.status(500).json({ error: 'Gemini not configured' });
        }
        const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });
        const result = await model.generateContent("Say hello in one word");
        const response = await result.response;
        const text = response.text();
        res.json({ success: true, message: 'Gemini is working!', response: text });
    } catch (error) {
        console.error('Gemini test error:', error);
        res.status(500).json({ error: 'Gemini test failed', details: error.message });
    }
});


// ============= SAVE/BOOKMARK PROFILE =============
app.post('/api/profiles/:id/save', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        // Check if user is a hirer
        if (req.user.user_role !== 'hirer') {
            return res.status(403).json({ error: 'Only hirers can save profiles' });
        }
        
        // Check if already saved
        const existing = await pool.query(
            'SELECT id FROM saved_profiles WHERE hirer_id = $1 AND profile_id = $2',
            [userId, id]
        );
        
        if (existing.rows.length > 0) {
            // Remove if already saved (toggle)
            await pool.query(
                'DELETE FROM saved_profiles WHERE hirer_id = $1 AND profile_id = $2',
                [userId, id]
            );
            return res.json({ success: true, saved: false, message: 'Profile removed from saved' });
        }
        
        // Save profile
        await pool.query(
            'INSERT INTO saved_profiles (hirer_id, profile_id) VALUES ($1, $2)',
            [userId, id]
        );
        
        res.json({ success: true, saved: true, message: 'Profile saved successfully' });
    } catch (error) {
        console.error('Save profile error:', error);
        res.status(500).json({ error: 'Failed to save profile' });
    }
});

// ============= GET SAVED PROFILES =============
app.get('/api/saved-profiles', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await pool.query(`
            SELECT p.*, u.name as user_name, sp.created_at as saved_at
            FROM saved_profiles sp
            JOIN profiles p ON sp.profile_id = p.id
            JOIN users u ON p.user_id = u.id
            WHERE sp.hirer_id = $1
            ORDER BY sp.created_at DESC
        `, [userId]);
        
        res.json({ success: true, savedProfiles: result.rows });
    } catch (error) {
        console.error('Get saved profiles error:', error);
        res.status(500).json({ error: 'Failed to get saved profiles' });
    }
});

// ============= SEND MESSAGE =============
app.post('/api/messages', verifyToken, async (req, res) => {
    try {
        const { receiver_id, profile_id, message } = req.body;
        const sender_id = req.user.id;
        
        if (!receiver_id || !message) {
            return res.status(400).json({ error: 'Receiver and message are required' });
        }
        
        const result = await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, profile_id, message)
             VALUES ($1, $2, $3, $4)
             RETURNING id, created_at`,
            [sender_id, receiver_id, profile_id, message]
        );
        
        res.json({ 
            success: true, 
            message: 'Message sent successfully',
            messageId: result.rows[0].id,
            created_at: result.rows[0].created_at
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ============= GET CONVERSATIONS =============
app.get('/api/messages/conversations', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await pool.query(`
            SELECT DISTINCT 
                u.id as user_id,
                u.name as user_name,
                u.user_role,
                p.id as profile_id,
                p.name as profile_name,
                p.profile_pic,
                (
                    SELECT message FROM messages m2 
                    WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id) 
                       OR (m2.sender_id = u.id AND m2.receiver_id = $1)
                    ORDER BY m2.created_at DESC 
                    LIMIT 1
                ) as last_message,
                (
                    SELECT created_at FROM messages m2 
                    WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id) 
                       OR (m2.sender_id = u.id AND m2.receiver_id = $1)
                    ORDER BY m2.created_at DESC 
                    LIMIT 1
                ) as last_message_time,
                COUNT(CASE WHEN messages.receiver_id = $1 AND messages.is_read = false THEN 1 END) as unread_count
            FROM messages
            JOIN users u ON (u.id = messages.sender_id OR u.id = messages.receiver_id)
            LEFT JOIN profiles p ON p.user_id = u.id
            WHERE messages.sender_id = $1 OR messages.receiver_id = $1
            GROUP BY u.id, u.name, u.user_role, p.id, p.name, p.profile_pic
            ORDER BY last_message_time DESC
        `, [userId]);
        
        res.json({ success: true, conversations: result.rows });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
});

// ============= GET MESSAGES WITH USER =============
app.get('/api/messages/:userId', verifyToken, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const { userId } = req.params;
        
        // Mark messages as read
        await pool.query(
            `UPDATE messages 
             SET is_read = true 
             WHERE sender_id = $1 AND receiver_id = $2`,
            [userId, currentUserId]
        );
        
        const result = await pool.query(`
            SELECT m.*, u.name as sender_name, u.user_role as sender_role
            FROM messages m
            JOIN users u ON m.sender_id = u.id
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

// ============= CREATE HIRE REQUEST =============
app.post('/api/hire-requests', verifyToken, async (req, res) => {
    try {
        const { helper_id, profile_id, start_date, duration, message } = req.body;
        const hirer_id = req.user.id;
        
        if (req.user.user_role !== 'hirer') {
            return res.status(403).json({ error: 'Only hirers can create hire requests' });
        }
        
        // Check if request already exists
        const existing = await pool.query(
            `SELECT id FROM hire_requests 
             WHERE hirer_id = $1 AND helper_id = $2 AND status = 'pending'`,
            [hirer_id, helper_id]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'You already have a pending request for this helper' });
        }
        
        const result = await pool.query(
            `INSERT INTO hire_requests (hirer_id, helper_id, profile_id, start_date, duration, message)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, created_at`,
            [hirer_id, helper_id, profile_id, start_date, duration, message]
        );
        
        res.json({ 
            success: true, 
            message: 'Hire request sent successfully',
            requestId: result.rows[0].id
        });
    } catch (error) {
        console.error('Create hire request error:', error);
        res.status(500).json({ error: 'Failed to create hire request' });
    }
});

// ============= GET HIRE REQUESTS =============
app.get('/api/hire-requests', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.user_role;
        
        let query;
        let params;
        
        if (userRole === 'hirer') {
            query = `
                SELECT hr.*, 
                       p.name as helper_name, p.profile_pic as helper_pic, p.role as helper_role,
                       pr.name as profile_name
                FROM hire_requests hr
                JOIN profiles p ON hr.helper_id = p.user_id
                LEFT JOIN profiles pr ON hr.profile_id = pr.id
                WHERE hr.hirer_id = $1
                ORDER BY hr.created_at DESC
            `;
            params = [userId];
        } else if (userRole === 'helper') {
            query = `
                SELECT hr.*, 
                       u.name as hirer_name, u.email as hirer_email,
                       pr.name as profile_name
                FROM hire_requests hr
                JOIN users u ON hr.hirer_id = u.id
                LEFT JOIN profiles pr ON hr.profile_id = pr.id
                WHERE hr.helper_id = $1
                ORDER BY hr.created_at DESC
            `;
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

// ============= UPDATE HIRE REQUEST STATUS =============
app.put('/api/hire-requests/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user.id;
        
        if (!['pending', 'accepted', 'rejected', 'completed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        // Check if user is authorized (helper can update their own requests)
        const hireRequest = await pool.query(
            'SELECT * FROM hire_requests WHERE id = $1',
            [id]
        );
        
        if (hireRequest.rows.length === 0) {
            return res.status(404).json({ error: 'Hire request not found' });
        }
        
        const request = hireRequest.rows[0];
        
        if (req.user.user_role === 'helper' && request.helper_id !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        if (req.user.user_role === 'hirer' && request.hirer_id !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        await pool.query(
            `UPDATE hire_requests 
             SET status = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2`,
            [status, id]
        );
        
        res.json({ success: true, message: `Hire request ${status}` });
    } catch (error) {
        console.error('Update hire request error:', error);
        res.status(500).json({ error: 'Failed to update hire request' });
    }
});

// ============= SERVER START =============
app.listen(port, () => {
    console.log(`✅ Server running on http://localhost:${port}`);
});

// Addition index.js - Ensure login returns user_role
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
        
        // Remove sensitive data
        delete user.password_hash;
        
        // Ensure user_role exists (default to 'helper' if null)
        if (!user.user_role) {
            user.user_role = 'helper';
            await pool.query('UPDATE users SET user_role = $1 WHERE id = $2', ['helper', user.id]);
        }
        
        console.log('User logging in:', { id: user.id, email: user.email, role: user.user_role });
        
        const token = generateToken(user);
        
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

// ============= GET CONVERSATIONS (FIXED) =============
app.get('/api/messages/conversations', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await pool.query(`
            SELECT DISTINCT 
                u.id as user_id,
                u.name as user_name,
                u.user_role,
                p.id as profile_id,
                p.name as profile_name,
                p.profile_pic,
                (
                    SELECT message FROM messages m2 
                    WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id) 
                       OR (m2.sender_id = u.id AND m2.receiver_id = $1)
                    ORDER BY m2.created_at DESC 
                    LIMIT 1
                ) as last_message,
                (
                    SELECT created_at FROM messages m2 
                    WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id) 
                       OR (m2.sender_id = u.id AND m2.receiver_id = $1)
                    ORDER BY m2.created_at DESC 
                    LIMIT 1
                ) as last_message_time,
                COUNT(CASE WHEN messages.receiver_id = $1 AND messages.is_read = false THEN 1 END) as unread_count
            FROM messages
            JOIN users u ON (u.id = messages.sender_id OR u.id = messages.receiver_id)
            LEFT JOIN profiles p ON p.user_id = u.id
            WHERE (messages.sender_id = $1 OR messages.receiver_id = $1)
                AND u.id != $1
            GROUP BY u.id, u.name, u.user_role, p.id, p.name, p.profile_pic
            ORDER BY last_message_time DESC
        `, [userId]);
        
        res.json({
            success: true,
            conversations: result.rows
        });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
});

// ============= GET MESSAGES WITH USER (FIXED) =============
app.get('/api/messages/:userId', verifyToken, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const { userId } = req.params;
        
        // Mark messages as read
        await pool.query(
            `UPDATE messages 
             SET is_read = true 
             WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false`,
            [userId, currentUserId]
        );
        
        const result = await pool.query(`
            SELECT m.*, 
                   u.name as sender_name, 
                   u.user_role as sender_role,
                   (SELECT name FROM users WHERE id = m.receiver_id) as receiver_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE (m.sender_id = $1 AND m.receiver_id = $2)
               OR (m.sender_id = $2 AND m.receiver_id = $1)
            ORDER BY m.created_at ASC
        `, [currentUserId, userId]);
        
        res.json({
            success: true,
            messages: result.rows,
            other_user: {
                id: userId,
                name: result.rows[0]?.sender_id == userId ? result.rows[0]?.sender_name : result.rows[0]?.receiver_name
            }
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// ============= BUSINESS REGISTRATION =============
app.post('/api/business/register', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') {
            return res.status(403).json({ error: 'Only employers can register a business' });
        }
        
        const { company_name, registration_number, tax_number, industry, company_size, website } = req.body;
        
        if (!company_name) {
            return res.status(400).json({ error: 'Company name is required' });
        }
        
        const result = await pool.query(
            `INSERT INTO businesses (user_id, company_name, registration_number, tax_number, industry, company_size, website)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, company_name, verified`,
            [req.user.id, company_name, registration_number, tax_number, industry, company_size, website]
        );
        
        res.status(201).json({
            success: true,
            message: 'Business registered successfully',
            business: result.rows[0]
        });
    } catch (error) {
        console.error('Business registration error:', error);
        res.status(500).json({ error: 'Failed to register business' });
    }
});

// Get business details
app.get('/api/business', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM businesses WHERE user_id = $1',
            [req.user.id]
        );
        
        res.json({
            success: true,
            business: result.rows[0] || null
        });
    } catch (error) {
        console.error('Get business error:', error);
        res.status(500).json({ error: 'Failed to get business' });
    }
});

// ============= JOB POSTING (B2B) =============
app.post('/api/business/jobs', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') {
            return res.status(403).json({ error: 'Only employers can post jobs' });
        }
        
        // Get business
        const business = await pool.query(
            'SELECT id FROM businesses WHERE user_id = $1',
            [req.user.id]
        );
        
        if (business.rows.length === 0) {
            return res.status(400).json({ error: 'Please register your business first' });
        }
        
        const { title, description, employment_type, salary_min, salary_max, location, remote_allowed, requirements, benefits, experience_required } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({ error: 'Title and description are required' });
        }
        
        const result = await pool.query(
            `INSERT INTO business_jobs (business_id, title, description, employment_type, salary_min, salary_max, location, remote_allowed, requirements, benefits, experience_required)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [business.rows[0].id, title, description, employment_type, salary_min, salary_max, location, remote_allowed || false, requirements || [], benefits || [], experience_required]
        );
        
        res.status(201).json({
            success: true,
            message: 'Job posted successfully',
            jobId: result.rows[0].id
        });
    } catch (error) {
        console.error('Post job error:', error);
        res.status(500).json({ error: 'Failed to post job' });
    }
});

// Get all jobs (for candidates)
app.get('/api/business/jobs', async (req, res) => {
    try {
        const { search, location, employment_type, min_salary, max_salary } = req.query;
        
        let query = `
            SELECT j.*, b.company_name, b.industry,
                   (SELECT COUNT(*) FROM job_applications WHERE job_id = j.id) as application_count
            FROM business_jobs j
            JOIN businesses b ON j.business_id = b.id
            WHERE j.status = 'open'
        `;
        const params = [];
        let paramIndex = 1;
        
        if (search) {
            query += ` AND (j.title ILIKE $${paramIndex} OR j.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        if (location) {
            query += ` AND j.location ILIKE $${paramIndex}`;
            params.push(`%${location}%`);
            paramIndex++;
        }
        
        if (employment_type) {
            query += ` AND j.employment_type = $${paramIndex}`;
            params.push(employment_type);
            paramIndex++;
        }
        
        if (min_salary) {
            query += ` AND j.salary_max >= $${paramIndex}`;
            params.push(parseFloat(min_salary));
            paramIndex++;
        }
        
        query += ` ORDER BY j.created_at DESC LIMIT 50`;
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            jobs: result.rows
        });
    } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({ error: 'Failed to get jobs' });
    }
});

// Get single job
app.get('/api/business/jobs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Increment view count
        await pool.query(
            'UPDATE business_jobs SET view_count = view_count + 1 WHERE id = $1',
            [id]
        );
        
        const result = await pool.query(`
            SELECT j.*, b.company_name, b.industry, b.logo_url, b.verified as business_verified
            FROM business_jobs j
            JOIN businesses b ON j.business_id = b.id
            WHERE j.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }
        
        // Check if user has applied
        let hasApplied = false;
        let applicationStatus = null;
        
        if (req.user) {
            const applied = await pool.query(
                'SELECT status FROM job_applications WHERE job_id = $1 AND candidate_id = $2',
                [id, req.user.id]
            );
            if (applied.rows.length > 0) {
                hasApplied = true;
                applicationStatus = applied.rows[0].status;
            }
        }
        
        res.json({
            success: true,
            job: result.rows[0],
            hasApplied,
            applicationStatus
        });
    } catch (error) {
        console.error('Get job error:', error);
        res.status(500).json({ error: 'Failed to get job' });
    }
});

// ============= JOB APPLICATIONS =============
app.post('/api/business/jobs/:id/apply', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'helper') {
            return res.status(403).json({ error: 'Only helpers can apply for jobs' });
        }
        
        const { id } = req.params;
        const { cover_letter, expected_salary } = req.body;
        
        // Check if already applied
        const existing = await pool.query(
            'SELECT id FROM job_applications WHERE job_id = $1 AND candidate_id = $2',
            [id, req.user.id]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'You have already applied for this job' });
        }
        
        // Get user's profile
        const profile = await pool.query(
            'SELECT id FROM profiles WHERE user_id = $1',
            [req.user.id]
        );
        
        const result = await pool.query(
            `INSERT INTO job_applications (job_id, candidate_id, profile_id, cover_letter, expected_salary)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [id, req.user.id, profile.rows[0]?.id || null, cover_letter || '', expected_salary || null]
        );
        
        // Update application count
        await pool.query(
            'UPDATE business_jobs SET application_count = application_count + 1 WHERE id = $1',
            [id]
        );
        
        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            applicationId: result.rows[0].id
        });
    } catch (error) {
        console.error('Apply error:', error);
        res.status(500).json({ error: 'Failed to apply for job' });
    }
});

// Get my applications (for candidates)
app.get('/api/business/my-applications', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'helper') {
            return res.status(403).json({ error: 'Only helpers can view applications' });
        }
        
        const result = await pool.query(`
            SELECT a.*, j.title, j.salary_min, j.salary_max, j.location, j.employment_type,
                   b.company_name, b.industry
            FROM job_applications a
            JOIN business_jobs j ON a.job_id = j.id
            JOIN businesses b ON j.business_id = b.id
            WHERE a.candidate_id = $1
            ORDER BY a.created_at DESC
        `, [req.user.id]);
        
        res.json({
            success: true,
            applications: result.rows
        });
    } catch (error) {
        console.error('Get applications error:', error);
        res.status(500).json({ error: 'Failed to get applications' });
    }
});

// Get applications for my jobs (for employers)
app.get('/api/business/my-job-applications', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') {
            return res.status(403).json({ error: 'Only employers can view applications' });
        }
        
        // Get business
        const business = await pool.query(
            'SELECT id FROM businesses WHERE user_id = $1',
            [req.user.id]
        );
        
        if (business.rows.length === 0) {
            return res.json({ success: true, applications: [] });
        }
        
        const result = await pool.query(`
            SELECT a.*, u.name as candidate_name, u.email as candidate_email,
                   p.profile_pic, p.role, p.rating, p.experience,
                   j.title as job_title
            FROM job_applications a
            JOIN business_jobs j ON a.job_id = j.id
            JOIN users u ON a.candidate_id = u.id
            LEFT JOIN profiles p ON a.candidate_id = p.user_id
            WHERE j.business_id = $1
            ORDER BY a.created_at DESC
        `, [business.rows[0].id]);
        
        res.json({
            success: true,
            applications: result.rows
        });
    } catch (error) {
        console.error('Get job applications error:', error);
        res.status(500).json({ error: 'Failed to get applications' });
    }
});

// Update application status
app.put('/api/business/applications/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        
        if (!['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        // Verify ownership
        const application = await pool.query(`
            SELECT a.*, j.business_id
            FROM job_applications a
            JOIN business_jobs j ON a.job_id = j.id
            WHERE a.id = $1
        `, [id]);
        
        if (application.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        const business = await pool.query(
            'SELECT id FROM businesses WHERE user_id = $1',
            [req.user.id]
        );
        
        if (application.rows[0].business_id !== business.rows[0]?.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        await pool.query(
            'UPDATE job_applications SET status = $1, notes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [status, notes || '', id]
        );
        
        // If hired, create placement
        if (status === 'hired') {
            const job = await pool.query(
                'SELECT * FROM business_jobs WHERE id = $1',
                [application.rows[0].job_id]
            );
            
            const salary = job.rows[0].salary_max || job.rows[0].salary_min || 0;
            const feePercentage = 12; // 12% placement fee
            const feeAmount = salary * (feePercentage / 100);
            
            const placement = await pool.query(
                `INSERT INTO placements (business_id, candidate_id, job_id, agreed_salary, fee_percentage, fee_amount, start_date, probation_end_date)
                 VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days')
                 RETURNING id`,
                [business.rows[0].id, application.rows[0].candidate_id, application.rows[0].job_id, salary, feePercentage, feeAmount]
            );
            
            // Create invoice
            const invoiceNumber = 'INV-' + Date.now() + '-' + placement.rows[0].id;
            await pool.query(
                `INSERT INTO placement_invoices (business_id, placement_id, invoice_number, amount, due_date)
                 VALUES ($1, $2, $3, $4, CURRENT_DATE + INTERVAL '14 days')`,
                [business.rows[0].id, placement.rows[0].id, invoiceNumber, feeAmount]
            );
        }
        
        res.json({
            success: true,
            message: `Application ${status}`
        });
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
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [req.user.id, job_id, title, event_type, event_date, start_time, end_time, notes]
        );
        
        res.status(201).json({
            success: true,
            message: 'Event added to calendar',
            eventId: result.rows[0].id
        });
    } catch (error) {
        console.error('Add calendar event error:', error);
        res.status(500).json({ error: 'Failed to add event' });
    }
});

app.get('/api/calendar/events', verifyToken, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        let query = `
            SELECT ce.*, j.title as job_title
            FROM calendar_events ce
            LEFT JOIN business_jobs j ON ce.job_id = j.id
            WHERE ce.user_id = $1
        `;
        const params = [req.user.id];
        
        if (start_date && end_date) {
            query += ` AND ce.event_date BETWEEN $2 AND $3`;
            params.push(start_date, end_date);
        }
        
        query += ` ORDER BY ce.event_date ASC, ce.start_time ASC`;
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            events: result.rows
        });
    } catch (error) {
        console.error('Get calendar events error:', error);
        res.status(500).json({ error: 'Failed to get events' });
    }
});

// ============= FIXED MESSAGING ENDPOINTS =============
// Get conversations (FIXED - includes both sent and received)
app.get('/api/messages/conversations', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await pool.query(`
            SELECT DISTINCT 
                u.id as user_id,
                u.name as user_name,
                u.user_role,
                p.id as profile_id,
                p.name as profile_name,
                p.profile_pic,
                (
                    SELECT message FROM messages m2 
                    WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id) 
                       OR (m2.sender_id = u.id AND m2.receiver_id = $1)
                    ORDER BY m2.created_at DESC 
                    LIMIT 1
                ) as last_message,
                (
                    SELECT created_at FROM messages m2 
                    WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id) 
                       OR (m2.sender_id = u.id AND m2.receiver_id = $1)
                    ORDER BY m2.created_at DESC 
                    LIMIT 1
                ) as last_message_time,
                COUNT(CASE WHEN m.receiver_id = $1 AND m.is_read = false THEN 1 END) as unread_count
            FROM messages m
            JOIN users u ON (u.id = m.sender_id OR u.id = m.receiver_id)
            LEFT JOIN profiles p ON p.user_id = u.id
            WHERE (m.sender_id = $1 OR m.receiver_id = $1) AND u.id != $1
            GROUP BY u.id, u.name, u.user_role, p.id, p.name, p.profile_pic
            ORDER BY last_message_time DESC
        `, [userId]);
        
        res.json({
            success: true,
            conversations: result.rows
        });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
});

// Get messages with user (FIXED)
app.get('/api/messages/:userId', verifyToken, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const { userId } = req.params;
        
        // Mark messages as read
        await pool.query(
            `UPDATE messages 
             SET is_read = true 
             WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false`,
            [userId, currentUserId]
        );
        
        const result = await pool.query(`
            SELECT m.*, 
                   u.name as sender_name, 
                   u.user_role as sender_role
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE (m.sender_id = $1 AND m.receiver_id = $2)
               OR (m.sender_id = $2 AND m.receiver_id = $1)
            ORDER BY m.created_at ASC
        `, [currentUserId, userId]);
        
        res.json({
            success: true,
            messages: result.rows,
            other_user: {
                id: userId,
                name: result.rows[0]?.sender_id == userId ? result.rows[0]?.sender_name : result.rows[0]?.receiver_name
            }
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Send message (FIXED)
app.post('/api/messages', verifyToken, async (req, res) => {
    try {
        const { receiver_id, profile_id, message } = req.body;
        const sender_id = req.user.id;
        
        if (!receiver_id || !message) {
            return res.status(400).json({ error: 'Receiver and message are required' });
        }
        
        const result = await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, profile_id, message, is_read)
             VALUES ($1, $2, $3, $4, false)
             RETURNING id, created_at`,
            [sender_id, receiver_id, profile_id, message]
        );
        
        res.json({ 
            success: true, 
            message: 'Message sent successfully',
            messageId: result.rows[0].id,
            created_at: result.rows[0].created_at
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get unread message count
app.get('/api/messages/unread/count', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT COUNT(*) as count FROM messages WHERE receiver_id = $1 AND is_read = false',
            [req.user.id]
        );
        
        res.json({
            success: true,
            unreadCount: parseInt(result.rows[0].count)
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

// ============= ESCROW ENDPOINTS (B2B) =============
app.post('/api/b2b/escrow/deposit', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') {
            return res.status(403).json({ error: 'Only employers can deposit funds' });
        }
        
        const { placement_id, amount, payment_method } = req.body;
        
        const placement = await pool.query(
            'SELECT * FROM placements WHERE id = $1',
            [placement_id]
        );
        
        if (placement.rows.length === 0) {
            return res.status(404).json({ error: 'Placement not found' });
        }
        
        const result = await pool.query(
            `INSERT INTO b2b_escrow (placement_id, business_id, candidate_id, amount, payment_method, status)
             VALUES ($1, $2, $3, $4, $5, 'held')
             RETURNING id`,
            [placement_id, placement.rows[0].business_id, placement.rows[0].candidate_id, amount, payment_method]
        );
        
        // Update placement status
        await pool.query(
            'UPDATE placements SET status = $1 WHERE id = $2',
            ['active', placement_id]
        );
        
        res.json({
            success: true,
            message: 'Payment deposited to escrow',
            escrowId: result.rows[0].id
        });
    } catch (error) {
        console.error('Deposit error:', error);
        res.status(500).json({ error: 'Failed to deposit funds' });
    }
});

app.post('/api/b2b/escrow/release', verifyToken, async (req, res) => {
    try {
        const { placement_id } = req.body;
        
        const escrow = await pool.query(
            'SELECT * FROM b2b_escrow WHERE placement_id = $1 AND status = $2',
            [placement_id, 'held']
        );
        
        if (escrow.rows.length === 0) {
            return res.status(404).json({ error: 'No pending escrow found' });
        }
        
        await pool.query(
            `UPDATE b2b_escrow 
             SET status = 'released', released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [escrow.rows[0].id]
        );
        
        // Update placement
        await pool.query(
            'UPDATE placements SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['completed', placement_id]
        );
        
        // Mark invoice as paid
        await pool.query(
            `UPDATE placement_invoices 
             SET status = 'paid', paid_at = CURRENT_TIMESTAMP 
             WHERE placement_id = $1`,
            [placement_id]
        );
        
        res.json({
            success: true,
            message: 'Payment released to candidate'
        });
    } catch (error) {
        console.error('Release payment error:', error);
        res.status(500).json({ error: 'Failed to release payment' });
    }
});

// Add these to your existing index.js (after your existing routes)

// ============= BUSINESS REGISTRATION =============
app.post('/api/business/register', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') {
            return res.status(403).json({ error: 'Only employers can register a business' });
        }
        
        const { company_name, registration_number, tax_number, industry, company_size, website } = req.body;
        
        if (!company_name) {
            return res.status(400).json({ error: 'Company name is required' });
        }
        
        const result = await pool.query(
            `INSERT INTO businesses (user_id, company_name, registration_number, tax_number, industry, company_size, website)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, company_name, verified`,
            [req.user.id, company_name, registration_number, tax_number, industry, company_size, website]
        );
        
        res.status(201).json({
            success: true,
            message: 'Business registered successfully',
            business: result.rows[0]
        });
    } catch (error) {
        console.error('Business registration error:', error);
        res.status(500).json({ error: 'Failed to register business' });
    }
});

app.get('/api/business', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM businesses WHERE user_id = $1',
            [req.user.id]
        );
        
        res.json({
            success: true,
            business: result.rows[0] || null
        });
    } catch (error) {
        console.error('Get business error:', error);
        res.status(500).json({ error: 'Failed to get business' });
    }
});

// ============= JOB POSTING (B2B) =============
app.post('/api/business/jobs', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') {
            return res.status(403).json({ error: 'Only employers can post jobs' });
        }
        
        const business = await pool.query(
            'SELECT id FROM businesses WHERE user_id = $1',
            [req.user.id]
        );
        
        if (business.rows.length === 0) {
            return res.status(400).json({ error: 'Please register your business first' });
        }
        
        const { title, description, employment_type, salary_min, salary_max, location, remote_allowed, requirements, benefits, experience_required } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({ error: 'Title and description are required' });
        }
        
        const result = await pool.query(
            `INSERT INTO business_jobs (business_id, title, description, employment_type, salary_min, salary_max, location, remote_allowed, requirements, benefits, experience_required)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [business.rows[0].id, title, description, employment_type, salary_min, salary_max, location, remote_allowed || false, requirements || [], benefits || [], experience_required]
        );
        
        res.status(201).json({
            success: true,
            message: 'Job posted successfully',
            jobId: result.rows[0].id
        });
    } catch (error) {
        console.error('Post job error:', error);
        res.status(500).json({ error: 'Failed to post job' });
    }
});

app.get('/api/business/jobs', async (req, res) => {
    try {
        const { search, location, employment_type, min_salary, max_salary } = req.query;
        
        let query = `
            SELECT j.*, b.company_name, b.industry,
                   (SELECT COUNT(*) FROM job_applications WHERE job_id = j.id) as application_count
            FROM business_jobs j
            JOIN businesses b ON j.business_id = b.id
            WHERE j.status = 'open'
        `;
        const params = [];
        let paramIndex = 1;
        
        if (search) {
            query += ` AND (j.title ILIKE $${paramIndex} OR j.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        if (location) {
            query += ` AND j.location ILIKE $${paramIndex}`;
            params.push(`%${location}%`);
            paramIndex++;
        }
        
        if (employment_type) {
            query += ` AND j.employment_type = $${paramIndex}`;
            params.push(employment_type);
            paramIndex++;
        }
        
        if (min_salary) {
            query += ` AND j.salary_max >= $${paramIndex}`;
            params.push(parseFloat(min_salary));
            paramIndex++;
        }
        
        query += ` ORDER BY j.created_at DESC LIMIT 50`;
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            jobs: result.rows
        });
    } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({ error: 'Failed to get jobs' });
    }
});

app.get('/api/business/jobs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query('UPDATE business_jobs SET view_count = view_count + 1 WHERE id = $1', [id]);
        
        const result = await pool.query(`
            SELECT j.*, b.company_name, b.industry, b.logo_url, b.verified as business_verified
            FROM business_jobs j
            JOIN businesses b ON j.business_id = b.id
            WHERE j.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }
        
        let hasApplied = false;
        let applicationStatus = null;
        
        if (req.user) {
            const applied = await pool.query(
                'SELECT status FROM job_applications WHERE job_id = $1 AND candidate_id = $2',
                [id, req.user.id]
            );
            if (applied.rows.length > 0) {
                hasApplied = true;
                applicationStatus = applied.rows[0].status;
            }
        }
        
        res.json({
            success: true,
            job: result.rows[0],
            hasApplied,
            applicationStatus
        });
    } catch (error) {
        console.error('Get job error:', error);
        res.status(500).json({ error: 'Failed to get job' });
    }
});

// ============= JOB APPLICATIONS =============
app.post('/api/business/jobs/:id/apply', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'helper') {
            return res.status(403).json({ error: 'Only helpers can apply for jobs' });
        }
        
        const { id } = req.params;
        const { cover_letter, expected_salary } = req.body;
        
        const existing = await pool.query(
            'SELECT id FROM job_applications WHERE job_id = $1 AND candidate_id = $2',
            [id, req.user.id]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'You have already applied for this job' });
        }
        
        const profile = await pool.query('SELECT id FROM profiles WHERE user_id = $1', [req.user.id]);
        
        const result = await pool.query(
            `INSERT INTO job_applications (job_id, candidate_id, profile_id, cover_letter, expected_salary)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [id, req.user.id, profile.rows[0]?.id || null, cover_letter || '', expected_salary || null]
        );
        
        await pool.query('UPDATE business_jobs SET application_count = application_count + 1 WHERE id = $1', [id]);
        
        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            applicationId: result.rows[0].id
        });
    } catch (error) {
        console.error('Apply error:', error);
        res.status(500).json({ error: 'Failed to apply for job' });
    }
});

app.get('/api/business/my-applications', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'helper') {
            return res.status(403).json({ error: 'Only helpers can view applications' });
        }
        
        const result = await pool.query(`
            SELECT a.*, j.title, j.salary_min, j.salary_max, j.location, j.employment_type,
                   b.company_name, b.industry
            FROM job_applications a
            JOIN business_jobs j ON a.job_id = j.id
            JOIN businesses b ON j.business_id = b.id
            WHERE a.candidate_id = $1
            ORDER BY a.created_at DESC
        `, [req.user.id]);
        
        res.json({
            success: true,
            applications: result.rows
        });
    } catch (error) {
        console.error('Get applications error:', error);
        res.status(500).json({ error: 'Failed to get applications' });
    }
});

app.get('/api/business/my-job-applications', verifyToken, async (req, res) => {
    try {
        if (req.user.user_role !== 'hirer') {
            return res.status(403).json({ error: 'Only employers can view applications' });
        }
        
        const business = await pool.query('SELECT id FROM businesses WHERE user_id = $1', [req.user.id]);
        
        if (business.rows.length === 0) {
            return res.json({ success: true, applications: [] });
        }
        
        const result = await pool.query(`
            SELECT a.*, u.name as candidate_name, u.email as candidate_email,
                   p.profile_pic, p.role, p.rating, p.experience,
                   j.title as job_title
            FROM job_applications a
            JOIN business_jobs j ON a.job_id = j.id
            JOIN users u ON a.candidate_id = u.id
            LEFT JOIN profiles p ON a.candidate_id = p.user_id
            WHERE j.business_id = $1
            ORDER BY a.created_at DESC
        `, [business.rows[0].id]);
        
        res.json({
            success: true,
            applications: result.rows
        });
    } catch (error) {
        console.error('Get job applications error:', error);
        res.status(500).json({ error: 'Failed to get applications' });
    }
});

app.put('/api/business/applications/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        
        if (!['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const application = await pool.query(`
            SELECT a.*, j.business_id
            FROM job_applications a
            JOIN business_jobs j ON a.job_id = j.id
            WHERE a.id = $1
        `, [id]);
        
        if (application.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        const business = await pool.query('SELECT id FROM businesses WHERE user_id = $1', [req.user.id]);
        
        if (application.rows[0].business_id !== business.rows[0]?.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
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
                 VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days')
                 RETURNING id`,
                [business.rows[0].id, application.rows[0].candidate_id, application.rows[0].job_id, salary, feePercentage, feeAmount]
            );
            
            const invoiceNumber = 'INV-' + Date.now() + '-' + placement.rows[0].id;
            await pool.query(
                `INSERT INTO placement_invoices (business_id, placement_id, invoice_number, amount, due_date)
                 VALUES ($1, $2, $3, $4, CURRENT_DATE + INTERVAL '14 days')`,
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
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
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
        
        let query = `SELECT ce.*, j.title as job_title FROM calendar_events ce LEFT JOIN business_jobs j ON ce.job_id = j.id WHERE ce.user_id = $1`;
        const params = [req.user.id];
        
        if (start_date && end_date) {
            query += ` AND ce.event_date BETWEEN $2 AND $3`;
            params.push(start_date, end_date);
        }
        
        query += ` ORDER BY ce.event_date ASC, ce.start_time ASC`;
        
        const result = await pool.query(query, params);
        res.json({ success: true, events: result.rows });
    } catch (error) {
        console.error('Get calendar events error:', error);
        res.status(500).json({ error: 'Failed to get events' });
    }
});

// ============= FIXED MESSAGING ENDPOINTS =============
app.get('/api/messages/conversations', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await pool.query(`
            SELECT DISTINCT 
                u.id as user_id, u.name as user_name, u.user_role,
                p.id as profile_id, p.name as profile_name, p.profile_pic,
                (SELECT message FROM messages m2 WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id) OR (m2.sender_id = u.id AND m2.receiver_id = $1) ORDER BY m2.created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages m2 WHERE (m2.sender_id = $1 AND m2.receiver_id = u.id) OR (m2.sender_id = u.id AND m2.receiver_id = $1) ORDER BY m2.created_at DESC LIMIT 1) as last_message_time,
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

app.get('/api/messages/:userId', verifyToken, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const { userId } = req.params;
        
        await pool.query(`UPDATE messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false`, [userId, currentUserId]);
        
        const result = await pool.query(`
            SELECT m.*, u.name as sender_name, u.user_role as sender_role
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE (m.sender_id = $1 AND m.receiver_id = $2) OR (m.sender_id = $2 AND m.receiver_id = $1)
            ORDER BY m.created_at ASC
        `, [currentUserId, userId]);
        
        res.json({ success: true, messages: result.rows });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

app.post('/api/messages', verifyToken, async (req, res) => {
    try {
        const { receiver_id, profile_id, message } = req.body;
        const sender_id = req.user.id;
        
        if (!receiver_id || !message) {
            return res.status(400).json({ error: 'Receiver and message are required' });
        }
        
        const result = await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, profile_id, message, is_read)
             VALUES ($1, $2, $3, $4, false)
             RETURNING id, created_at`,
            [sender_id, receiver_id, profile_id, message]
        );
        
        res.json({ success: true, message: 'Message sent successfully', messageId: result.rows[0].id, created_at: result.rows[0].created_at });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.get('/api/messages/unread/count', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) as count FROM messages WHERE receiver_id = $1 AND is_read = false', [req.user.id]);
        res.json({ success: true, unreadCount: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

// ============= USER PROFILE UPDATE =============
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