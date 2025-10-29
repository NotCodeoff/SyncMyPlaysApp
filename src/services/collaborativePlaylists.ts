// Collaborative playlist system for sharing and editing playlists with friends
import { memoize } from '../utils/performance';

export interface CollaborativePlaylist {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  collaborators: PlaylistCollaborator[];
  tracks: PlaylistTrack[];
  settings: PlaylistSettings;
  metadata: PlaylistMetadata;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
}

export interface PlaylistCollaborator {
  userId: string;
  username: string;
  avatar?: string;
  role: 'owner' | 'editor' | 'viewer' | 'contributor';
  permissions: Permission[];
  joinedAt: Date;
  lastActiveAt: Date;
  contributionCount: number;
}

export interface PlaylistTrack {
  id: string;
  name: string;
  artist: string;
  album?: string;
  addedBy: string;
  addedAt: Date;
  position: number;
  metadata: Record<string, any>;
  votes: TrackVote[];
  comments: TrackComment[];
}

export interface TrackVote {
  userId: string;
  username: string;
  vote: 'up' | 'down' | 'neutral';
  timestamp: Date;
}

export interface TrackComment {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  content: string;
  timestamp: Date;
  replies: TrackComment[];
  likes: number;
}

export interface PlaylistSettings {
  isPublic: boolean;
  allowCollaboration: boolean;
  requireApproval: boolean;
  maxCollaborators: number;
  allowTrackVoting: boolean;
  allowComments: boolean;
  autoSync: boolean;
  syncInterval: number; // minutes
  conflictResolution: 'owner' | 'majority' | 'consensus';
}

export interface PlaylistMetadata {
  genre?: string;
  mood?: string;
  tags: string[];
  coverImage?: string;
  totalDuration: number;
  trackCount: number;
  popularity: number;
  lastSyncAt?: Date;
}

export interface Permission {
  action: 'add_track' | 'remove_track' | 'reorder_tracks' | 'edit_metadata' | 'manage_collaborators' | 'delete_playlist';
  granted: boolean;
}

export class CollaborativePlaylistService {
  private playlists: Map<string, CollaborativePlaylist> = new Map();
  private userPlaylists: Map<string, Set<string>> = new Map();
  private activityLog: Map<string, ActivityLogEntry[]> = new Map();
  private notifications: Map<string, Notification[]> = new Map();

  constructor() {
    this.initializeDefaultPermissions();
  }

  private initializeDefaultPermissions(): void {
    // This would set up default permission templates for different roles
  }

  // Create a new collaborative playlist
  async createCollaborativePlaylist(
    ownerId: string,
    name: string,
    description?: string,
    settings?: Partial<PlaylistSettings>
  ): Promise<CollaborativePlaylist> {
    const defaultSettings: PlaylistSettings = {
      isPublic: false,
      allowCollaboration: true,
      requireApproval: false,
      maxCollaborators: 10,
      allowTrackVoting: true,
      allowComments: true,
      autoSync: false,
      syncInterval: 60,
      conflictResolution: 'owner'
    };

    const playlist: CollaborativePlaylist = {
      id: this.generatePlaylistId(),
      name,
      description,
      ownerId,
      collaborators: [{
        userId: ownerId,
        username: await this.getUsername(ownerId),
        role: 'owner',
        permissions: this.getOwnerPermissions(),
        joinedAt: new Date(),
        lastActiveAt: new Date(),
        contributionCount: 0
      }],
      tracks: [],
      settings: { ...defaultSettings, ...settings },
      metadata: {
        tags: [],
        totalDuration: 0,
        trackCount: 0,
        popularity: 0
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastActivityAt: new Date()
    };

    this.playlists.set(playlist.id, playlist);
    this.addUserToPlaylist(ownerId, playlist.id);
    this.logActivity(playlist.id, 'playlist_created', ownerId, { playlistName: name });

    return playlist;
  }

  // Add a collaborator to a playlist
  async addCollaborator(
    playlistId: string,
    requesterId: string,
    newCollaboratorId: string,
    role: PlaylistCollaborator['role'] = 'contributor'
  ): Promise<boolean> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) {
      throw new Error('Playlist not found');
    }

    if (!this.hasPermission(requesterId, playlistId, 'manage_collaborators')) {
      throw new Error('Insufficient permissions to add collaborators');
    }

    if (playlist.collaborators.length >= playlist.settings.maxCollaborators) {
      throw new Error('Maximum number of collaborators reached');
    }

    const existingCollaborator = playlist.collaborators.find(c => c.userId === newCollaboratorId);
    if (existingCollaborator) {
      throw new Error('User is already a collaborator');
    }

    const newCollaborator: PlaylistCollaborator = {
      userId: newCollaboratorId,
      username: await this.getUsername(newCollaboratorId),
      role,
      permissions: this.getPermissionsForRole(role),
      joinedAt: new Date(),
      lastActiveAt: new Date(),
      contributionCount: 0
    };

    playlist.collaborators.push(newCollaborator);
    playlist.updatedAt = new Date();
    playlist.lastActivityAt = new Date();

    this.addUserToPlaylist(newCollaboratorId, playlistId);
    this.logActivity(playlistId, 'collaborator_added', requesterId, { 
      newCollaboratorId, 
      role,
      newCollaboratorUsername: newCollaborator.username 
    });

    // Send notification to new collaborator
    this.sendNotification(newCollaboratorId, {
      id: this.generateNotificationId(),
      type: 'collaboration_invite',
      title: `You've been invited to collaborate on "${playlist.name}"`,
      message: `${await this.getUsername(requesterId)} invited you to collaborate on this playlist`,
      playlistId,
      timestamp: new Date(),
      read: false,
      actionUrl: `/playlists/${playlistId}`
    });

    return true;
  }

  // Remove a collaborator from a playlist
  async removeCollaborator(
    playlistId: string,
    requesterId: string,
    collaboratorId: string
  ): Promise<boolean> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) {
      throw new Error('Playlist not found');
    }

    if (!this.hasPermission(requesterId, playlistId, 'manage_collaborators')) {
      throw new Error('Insufficient permissions to remove collaborators');
    }

    if (collaboratorId === playlist.ownerId) {
      throw new Error('Cannot remove the playlist owner');
    }

    const collaboratorIndex = playlist.collaborators.findIndex(c => c.userId === collaboratorId);
    if (collaboratorIndex === -1) {
      throw new Error('Collaborator not found');
    }

    const removedCollaborator = playlist.collaborators[collaboratorIndex];
    playlist.collaborators.splice(collaboratorIndex, 1);
    playlist.updatedAt = new Date();
    playlist.lastActivityAt = new Date();

    this.removeUserFromPlaylist(collaboratorId, playlistId);
    this.logActivity(playlistId, 'collaborator_removed', requesterId, { 
      removedCollaboratorId: collaboratorId,
      removedCollaboratorUsername: removedCollaborator.username 
    });

    // Send notification to removed collaborator
    this.sendNotification(collaboratorId, {
      id: this.generateNotificationId(),
      type: 'collaboration_removed',
      title: `You've been removed from "${playlist.name}"`,
      message: `You are no longer a collaborator on this playlist`,
      playlistId,
      timestamp: new Date(),
      read: false,
      actionUrl: `/playlists/${playlistId}`
    });

    return true;
  }

  // Add a track to the playlist
  async addTrack(
    playlistId: string,
    userId: string,
    track: Omit<PlaylistTrack, 'id' | 'addedBy' | 'addedAt' | 'position' | 'votes' | 'comments'>
  ): Promise<boolean> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) {
      throw new Error('Playlist not found');
    }

    if (!this.hasPermission(userId, playlistId, 'add_track')) {
      throw new Error('Insufficient permissions to add tracks');
    }

    if (playlist.settings.requireApproval && !this.isOwner(userId, playlistId)) {
      // Add to pending tracks for approval
      await this.addPendingTrack(playlistId, userId, track);
      return true;
    }

    const newTrack: PlaylistTrack = {
      ...track,
      id: this.generateTrackId(),
      addedBy: userId,
      addedAt: new Date(),
      position: playlist.tracks.length,
      votes: [],
      comments: []
    };

    playlist.tracks.push(newTrack);
    playlist.updatedAt = new Date();
    playlist.lastActivityAt = new Date();
    playlist.metadata.trackCount = playlist.tracks.length;
    playlist.metadata.totalDuration += track.metadata?.duration_ms || 0;

    // Update collaborator contribution count
    const collaborator = playlist.collaborators.find(c => c.userId === userId);
    if (collaborator) {
      collaborator.contributionCount++;
      collaborator.lastActiveAt = new Date();
    }

    this.logActivity(playlistId, 'track_added', userId, { 
      trackName: track.name, 
      trackArtist: track.artist 
    });

    // Notify other collaborators
    this.notifyCollaborators(playlistId, userId, 'track_added', {
      trackName: track.name,
      trackArtist: track.artist,
      addedBy: await this.getUsername(userId)
    });

    return true;
  }

  // Remove a track from the playlist
  async removeTrack(
    playlistId: string,
    userId: string,
    trackId: string
  ): Promise<boolean> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) {
      throw new Error('Playlist not found');
    }

    if (!this.hasPermission(userId, playlistId, 'remove_track')) {
      throw new Error('Insufficient permissions to remove tracks');
    }

    const trackIndex = playlist.tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) {
      throw new Error('Track not found');
    }

    const removedTrack = playlist.tracks[trackIndex];
    playlist.tracks.splice(trackIndex, 1);
    
    // Update positions for remaining tracks
    playlist.tracks.forEach((track, index) => {
      track.position = index;
    });

    playlist.updatedAt = new Date();
    playlist.lastActivityAt = new Date();
    playlist.metadata.trackCount = playlist.tracks.length;
    playlist.metadata.totalDuration -= removedTrack.metadata?.duration_ms || 0;

    this.logActivity(playlistId, 'track_removed', userId, { 
      trackName: removedTrack.name, 
      trackArtist: removedTrack.artist 
    });

    // Notify other collaborators
    this.notifyCollaborators(playlistId, userId, 'track_removed', {
      trackName: removedTrack.name,
      trackArtist: removedTrack.artist,
      removedBy: await this.getUsername(userId)
    });

    return true;
  }

  // Reorder tracks in the playlist
  async reorderTracks(
    playlistId: string,
    userId: string,
    trackIds: string[]
  ): Promise<boolean> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) {
      throw new Error('Playlist not found');
    }

    if (!this.hasPermission(userId, playlistId, 'reorder_tracks')) {
      throw new Error('Insufficient permissions to reorder tracks');
    }

    if (trackIds.length !== playlist.tracks.length) {
      throw new Error('Invalid track order: must include all tracks');
    }

    // Create new track order
    const newTracks: PlaylistTrack[] = [];
    trackIds.forEach((trackId, index) => {
      const track = playlist.tracks.find(t => t.id === trackId);
      if (track) {
        track.position = index;
        newTracks.push(track);
      }
    });

    playlist.tracks = newTracks;
    playlist.updatedAt = new Date();
    playlist.lastActivityAt = new Date();

    this.logActivity(playlistId, 'tracks_reordered', userId, { 
      trackCount: trackIds.length 
    });

    return true;
  }

  // Vote on a track
  async voteOnTrack(
    playlistId: string,
    userId: string,
    trackId: string,
    vote: 'up' | 'down' | 'neutral'
  ): Promise<boolean> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) {
      throw new Error('Playlist not found');
    }

    if (!playlist.settings.allowTrackVoting) {
      throw new Error('Track voting is disabled for this playlist');
    }

    const track = playlist.tracks.find(t => t.id === trackId);
    if (!track) {
      throw new Error('Track not found');
    }

    // Remove existing vote
    track.votes = track.votes.filter(v => v.userId !== userId);

    // Add new vote
    if (vote !== 'neutral') {
      track.votes.push({
        userId,
        username: await this.getUsername(userId),
        vote,
        timestamp: new Date()
      });
    }

    playlist.updatedAt = new Date();
    playlist.lastActivityAt = new Date();

    this.logActivity(playlistId, 'track_voted', userId, { 
      trackName: track.name, 
      vote 
    });

    return true;
  }

  // Add a comment to a track
  async addTrackComment(
    playlistId: string,
    userId: string,
    trackId: string,
    content: string,
    parentCommentId?: string
  ): Promise<string> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) {
      throw new Error('Playlist not found');
    }

    if (!playlist.settings.allowComments) {
      throw new Error('Comments are disabled for this playlist');
    }

    const track = playlist.tracks.find(t => t.id === trackId);
    if (!track) {
      throw new Error('Track not found');
    }

    const comment: TrackComment = {
      id: this.generateCommentId(),
      userId,
      username: await this.getUsername(userId),
      content,
      timestamp: new Date(),
      replies: [],
      likes: 0
    };

    if (parentCommentId) {
      // Add as reply
      const parentComment = this.findCommentById(track.comments, parentCommentId);
      if (parentComment) {
        parentComment.replies.push(comment);
      }
    } else {
      // Add as top-level comment
      track.comments.push(comment);
    }

    playlist.updatedAt = new Date();
    playlist.lastActivityAt = new Date();

    this.logActivity(playlistId, 'comment_added', userId, { 
      trackName: track.name,
      commentLength: content.length 
    });

    // Notify other collaborators
    this.notifyCollaborators(playlistId, userId, 'comment_added', {
      trackName: track.name,
      commentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      commentedBy: await this.getUsername(userId)
    });

    return comment.id;
  }

  // Get playlist with real-time updates
  async getPlaylist(playlistId: string, userId?: string): Promise<CollaborativePlaylist | null> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) {
      return null;
    }

    // Check if user has access
    if (userId && !this.hasAccess(userId, playlistId)) {
      return null;
    }

    return playlist;
  }

  // Get user's collaborative playlists
  async getUserPlaylists(userId: string): Promise<CollaborativePlaylist[]> {
    const playlistIds = this.userPlaylists.get(userId) || new Set();
    const playlists: CollaborativePlaylist[] = [];

    for (const playlistId of playlistIds) {
      const playlist = this.playlists.get(playlistId);
      if (playlist) {
        playlists.push(playlist);
      }
    }

    return playlists.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }

  // Search collaborative playlists
  async searchPlaylists(
    query: string,
    filters?: {
      genre?: string;
      mood?: string;
      tags?: string[];
      isPublic?: boolean;
      maxCollaborators?: number;
    }
  ): Promise<CollaborativePlaylist[]> {
    const results: CollaborativePlaylist[] = [];

    for (const playlist of this.playlists.values()) {
      if (!playlist.settings.isPublic) continue;

      // Text search
      const searchText = `${playlist.name} ${playlist.description || ''} ${playlist.metadata.tags.join(' ')}`.toLowerCase();
      if (!searchText.includes(query.toLowerCase())) continue;

      // Apply filters
      if (filters?.genre && playlist.metadata.genre !== filters.genre) continue;
      if (filters?.mood && playlist.metadata.mood !== filters.mood) continue;
      if (filters?.tags && !filters.tags.some(tag => playlist.metadata.tags.includes(tag))) continue;
      if (filters?.isPublic !== undefined && playlist.settings.isPublic !== filters.isPublic) continue;
      if (filters?.maxCollaborators && playlist.collaborators.length > filters.maxCollaborators) continue;

      results.push(playlist);
    }

    return results.sort((a, b) => b.metadata.popularity - a.metadata.popularity);
  }

  // Get playlist activity log
  async getPlaylistActivity(playlistId: string, limit: number = 50): Promise<ActivityLogEntry[]> {
    const activities = this.activityLog.get(playlistId) || [];
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Get user notifications
  async getUserNotifications(userId: string): Promise<Notification[]> {
    const notifications = this.notifications.get(userId) || [];
    return notifications
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Mark notification as read
  async markNotificationAsRead(userId: string, notificationId: string): Promise<boolean> {
    const notifications = this.notifications.get(userId);
    if (!notifications) return false;

    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      return true;
    }

    return false;
  }

  // Helper methods
  private hasPermission(userId: string, playlistId: string, action: Permission['action']): boolean {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) return false;

    const collaborator = playlist.collaborators.find(c => c.userId === userId);
    if (!collaborator) return false;

    return collaborator.permissions.some(p => p.action === action && p.granted);
  }

  private hasAccess(userId: string, playlistId: string): boolean {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) return false;

    if (playlist.settings.isPublic) return true;
    return playlist.collaborators.some(c => c.userId === userId);
  }

  private isOwner(userId: string, playlistId: string): boolean {
    const playlist = this.playlists.get(playlistId);
    return playlist?.ownerId === userId;
  }

  private getOwnerPermissions(): Permission[] {
    return [
      { action: 'add_track', granted: true },
      { action: 'remove_track', granted: true },
      { action: 'reorder_tracks', granted: true },
      { action: 'edit_metadata', granted: true },
      { action: 'manage_collaborators', granted: true },
      { action: 'delete_playlist', granted: true }
    ];
  }

  private getPermissionsForRole(role: PlaylistCollaborator['role']): Permission[] {
    switch (role) {
      case 'editor':
        return [
          { action: 'add_track', granted: true },
          { action: 'remove_track', granted: true },
          { action: 'reorder_tracks', granted: true },
          { action: 'edit_metadata', granted: true },
          { action: 'manage_collaborators', granted: false },
          { action: 'delete_playlist', granted: false }
        ];
      case 'contributor':
        return [
          { action: 'add_track', granted: true },
          { action: 'remove_track', granted: false },
          { action: 'reorder_tracks', granted: false },
          { action: 'edit_metadata', granted: false },
          { action: 'manage_collaborators', granted: false },
          { action: 'delete_playlist', granted: false }
        ];
      case 'viewer':
        return [
          { action: 'add_track', granted: false },
          { action: 'remove_track', granted: false },
          { action: 'reorder_tracks', granted: false },
          { action: 'edit_metadata', granted: false },
          { action: 'manage_collaborators', granted: false },
          { action: 'delete_playlist', granted: false }
        ];
      default:
        return [];
    }
  }

  private addUserToPlaylist(userId: string, playlistId: string): void {
    if (!this.userPlaylists.has(userId)) {
      this.userPlaylists.set(userId, new Set());
    }
    this.userPlaylists.get(userId)!.add(playlistId);
  }

  private removeUserFromPlaylist(userId: string, playlistId: string): void {
    const userPlaylists = this.userPlaylists.get(userId);
    if (userPlaylists) {
      userPlaylists.delete(playlistId);
    }
  }

  private logActivity(
    playlistId: string,
    action: string,
    userId: string,
    details: Record<string, any>
  ): void {
    if (!this.activityLog.has(playlistId)) {
      this.activityLog.set(playlistId, []);
    }

    this.activityLog.get(playlistId)!.push({
      id: this.generateActivityId(),
      action,
      userId,
      username: this.getUsernameSync(userId),
      details,
      timestamp: new Date()
    });
  }

  private async addPendingTrack(
    playlistId: string,
    userId: string,
    track: any
  ): Promise<void> {
    // Implementation for pending track approval system
  }

  private findCommentById(comments: TrackComment[], commentId: string): TrackComment | null {
    for (const comment of comments) {
      if (comment.id === commentId) return comment;
      const reply = this.findCommentById(comment.replies, commentId);
      if (reply) return reply;
    }
    return null;
  }

  private notifyCollaborators(
    playlistId: string,
    excludeUserId: string,
    type: string,
    data: Record<string, any>
  ): void {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) return;

    playlist.collaborators
      .filter(c => c.userId !== excludeUserId)
      .forEach(collaborator => {
        this.sendNotification(collaborator.userId, {
          id: this.generateNotificationId(),
          type,
          title: `Activity in "${playlist.name}"`,
          message: this.formatNotificationMessage(type, data),
          playlistId,
          timestamp: new Date(),
          read: false,
          actionUrl: `/playlists/${playlistId}`
        });
      });
  }

  private formatNotificationMessage(type: string, data: Record<string, any>): string {
    switch (type) {
      case 'track_added':
        return `${data.addedBy} added "${data.trackName}" by ${data.trackArtist}`;
      case 'track_removed':
        return `${data.removedBy} removed "${data.trackName}" by ${data.trackArtist}`;
      case 'comment_added':
        return `${data.commentedBy} commented on "${data.trackName}": "${data.commentPreview}"`;
      default:
        return 'New activity in playlist';
    }
  }

  private sendNotification(userId: string, notification: Notification): void {
    if (!this.notifications.has(userId)) {
      this.notifications.set(userId, []);
    }
    this.notifications.get(userId)!.push(notification);
  }

  // ID generation methods
  private generatePlaylistId(): string {
    return `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTrackId(): string {
    return `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCommentId(): string {
    return `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateActivityId(): string {
    return `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateNotificationId(): string {
    return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Placeholder methods for external services
  private async getUsername(userId: string): Promise<string> {
    // This would fetch username from user service
    return `User_${userId}`;
  }

  private getUsernameSync(userId: string): string {
    // Synchronous version for logging
    return `User_${userId}`;
  }
}

// Activity log entry interface
export interface ActivityLogEntry {
  id: string;
  action: string;
  userId: string;
  username: string;
  details: Record<string, any>;
  timestamp: Date;
}

// Notification interface
export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  playlistId?: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
}

// Export singleton instance
export const collaborativePlaylistService = new CollaborativePlaylistService();
