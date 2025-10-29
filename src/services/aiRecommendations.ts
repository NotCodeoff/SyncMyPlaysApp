// AI-powered music recommendation system
import { memoize } from '../utils/performance';

export interface Track {
  id: string;
  name: string;
  artist: string;
  album?: string;
  genre?: string;
  acousticness?: number;
  danceability?: number;
  energy?: number;
  instrumentalness?: number;
  key?: number;
  liveness?: number;
  loudness?: number;
  mode?: number;
  speechiness?: number;
  tempo?: number;
  valence?: number;
  duration_ms?: number;
  popularity?: number;
}

export interface UserProfile {
  userId: string;
  listeningHistory: Track[];
  favoriteGenres: string[];
  preferredTempo: number;
  moodPreferences: {
    energetic: number;
    relaxed: number;
    happy: number;
    melancholic: number;
  };
  timeOfDayPreferences: {
    morning: number;
    afternoon: number;
    evening: number;
    night: number;
  };
}

export interface RecommendationContext {
  currentMood?: string;
  timeOfDay?: string;
  activity?: string;
  recentTracks?: Track[];
  targetPlaylist?: string;
}

export class AIRecommendationEngine {
  private userProfiles: Map<string, UserProfile> = new Map();
  private trackFeatures: Map<string, Track> = new Map();
  private genreWeights: Map<string, number> = new Map();
  private collaborativeFiltering: Map<string, Set<string>> = new Map();

  constructor() {
    this.initializeGenreWeights();
  }

  private initializeGenreWeights(): void {
    // Initialize genre weights based on popularity and diversity
    const genres = [
      'pop', 'rock', 'hip-hop', 'electronic', 'r&b', 'country', 'jazz', 'classical',
      'folk', 'blues', 'reggae', 'punk', 'metal', 'indie', 'alternative', 'dance'
    ];
    
    genres.forEach((genre, index) => {
      this.genreWeights.set(genre, 1 + (index * 0.1));
    });
  }

  // Analyze user's listening patterns and create profile
  analyzeUserProfile(userId: string, listeningHistory: Track[]): UserProfile {
    const profile: UserProfile = {
      userId,
      listeningHistory,
      favoriteGenres: this.extractFavoriteGenres(listeningHistory),
      preferredTempo: this.calculatePreferredTempo(listeningHistory),
      moodPreferences: this.analyzeMoodPreferences(listeningHistory),
      timeOfDayPreferences: this.analyzeTimePreferences(listeningHistory)
    };

    this.userProfiles.set(userId, profile);
    return profile;
  }

  private extractFavoriteGenres(tracks: Track[]): string[] {
    const genreCounts = new Map<string, number>();
    
    tracks.forEach(track => {
      if (track.genre) {
        const count = genreCounts.get(track.genre) || 0;
        genreCounts.set(track.genre, count + 1);
      }
    });

    return Array.from(genreCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([genre]) => genre);
  }

  private calculatePreferredTempo(tracks: Track[]): number {
    const validTracks = tracks.filter(track => track.tempo && track.tempo > 0);
    if (validTracks.length === 0) return 120; // Default tempo

    const totalTempo = validTracks.reduce((sum, track) => sum + track.tempo!, 0);
    return totalTempo / validTracks.length;
  }

  private analyzeMoodPreferences(tracks: Track[]): UserProfile['moodPreferences'] {
    const moods = {
      energetic: 0,
      relaxed: 0,
      happy: 0,
      melancholic: 0
    };

    tracks.forEach(track => {
      if (track.energy && track.valence) {
        if (track.energy > 0.7 && track.valence > 0.6) moods.energetic++;
        if (track.energy < 0.4 && track.valence > 0.5) moods.relaxed++;
        if (track.valence > 0.7) moods.happy++;
        if (track.valence < 0.4) moods.melancholic++;
      }
    });

    // Normalize to 0-1 range
    const total = tracks.length || 1;
    Object.keys(moods).forEach(key => {
      moods[key as keyof typeof moods] /= total;
    });

    return moods;
  }

  private analyzeTimePreferences(tracks: Track[]): UserProfile['timeOfDayPreferences'] {
    // This would typically use actual timestamp data
    // For now, we'll use a simple distribution
    return {
      morning: 0.25,
      afternoon: 0.25,
      evening: 0.25,
      night: 0.25
    };
  }

  // Generate personalized recommendations
  generateRecommendations(
    userId: string,
    context: RecommendationContext,
    limit: number = 20
  ): Track[] {
    const userProfile = this.userProfiles.get(userId);
    if (!userProfile) {
      throw new Error('User profile not found. Please analyze user profile first.');
    }

    const recommendations = this.calculateRecommendationScores(
      userProfile,
      context,
      this.getAllAvailableTracks()
    );

    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.track);
  }

  private calculateRecommendationScores(
    profile: UserProfile,
    context: RecommendationContext,
    availableTracks: Track[]
  ): Array<{ track: Track; score: number }> {
    return availableTracks.map(track => {
      let score = 0;

      // Genre preference score
      if (track.genre && profile.favoriteGenres.includes(track.genre)) {
        score += 0.3;
      }

      // Tempo preference score
      if (track.tempo) {
        const tempoDiff = Math.abs(track.tempo - profile.preferredTempo);
        score += Math.max(0, 0.2 - (tempoDiff / 100));
      }

      // Mood matching score
      if (track.energy && track.valence) {
        const moodScore = this.calculateMoodScore(track, profile.moodPreferences, context);
        score += moodScore * 0.25;
      }

      // Popularity score (balance between popular and discovery)
      if (track.popularity) {
        score += (track.popularity / 100) * 0.15;
      }

      // Contextual score
      score += this.calculateContextualScore(track, context);

      // Collaborative filtering score
      score += this.getCollaborativeScore(track.id, profile.userId) * 0.1;

      return { track, score };
    });
  }

  private calculateMoodScore(
    track: Track,
    moodPreferences: UserProfile['moodPreferences'],
    context: RecommendationContext
  ): number {
    let score = 0;

    if (track.energy && track.valence) {
      // Energetic mood
      if (track.energy > 0.7 && track.valence > 0.6) {
        score += moodPreferences.energetic;
      }
      // Relaxed mood
      if (track.energy < 0.4 && track.valence > 0.5) {
        score += moodPreferences.relaxed;
      }
      // Happy mood
      if (track.valence > 0.7) {
        score += moodPreferences.happy;
      }
      // Melancholic mood
      if (track.valence < 0.4) {
        score += moodPreferences.melancholic;
      }
    }

    return score;
  }

  private calculateContextualScore(track: Track, context: RecommendationContext): number {
    let score = 0;

    // Time of day context
    if (context.timeOfDay) {
      const hour = new Date().getHours();
      if (context.timeOfDay === 'morning' && hour >= 6 && hour < 12) {
        if (track.energy && track.energy > 0.6) score += 0.1;
      } else if (context.timeOfDay === 'night' && (hour >= 22 || hour < 6)) {
        if (track.energy && track.energy < 0.5) score += 0.1;
      }
    }

    // Activity context
    if (context.activity) {
      switch (context.activity) {
        case 'workout':
          if (track.energy && track.energy > 0.7) score += 0.15;
          break;
        case 'study':
          if (track.instrumentalness && track.instrumentalness > 0.5) score += 0.15;
          break;
        case 'party':
          if (track.danceability && track.danceability > 0.7) score += 0.15;
          break;
      }
    }

    return score;
  }

  private getCollaborativeScore(trackId: string, userId: string): number {
    const similarUsers = this.findSimilarUsers(userId);
    let score = 0;

    similarUsers.forEach(similarUserId => {
      const userProfile = this.userProfiles.get(similarUserId);
      if (userProfile && userProfile.listeningHistory.some(t => t.id === trackId)) {
        score += 0.1;
      }
    });

    return Math.min(score, 1);
  }

  private findSimilarUsers(userId: string): string[] {
    const currentUser = this.userProfiles.get(userId);
    if (!currentUser) return [];

    const similarities = Array.from(this.userProfiles.entries())
      .filter(([id]) => id !== userId)
      .map(([id, profile]) => ({
        userId: id,
        similarity: this.calculateUserSimilarity(currentUser, profile)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10);

    return similarities.map(s => s.userId);
  }

  private calculateUserSimilarity(user1: UserProfile, user2: UserProfile): number {
    let similarity = 0;

    // Genre similarity
    const commonGenres = user1.favoriteGenres.filter(g => 
      user2.favoriteGenres.includes(g)
    );
    similarity += (commonGenres.length / Math.max(user1.favoriteGenres.length, user2.favoriteGenres.length)) * 0.4;

    // Tempo similarity
    const tempoDiff = Math.abs(user1.preferredTempo - user2.preferredTempo);
    similarity += Math.max(0, 0.3 - (tempoDiff / 200));

    // Mood similarity
    Object.keys(user1.moodPreferences).forEach(mood => {
      const key = mood as keyof typeof user1.moodPreferences;
      const diff = Math.abs(user1.moodPreferences[key] - user2.moodPreferences[key]);
      similarity += Math.max(0, 0.3 - diff);
    });

    return Math.min(similarity, 1);
  }

  // Smart playlist generation
  generateSmartPlaylist(
    userId: string,
    context: RecommendationContext,
    targetLength: number = 20,
    theme?: string
  ): Track[] {
    const recommendations = this.generateRecommendations(userId, context, targetLength * 2);
    
    if (theme) {
      return this.applyPlaylistTheme(recommendations, theme, targetLength);
    }

    return recommendations.slice(0, targetLength);
  }

  private applyPlaylistTheme(tracks: Track[], theme: string, targetLength: number): Track[] {
    let filteredTracks = tracks;

    switch (theme.toLowerCase()) {
      case 'workout':
        filteredTracks = tracks.filter(t => t.energy && t.energy > 0.7);
        break;
      case 'chill':
        filteredTracks = tracks.filter(t => t.energy && t.energy < 0.5);
        break;
      case 'party':
        filteredTracks = tracks.filter(t => t.danceability && t.danceability > 0.7);
        break;
      case 'focus':
        filteredTracks = tracks.filter(t => t.instrumentalness && t.instrumentalness > 0.3);
        break;
    }

    return filteredTracks.slice(0, targetLength);
  }

  // Update user profile with new listening data
  updateUserProfile(userId: string, newTracks: Track[]): void {
    const existingProfile = this.userProfiles.get(userId);
    if (existingProfile) {
      const updatedHistory = [...existingProfile.listeningHistory, ...newTracks];
      this.analyzeUserProfile(userId, updatedHistory);
    }
  }

  // Get all available tracks (this would typically come from your music service APIs)
  private getAllAvailableTracks(): Track[] {
    // This is a placeholder - in reality, you'd fetch from your music services
    return Array.from(this.trackFeatures.values());
  }

  // Add track features for analysis
  addTrackFeatures(track: Track): void {
    this.trackFeatures.set(track.id, track);
  }

  // Batch add track features
  addTrackFeaturesBatch(tracks: Track[]): void {
    tracks.forEach(track => this.addTrackFeatures(track));
  }

  // Get recommendation insights
  getRecommendationInsights(userId: string): {
    topGenres: string[];
    moodBreakdown: Record<string, number>;
    tempoRange: { min: number; max: number; average: number };
    discoveryScore: number;
  } {
    const profile = this.userProfiles.get(userId);
    if (!profile) {
      throw new Error('User profile not found');
    }

    const tempoValues = profile.listeningHistory
      .filter(t => t.tempo)
      .map(t => t.tempo!);

    return {
      topGenres: profile.favoriteGenres,
      moodBreakdown: profile.moodPreferences,
      tempoRange: {
        min: Math.min(...tempoValues),
        max: Math.max(...tempoValues),
        average: profile.preferredTempo
      },
      discoveryScore: this.calculateDiscoveryScore(profile)
    };
  }

  private calculateDiscoveryScore(profile: UserProfile): number {
    const popularTracks = profile.listeningHistory.filter(t => 
      t.popularity && t.popularity > 70
    );
    const totalTracks = profile.listeningHistory.length;
    
    return totalTracks > 0 ? (totalTracks - popularTracks.length) / totalTracks : 0;
  }
}

// Memoized recommendation engine for performance
export const createRecommendationEngine = memoize(() => new AIRecommendationEngine(), 1);

// Export singleton instance
export const recommendationEngine = createRecommendationEngine();
