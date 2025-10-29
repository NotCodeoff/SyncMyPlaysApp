/**
 * Swagger API Documentation Configuration
 */

const swaggerJsdoc = require('swagger-jsdoc');
const config = require('../config/env');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SyncMyPlays API',
      version: '1.0.0',
      description: 'High-performance music playlist synchronization API with SongShift-level accuracy',
      contact: {
        name: 'SyncMyPlays Team',
        url: 'https://syncmyplays.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `http://${config.host}:${config.port}`,
        description: 'Development server'
      },
      {
        url: 'https://api.syncmyplays.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Track: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Track ID' },
            name: { type: 'string', description: 'Track name' },
            artists: {
              type: 'array',
              items: { type: 'string' },
              description: 'Artist names'
            },
            album: { type: 'string', description: 'Album name' },
            duration_ms: { type: 'number', description: 'Duration in milliseconds' },
            isrc: { type: 'string', description: 'International Standard Recording Code' }
          }
        },
        MatchResult: {
          type: 'object',
          properties: {
            success: { type: 'boolean', description: 'Match success status' },
            id: { type: 'string', description: 'Matched track ID' },
            match: { $ref: '#/components/schemas/Track' },
            matchMethod: { type: 'string', enum: ['ISRC', 'METADATA', 'FUZZY'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            score: { type: 'number', minimum: 0, maximum: 100 }
          }
        },
        SyncSession: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Unique session identifier' },
            status: {
              type: 'string',
              enum: ['processing', 'needs_review', 'completed', 'error'],
              description: 'Current session status'
            },
            progress: {
              type: 'object',
              properties: {
                current: { type: 'number' },
                total: { type: 'number' }
              }
            },
            results: {
              type: 'object',
              properties: {
                matched: { type: 'number' },
                unavailable: { type: 'number' },
                needsReview: { type: 'number' }
              }
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string', description: 'Error message' },
                type: { type: 'string', description: 'Error type' },
                details: { type: 'object', description: 'Additional error details' }
              }
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'Service authentication endpoints'
      },
      {
        name: 'Playlists',
        description: 'Playlist management endpoints'
      },
      {
        name: 'Sync',
        description: 'Playlist synchronization endpoints'
      },
      {
        name: 'Advanced',
        description: 'Advanced matching and review endpoints'
      },
      {
        name: 'System',
        description: 'System status and health endpoints'
      }
    ]
  },
  apis: [
    './backend/routes/*.js',
    './backend/index.js'
  ]
};

const specs = swaggerJsdoc(options);

module.exports = specs;

