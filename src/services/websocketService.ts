// WebSocket service for real-time updates and live sync status
import { EventEmitter } from 'events';

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
  messageId?: string;
  userId?: string;
  sessionId?: string;
}

export interface SyncProgressUpdate {
  jobId: string;
  current: number;
  total: number;
  currentStep: string;
  status: 'starting' | 'searching' | 'adding' | 'completed' | 'error' | 'paused';
  progress: number; // 0-100
  eta?: number; // seconds
  trackInfo?: {
    name: string;
    artist: string;
    index: number;
  };
  conflicts: number;
  errors: number;
  startTime: number;
  lastUpdateTime: number;
}

export interface PlaylistUpdate {
  playlistId: string;
  type: 'track_added' | 'track_removed' | 'track_updated' | 'playlist_modified';
  trackId?: string;
  trackName?: string;
  trackArtist?: string;
  userId: string;
  username: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface UserActivity {
  userId: string;
  username: string;
  action: string;
  target: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface NotificationUpdate {
  userId: string;
  notification: {
    id: string;
    type: string;
    title: string;
    message: string;
    timestamp: number;
    read: boolean;
    actionUrl?: string;
  };
}

export interface WebSocketConnection {
  id: string;
  userId?: string;
  sessionId: string;
  connectedAt: number;
  lastActivity: number;
  subscriptions: Set<string>;
  isAlive: boolean;
  send: (message: WebSocketMessage) => void;
  close: () => void;
}

export interface WebSocketSubscription {
  type: string;
  filter?: Record<string, any>;
  userId?: string;
}

export class WebSocketService extends EventEmitter {
  private connections: Map<string, WebSocketConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private messageQueue: Map<string, WebSocketMessage[]> = new Map();
  private isRunning: boolean = false;

  constructor() {
    super();
    this.initializeService();
  }

  private initializeService(): void {
    this.startHeartbeat();
    this.startCleanup();
    this.isRunning = true;
  }

  // Handle new WebSocket connection
  handleConnection(ws: any, request: any): string {
    const connectionId = this.generateConnectionId();
    const sessionId = this.extractSessionId(request);
    const userId = this.extractUserId(request);

    const connection: WebSocketConnection = {
      id: connectionId,
      userId,
      sessionId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      subscriptions: new Set(),
      isAlive: true,
      send: (message: WebSocketMessage) => this.sendToConnection(connectionId, message),
      close: () => this.closeConnection(connectionId)
    };

    // Store connection
    this.connections.set(connectionId, connection);
    
    if (userId) {
      this.addUserConnection(userId, connectionId);
    }

    // Set up WebSocket event handlers
    ws.on('message', (data: any) => this.handleMessage(connectionId, data));
    ws.on('close', () => this.closeConnection(connectionId));
    ws.on('error', (error: any) => this.handleConnectionError(connectionId, error));
    ws.on('pong', () => this.handlePong(connectionId));

    // Send welcome message
    this.sendToConnection(connectionId, {
      type: 'connection_established',
      data: {
        connectionId,
        sessionId,
        userId,
        timestamp: Date.now(),
        features: ['sync_progress', 'playlist_updates', 'notifications', 'user_activity']
      },
      timestamp: Date.now()
    });

    // Emit connection event
    this.emit('connection', connection);

    return connectionId;
  }

  // Handle incoming WebSocket message
  private handleMessage(connectionId: string, data: any): void {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      const connection = this.connections.get(connectionId);
      
      if (!connection) return;

      // Update last activity
      connection.lastActivity = Date.now();

      // Handle different message types
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(connectionId, message.data);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(connectionId, message.data);
          break;
        case 'ping':
          this.handlePing(connectionId);
          break;
        case 'sync_request':
          this.handleSyncRequest(connectionId, message.data);
          break;
        case 'playlist_update':
          this.handlePlaylistUpdate(connectionId, message.data);
          break;
        default:
          // Emit custom message event
          this.emit('message', connectionId, message);
      }

    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.sendToConnection(connectionId, {
        type: 'error',
        data: {
          message: 'Invalid message format',
          originalMessage: data.toString()
        },
        timestamp: Date.now()
      });
    }
  }

  // Handle subscription request
  private handleSubscribe(connectionId: string, data: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { type, filter } = data;
    const subscriptionKey = this.createSubscriptionKey(type, filter, connection.userId);

    // Add subscription
    connection.subscriptions.add(subscriptionKey);
    
    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, new Set());
    }
    this.subscriptions.get(subscriptionKey)!.add(connectionId);

    // Send confirmation
    this.sendToConnection(connectionId, {
      type: 'subscription_confirmed',
      data: {
        type,
        filter,
        subscriptionKey
      },
      timestamp: Date.now()
    });

    // Emit subscription event
    this.emit('subscription', connectionId, type, filter);
  }

  // Handle unsubscription request
  private handleUnsubscribe(connectionId: string, data: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { type, filter } = data;
    const subscriptionKey = this.createSubscriptionKey(type, filter, connection.userId);

    // Remove subscription
    connection.subscriptions.delete(subscriptionKey);
    
    const subscriptionConnections = this.subscriptions.get(subscriptionKey);
    if (subscriptionConnections) {
      subscriptionConnections.delete(connectionId);
      if (subscriptionConnections.size === 0) {
        this.subscriptions.delete(subscriptionKey);
      }
    }

    // Send confirmation
    this.sendToConnection(connectionId, {
      type: 'unsubscription_confirmed',
      data: {
        type,
        filter,
        subscriptionKey
      },
      timestamp: Date.now()
    });
  }

  // Handle ping request
  private handlePing(connectionId: string): void {
    this.sendToConnection(connectionId, {
      type: 'pong',
      data: { timestamp: Date.now() },
      timestamp: Date.now()
    });
  }

  // Handle sync request
  private handleSyncRequest(connectionId: string, data: any): void {
    // This would integrate with your sync engine
    this.emit('sync_request', connectionId, data);
  }

  // Handle playlist update from client
  private handlePlaylistUpdate(connectionId: string, data: any): void {
    // This would integrate with your playlist service
    this.emit('playlist_update', connectionId, data);
  }

  // Broadcast sync progress update
  broadcastSyncProgress(update: SyncProgressUpdate): void {
    const message: WebSocketMessage = {
      type: 'sync_progress',
      data: update,
      timestamp: Date.now()
    };

    // Broadcast to all connections subscribed to sync updates
    this.broadcastToSubscribers('sync_progress', message, {
      jobId: update.jobId,
      userId: update.userId
    });
  }

  // Broadcast playlist update
  broadcastPlaylistUpdate(update: PlaylistUpdate): void {
    const message: WebSocketMessage = {
      type: 'playlist_update',
      data: update,
      timestamp: Date.now()
    };

    // Broadcast to all connections subscribed to playlist updates
    this.broadcastToSubscribers('playlist_update', message, {
      playlistId: update.playlistId,
      userId: update.userId
    });
  }

  // Broadcast user activity
  broadcastUserActivity(activity: UserActivity): void {
    const message: WebSocketMessage = {
      type: 'user_activity',
      data: activity,
      timestamp: Date.now()
    };

    // Broadcast to all connections subscribed to user activity
    this.broadcastToSubscribers('user_activity', message, {
      userId: activity.userId
    });
  }

  // Send notification to specific user
  sendNotification(notification: NotificationUpdate): void {
    const message: WebSocketMessage = {
      type: 'notification',
      data: notification.notification,
      timestamp: Date.now(),
      userId: notification.userId
    };

    // Send to all connections for the specific user
    const userConnectionIds = this.userConnections.get(notification.userId);
    if (userConnectionIds) {
      userConnectionIds.forEach(connectionId => {
        this.sendToConnection(connectionId, message);
      });
    }
  }

  // Broadcast to all connections subscribed to a specific type
  private broadcastToSubscribers(
    type: string,
    message: WebSocketMessage,
    filter?: Record<string, any>
  ): void {
    const subscriptionKey = this.createSubscriptionKey(type, filter);
    const subscriberConnections = this.subscriptions.get(subscriptionKey);

    if (subscriberConnections) {
      subscriberConnections.forEach(connectionId => {
        const connection = this.connections.get(connectionId);
        if (connection && connection.isAlive) {
          this.sendToConnection(connectionId, message);
        }
      });
    }
  }

  // Send message to specific connection
  private sendToConnection(connectionId: string, message: WebSocketMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isAlive) return;

    try {
      // This would send the message through the actual WebSocket
      // For now, we'll just emit an event
      this.emit('send_message', connectionId, message);
    } catch (error) {
      console.error(`Error sending message to connection ${connectionId}:`, error);
      this.closeConnection(connectionId);
    }
  }

  // Close a connection
  private closeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from all subscriptions
    connection.subscriptions.forEach(subscriptionKey => {
      const subscriptionConnections = this.subscriptions.get(subscriptionKey);
      if (subscriptionConnections) {
        subscriptionConnections.delete(connectionId);
        if (subscriptionConnections.size === 0) {
          this.subscriptions.delete(subscriptionKey);
        }
      }
    });

    // Remove from user connections
    if (connection.userId) {
      this.removeUserConnection(connection.userId, connectionId);
    }

    // Remove connection
    this.connections.delete(connectionId);

    // Emit disconnect event
    this.emit('disconnect', connectionId, connection);

    console.log(`Connection ${connectionId} closed`);
  }

  // Handle connection error
  private handleConnectionError(connectionId: string, error: any): void {
    console.error(`WebSocket error for connection ${connectionId}:`, error);
    this.closeConnection(connectionId);
  }

  // Handle pong response
  private handlePong(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.isAlive = true;
    }
  }

  // Start heartbeat mechanism
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.connections.forEach((connection, connectionId) => {
        if (!connection.isAlive) {
          console.log(`Connection ${connectionId} is not responding, closing`);
          this.closeConnection(connectionId);
          return;
        }

        connection.isAlive = false;
        
        // Send ping
        this.sendToConnection(connectionId, {
          type: 'ping',
          data: { timestamp: Date.now() },
          timestamp: Date.now()
        });
      });
    }, 30000); // 30 seconds
  }

  // Start cleanup mechanism
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxIdleTime = 5 * 60 * 1000; // 5 minutes

      this.connections.forEach((connection, connectionId) => {
        if (now - connection.lastActivity > maxIdleTime) {
          console.log(`Connection ${connectionId} idle for too long, closing`);
          this.closeConnection(connectionId);
        }
      });
    }, 60000); // 1 minute
  }

  // Create subscription key
  private createSubscriptionKey(type: string, filter?: Record<string, any>, userId?: string): string {
    const keyParts = [type];
    
    if (filter) {
      const sortedFilter = Object.keys(filter)
        .sort()
        .map(key => `${key}:${filter[key]}`)
        .join(',');
      keyParts.push(sortedFilter);
    }
    
    if (userId) {
      keyParts.push(`user:${userId}`);
    }
    
    return keyParts.join('|');
  }

  // Helper methods
  private addUserConnection(userId: string, connectionId: string): void {
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);
  }

  private removeUserConnection(userId: string, connectionId: string): void {
    const userConnections = this.userConnections.get(userId);
    if (userConnections) {
      userConnections.delete(connectionId);
      if (userConnections.size === 0) {
        this.userConnections.delete(userId);
      }
    }
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractSessionId(request: any): string {
    // Extract session ID from request headers or cookies
    return request.headers['x-session-id'] || 
           request.headers.cookie?.match(/sessionId=([^;]+)/)?.[1] || 
           `session_${Date.now()}`;
  }

  private extractUserId(request: any): string | undefined {
    // Extract user ID from request headers, cookies, or query parameters
    return request.headers['x-user-id'] || 
           request.headers.cookie?.match(/userId=([^;]+)/)?.[1] ||
           request.query?.userId;
  }

  // Get service statistics
  getServiceStats(): {
    totalConnections: number;
    activeConnections: number;
    totalSubscriptions: number;
    userConnections: number;
    isRunning: boolean;
  } {
    const activeConnections = Array.from(this.connections.values())
      .filter(conn => conn.isAlive).length;

    return {
      totalConnections: this.connections.size,
      activeConnections,
      totalSubscriptions: this.subscriptions.size,
      userConnections: this.userConnections.size,
      isRunning: this.isRunning
    };
  }

  // Get connections for a specific user
  getUserConnections(userId: string): WebSocketConnection[] {
    const connectionIds = this.userConnections.get(userId) || new Set();
    const connections: WebSocketConnection[] = [];

    connectionIds.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        connections.push(connection);
      }
    });

    return connections;
  }

  // Stop the service
  stop(): void {
    this.isRunning = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all connections
    this.connections.forEach((_, connectionId) => {
      this.closeConnection(connectionId);
    });

    this.emit('stopped');
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService();
