/**
 * Centralized Error Handling
 * Provides consistent error handling and user-friendly messages
 */

const logger = require('./logger');

// Error types
const ErrorTypes = {
  VALIDATION: 'ValidationError',
  AUTHENTICATION: 'AuthenticationError',
  AUTHORIZATION: 'AuthorizationError',
  NOT_FOUND: 'NotFoundError',
  RATE_LIMIT: 'RateLimitError',
  EXTERNAL_API: 'ExternalAPIError',
  INTERNAL: 'InternalError',
  NETWORK: 'NetworkError',
  TIMEOUT: 'TimeoutError',
};

// Custom error class
class AppError extends Error {
  constructor(message, type = ErrorTypes.INTERNAL, statusCode = 500, details = {}) {
    super(message);
    this.name = type;
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error factory functions
const createValidationError = (message, details = {}) => 
  new AppError(message, ErrorTypes.VALIDATION, 400, details);

const createAuthenticationError = (message, details = {}) => 
  new AppError(message, ErrorTypes.AUTHENTICATION, 401, details);

const createAuthorizationError = (message, details = {}) => 
  new AppError(message, ErrorTypes.AUTHORIZATION, 403, details);

const createNotFoundError = (message, details = {}) => 
  new AppError(message, ErrorTypes.NOT_FOUND, 404, details);

const createRateLimitError = (message, details = {}) => 
  new AppError(message, ErrorTypes.RATE_LIMIT, 429, details);

const createExternalAPIError = (message, details = {}) => 
  new AppError(message, ErrorTypes.EXTERNAL_API, 502, details);

const createNetworkError = (message, details = {}) => 
  new AppError(message, ErrorTypes.NETWORK, 503, details);

const createTimeoutError = (message, details = {}) => 
  new AppError(message, ErrorTypes.TIMEOUT, 504, details);

// User-friendly error messages
const getUserFriendlyMessage = (error) => {
  const friendlyMessages = {
    [ErrorTypes.VALIDATION]: 'Invalid input. Please check your data and try again.',
    [ErrorTypes.AUTHENTICATION]: 'Authentication failed. Please sign in again.',
    [ErrorTypes.AUTHORIZATION]: 'You don\'t have permission to perform this action.',
    [ErrorTypes.NOT_FOUND]: 'The requested resource was not found.',
    [ErrorTypes.RATE_LIMIT]: 'Too many requests. Please wait a moment and try again.',
    [ErrorTypes.EXTERNAL_API]: 'Unable to connect to the music service. Please try again later.',
    [ErrorTypes.NETWORK]: 'Network error. Please check your internet connection.',
    [ErrorTypes.TIMEOUT]: 'The request took too long. Please try again.',
    [ErrorTypes.INTERNAL]: 'An unexpected error occurred. Our team has been notified.',
  };
  
  if (error instanceof AppError) {
    return error.message;
  }
  
  return friendlyMessages[error.name] || friendlyMessages[ErrorTypes.INTERNAL];
};

// Error response formatter
const formatErrorResponse = (error, includeStack = false) => {
  const response = {
    success: false,
    error: {
      message: getUserFriendlyMessage(error),
      type: error.type || ErrorTypes.INTERNAL,
    },
  };
  
  if (error.details && Object.keys(error.details).length > 0) {
    response.error.details = error.details;
  }
  
  if (includeStack && error.stack) {
    response.error.stack = error.stack;
  }
  
  return response;
};

// Express error handling middleware
const errorMiddleware = (err, req, res, next) => {
  // Log error
  logger.error('Request error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });
  
  // Determine status code
  const statusCode = err.statusCode || 500;
  
  // Send response
  const includeStack = process.env.NODE_ENV === 'development';
  res.status(statusCode).json(formatErrorResponse(err, includeStack));
};

// Async route handler wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

module.exports = {
  ErrorTypes,
  AppError,
  createValidationError,
  createAuthenticationError,
  createAuthorizationError,
  createNotFoundError,
  createRateLimitError,
  createExternalAPIError,
  createNetworkError,
  createTimeoutError,
  getUserFriendlyMessage,
  formatErrorResponse,
  errorMiddleware,
  asyncHandler,
};

