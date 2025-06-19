const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const basicAuth = require('express-basic-auth');
const helmet = require('helmet');
const compression = require('compression');

const app = express();

// Configuration
const config = {
    port: process.env.PORT || 8000,
    adminPassword: process.env.ADMIN_PASSWORD || 'pakistanmc',
    nodeEnv: process.env.NODE_ENV || 'development',
    dataFile: path.join(__dirname, 'data.json'),
    maxFileSize: '50mb',
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : true
};

console.log('🚀 Starting SEA MASTER Feedback Tracker...');
console.log(`📊 Environment: ${config.nodeEnv}`);
console.log(`🔐 Admin Password: ${config.adminPassword}`);
console.log(`📁 Data File: ${config.dataFile}`);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression());

// Basic Authentication with custom authorizer
app.use(basicAuth({
    authorizer: (username, password) => {
        const userMatches = basicAuth.safeCompare(username, 'admin');
        const passwordMatches = basicAuth.safeCompare(password, config.adminPassword);
        return userMatches && passwordMatches;
    },
    challenge: true,
    unauthorizedResponse: (req) => {
        return {
            error: 'Unauthorized',
            message: 'Invalid credentials. Contact admin for access.',
            timestamp: new Date().toISOString()
        };
    }
}));

// CORS configuration
app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With',
        'Accept',
        'Origin'
    ],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
    maxAge: 86400 // 24 hours
}));

// Body parsing middleware with size limits
app.use(express.json({ 
    limit: config.maxFileSize,
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: config.maxFileSize 
}));

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${req.method} ${req.path} - ${req.ip}`);
    next();
});

// Static file serving with proper headers
app.use(express.static('.', {
    maxAge: config.nodeEnv === 'production' ? '1d' : '0',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
        if (path.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        }
    }
}));

// Data management
let jsonData = [];
let dataVersion = 0;

function loadData() {
    try {
        if (fs.existsSync(config.dataFile)) {
            const rawData = fs.readFileSync(config.dataFile, 'utf8');
            const parsedData = JSON.parse(rawData);
            
            if (Array.isArray(parsedData)) {
                jsonData = parsedData;
            } else if (typeof parsedData === 'object' && parsedData !== null) {
                jsonData = [parsedData];
            } else {
                throw new Error('Invalid data format');
            }
            
            dataVersion++;
            console.log(`✅ Loaded ${jsonData.length} records from ${config.dataFile}`);
        } else {
            console.log('📝 No data file found, creating new one...');
            jsonData = [];
            saveData();
        }
    } catch (error) {
        console.error('❌ Error loading data:', error.message);
        jsonData = [];
        
        // Create backup if corrupted file exists
        if (fs.existsSync(config.dataFile)) {
            const backupFile = `${config.dataFile}.backup.${Date.now()}`;
            try {
                fs.copyFileSync(config.dataFile, backupFile);
                console.log(`💾 Corrupted file backed up to: ${backupFile}`);
            } catch (backupError) {
                console.error('❌ Failed to create backup:', backupError.message);
            }
        }
        
        saveData();
    }
}

function saveData() {
    try {
        const dataToSave = JSON.stringify(jsonData, null, 2);
        
        // Atomic write using temporary file
        const tempFile = `${config.dataFile}.tmp`;
        fs.writeFileSync(tempFile, dataToSave, 'utf8');
        
        // Move temp file to actual file (atomic operation)
        fs.renameSync(tempFile, config.dataFile);
        
        dataVersion++;
        console.log(`💾 Saved ${jsonData.length} records to ${config.dataFile}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving data:', error.message);
        
        // Clean up temp file if it exists
        const tempFile = `${config.dataFile}.tmp`;
        if (fs.existsSync(tempFile)) {
            try {
                fs.unlinkSync(tempFile);
            } catch (cleanupError) {
                console.error('❌ Failed to cleanup temp file:', cleanupError.message);
            }
        }
        
        return false;
    }
}

// Initialize data
loadData();

// Routes

// Root route - redirect to dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard.html');
});

// Health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
        records: jsonData.length,
        dataVersion: dataVersion,
        memory: process.memoryUsage(),
        version: require('./package.json').version,
        node: process.version
    };
    
    res.json(healthData);
});

// API endpoint to get data with optional filtering
app.get('/api/data', (req, res) => {
    try {
        let responseData = [...jsonData];
        
        // Simple filtering support
        const { limit, offset, search } = req.query;
        
        if (search) {
            const searchTerm = search.toLowerCase();
            responseData = responseData.filter(item => 
                Object.values(item).some(value => 
                    String(value).toLowerCase().includes(searchTerm)
                )
            );
        }
        
        if (offset) {
            const offsetNum = parseInt(offset, 10);
            responseData = responseData.slice(offsetNum);
        }
        
        if (limit) {
            const limitNum = parseInt(limit, 10);
            responseData = responseData.slice(0, limitNum);
        }
        
        res.json({
            data: responseData,
            total: jsonData.length,
            filtered: responseData.length,
            version: dataVersion,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error serving data:', error);
        res.status(500).json({ 
            error: 'Error retrieving data',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// API endpoint to save data
app.post('/api/save', (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({ 
                error: 'No data provided',
                timestamp: new Date().toISOString()
            });
        }
        
        if (!Array.isArray(req.body)) {
            return res.status(400).json({ 
                error: 'Invalid data format - expected array',
                received: typeof req.body,
                timestamp: new Date().toISOString()
            });
        }
        
        // Validate data structure
        const hasValidStructure = req.body.every(item => 
            typeof item === 'object' && item !== null
        );
        
        if (!hasValidStructure) {
            return res.status(400).json({ 
                error: 'Invalid data structure - all items must be objects',
                timestamp: new Date().toISOString()
            });
        }
        
        jsonData = req.body;
        const saveSuccess = saveData();
        
        if (saveSuccess) {
            res.json({ 
                success: true,
                message: 'Data saved successfully',
                records: jsonData.length,
                version: dataVersion,
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to save data to file',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('❌ Save error:', error);
        res.status(500).json({ 
            error: 'Error saving data',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Legacy save endpoint for backward compatibility
app.post('/save', (req, res) => {
    try {
        if (!Array.isArray(req.body)) {
            return res.status(400).send('Invalid data format - expected array');
        }
        
        jsonData = req.body;
        const saveSuccess = saveData();
        
        if (saveSuccess) {
            res.send('File saved successfully');
        } else {
            res.status(500).send('Error saving file');
        }
    } catch (error) {
        console.error('❌ Legacy save error:', error);
        res.status(500).send('Error saving file');
    }
});

// Serve data.json directly (for dashboard auto-load)
app.get('/data.json', (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.json(jsonData);
    } catch (error) {
        console.error('❌ Error serving data.json:', error);
        res.status(500).json({ 
            error: 'Error retrieving data',
            timestamp: new Date().toISOString()
        });
    }
});

// API endpoint to get statistics
app.get('/api/stats', (req, res) => {
    try {
        const stats = {
            totalRecords: jsonData.length,
            dataVersion: dataVersion,
            lastModified: fs.existsSync(config.dataFile) ? 
                fs.statSync(config.dataFile).mtime : null,
            fileSize: fs.existsSync(config.dataFile) ? 
                fs.statSync(config.dataFile).size : 0
        };
        
        // Calculate status distribution if Status field exists
        if (jsonData.length > 0 && jsonData[0].hasOwnProperty('Status')) {
            stats.statusDistribution = jsonData.reduce((acc, item) => {
                const status = item.Status || 'Unknown';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});
        }
        
        res.json(stats);
    } catch (error) {
        console.error('❌ Error calculating stats:', error);
        res.status(500).json({ 
            error: 'Error calculating statistics',
            message: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('🚨 Server error:', err);
    
    const errorResponse = {
        error: 'Internal Server Error',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
    };
    
    if (config.nodeEnv === 'development') {
        errorResponse.message = err.message;
        errorResponse.stack = err.stack;
    }
    
    res.status(500).json(errorResponse);
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
        availableEndpoints: [
            'GET /',
            'GET /dashboard.html',
            'GET /health',
            'GET /api/data',
            'POST /api/save',
            'GET /api/stats',
            'GET /data.json'
        ]
    });
});

// Graceful shutdown handlers
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    try {
        console.log('💾 Saving data before shutdown...');
        saveData();
        console.log('✅ Data saved successfully');
    } catch (error) {
        console.error('❌ Error saving data during shutdown:', error);
    }
    
    console.log('👋 Goodbye!');
    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    try {
        saveData();
    } catch (saveError) {
        console.error('❌ Failed to save data on crash:', saveError);
    }
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
const server = app.listen(config.port, '0.0.0.0', () => {
    console.log('\n🎉 SEA MASTER Dashboard Server Started Successfully!');
    console.log('═'.repeat(60));
    console.log(`🚀 Server URL: http://0.0.0.0:${config.port}`);
    console.log(`📊 Dashboard: http://0.0.0.0:${config.port}/dashboard.html`);
    console.log(`🏥 Health Check: http://0.0.0.0:${config.port}/health`);
    console.log(`📈 Statistics: http://0.0.0.0:${config.port}/api/stats`);
    console.log('═'.repeat(60));
    console.log('📡 Available API Endpoints:');
    console.log('   GET  /api/data   - Fetch all data');
    console.log('   POST /api/save   - Save data');
    console.log('   GET  /api/stats  - Get statistics');
    console.log('   POST /save       - Legacy save endpoint');
    console.log('   GET  /data.json  - Direct data access');
    console.log('═'.repeat(60));
    console.log(`🔐 Admin Credentials: admin/${config.adminPassword}`);
    console.log(`📁 Data Storage: ${config.dataFile}`);
    console.log(`🌍 Environment: ${config.nodeEnv}`);
    console.log(`📦 Node Version: ${process.version}`);
    console.log(`💾 Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    console.log('═'.repeat(60));
    console.log('✅ Ready to serve requests!');
});

// Server error handling
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${config.port} is already in use`);
        process.exit(1);
    } else {
        console.error('❌ Server error:', error);
        process.exit(1);
    }
});

module.exports = app;
