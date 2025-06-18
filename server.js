const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const basicAuth = require('express-basic-auth');

const app = express();

// Use Railway's provided PORT or fallback to 8000
const PORT = process.env.PORT || 8000;

// Environment-based password (more secure for production)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'pakistanmc';

// Basic Authentication
app.use(basicAuth({
    users: { 'admin': ADMIN_PASSWORD },
    challenge: true,
    unauthorizedResponse: 'Access denied'
}));

// Enhanced CORS configuration for Railway
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('.'));

// Data file path - Railway persistent storage
const DATA_FILE = path.join(__dirname, 'data.json');

// Initialize data
let jsonData = [];

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            jsonData = JSON.parse(data);
            if (!Array.isArray(jsonData)) {
                console.warn('Data is not an array - resetting to empty array');
                jsonData = [];
                saveData();
            }
            console.log(`Loaded ${jsonData.length} records from data.json`);
        } else {
            console.log('No data.json found, creating new file');
            saveData();
        }
    } catch (err) {
        console.error('Error loading data.json:', err);
        jsonData = [];
        saveData();
    }
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(jsonData, null, 2));
        console.log(`Saved ${jsonData.length} records to data.json`);
    } catch (err) {
        console.error('Error saving data.json:', err);
        throw err;
    }
}

// Load initial data
loadData();

// Routes

// Root route - redirect to dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard.html');
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        records: jsonData.length,
        environment: process.env.NODE_ENV || 'development'
    });
});

// API endpoint to get data
app.get('/api/data', (req, res) => {
    try {
        res.json(jsonData);
    } catch (err) {
        console.error('Error serving data:', err);
        res.status(500).json({ error: 'Error retrieving data' });
    }
});

// API endpoint to save data
app.post('/api/save', (req, res) => {
    try {
        if (!Array.isArray(req.body)) {
            return res.status(400).json({ error: 'Invalid data format - expected array' });
        }
        
        jsonData = req.body;
        saveData();
        
        res.json({ 
            success: true, 
            message: 'Data saved successfully',
            records: jsonData.length 
        });
    } catch (err) {
        console.error('Save error:', err);
        res.status(500).json({ error: 'Error saving data' });
    }
});

// Legacy save endpoint (keeping for compatibility)
app.post('/save', (req, res) => {
    try {
        if (!Array.isArray(req.body)) {
            return res.status(400).send('Invalid data format - expected array');
        }
        
        jsonData = req.body;
        saveData();
        
        res.send('File saved successfully');
    } catch (err) {
        console.error('Save error:', err);
        res.status(500).send('Error saving file');
    }
});

// Serve data.json directly (for the dashboard's auto-load feature)
app.get('/data.json', (req, res) => {
    try {
        res.json(jsonData);
    } catch (err) {
        console.error('Error serving data.json:', err);
        res.status(500).json({ error: 'Error retrieving data' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, saving data and shutting down gracefully');
    try {
        saveData();
    } catch (err) {
        console.error('Error saving data during shutdown:', err);
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, saving data and shutting down gracefully');
    try {
        saveData();
    } catch (err) {
        console.error('Error saving data during shutdown:', err);
    }
    process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SEA MASTER Dashboard Server running on port ${PORT}`);
    console.log(`📊 Dashboard URL: http://localhost:${PORT}/dashboard.html`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
    console.log(`📡 API Endpoints:`);
    console.log(`   GET  /api/data - Fetch all data`);
    console.log(`   POST /api/save - Save data`);
    console.log(`   POST /save - Legacy save endpoint`);
    console.log(`🔐 Credentials: admin/${ADMIN_PASSWORD}`);
    console.log(`📁 Data file: ${DATA_FILE}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});