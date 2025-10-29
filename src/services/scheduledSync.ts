// Scheduled sync system for automatic playlist synchronization
import { memoize } from '../utils/performance';

export interface ScheduledSyncJob {
  id: string;
  name: string;
  description?: string;
  userId: string;
  sourcePlaylistId: string;
  targetPlaylistId: string;
  schedule: SyncSchedule;
  settings: SyncSettings;
  status: 'active' | 'paused' | 'disabled' | 'error';
  lastRunAt?: Date;
  nextRunAt: Date;
  runCount: number;
  successCount: number;
  failureCount: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: SyncMetadata;
}

export interface SyncSchedule {
  type: 'interval' | 'daily' | 'weekly' | 'monthly' | 'custom';
  interval?: number; // minutes for interval type
  time?: string; // HH:MM for daily/weekly/monthly
  daysOfWeek?: number[]; // 0-6 for weekly (Sunday = 0)
  dayOfMonth?: number; // 1-31 for monthly
  timezone: string;
  startDate?: Date;
  endDate?: Date;
  maxRuns?: number; // 0 = unlimited
}

export interface SyncSettings {
  conflictResolution: 'auto' | 'manual' | 'hybrid';
  duplicateHandling: 'skip' | 'merge' | 'replace' | 'append';
  metadataSync: boolean;
  orderPreservation: boolean;
  batchSize: number;
  retryAttempts: number;
  conflictThreshold: number;
  smartMatching: boolean;
  fingerprinting: boolean;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notifyOnConflict: boolean;
  autoRetry: boolean;
  retryDelay: number; // minutes
  maxRetries: number;
}

export interface SyncMetadata {
  averageDuration: number;
  averageTracksProcessed: number;
  averageConflicts: number;
  lastSyncStats?: {
    duration: number;
    tracksProcessed: number;
    conflicts: number;
    errors: number;
  };
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface SyncExecutionResult {
  success: boolean;
  jobId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  tracksProcessed: number;
  conflicts: number;
  errors: number;
  errorMessage?: string;
  metadata: Record<string, any>;
}

export class ScheduledSyncService {
  private scheduledJobs: Map<string, ScheduledSyncJob> = new Map();
  private userJobs: Map<string, Set<string>> = new Map();
  private executionHistory: Map<string, SyncExecutionResult[]> = new Map();
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor() {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    // Load existing scheduled jobs from storage
    await this.loadScheduledJobs();
    
    // Start the scheduler
    this.startScheduler();
    
    // Set up periodic cleanup
    setInterval(() => this.cleanupOldExecutions(), 24 * 60 * 60 * 1000); // Daily cleanup
  }

  // Create a new scheduled sync job
  async createScheduledSyncJob(
    userId: string,
    name: string,
    sourcePlaylistId: string,
    targetPlaylistId: string,
    schedule: SyncSchedule,
    settings?: Partial<SyncSettings>,
    description?: string
  ): Promise<ScheduledSyncJob> {
    const defaultSettings: SyncSettings = {
      conflictResolution: 'auto',
      duplicateHandling: 'skip',
      metadataSync: true,
      orderPreservation: true,
      batchSize: 50,
      retryAttempts: 3,
      conflictThreshold: 0.8,
      smartMatching: true,
      fingerprinting: true,
      notifyOnSuccess: true,
      notifyOnFailure: true,
      notifyOnConflict: false,
      autoRetry: true,
      retryDelay: 15,
      maxRetries: 3
    };

    const job: ScheduledSyncJob = {
      id: this.generateJobId(),
      name,
      description,
      userId,
      sourcePlaylistId,
      targetPlaylistId,
      schedule,
      settings: { ...defaultSettings, ...settings },
      status: 'active',
      nextRunAt: this.calculateNextRunTime(schedule),
      runCount: 0,
      successCount: 0,
      failureCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        averageDuration: 0,
        averageTracksProcessed: 0,
        averageConflicts: 0,
        tags: [],
        priority: 'medium'
      }
    };

    this.scheduledJobs.set(job.id, job);
    this.addUserJob(userId, job.id);
    this.scheduleJob(job);

    // Save to persistent storage
    await this.saveScheduledJobs();

    return job;
  }

  // Update an existing scheduled sync job
  async updateScheduledSyncJob(
    jobId: string,
    updates: Partial<Omit<ScheduledSyncJob, 'id' | 'userId' | 'createdAt'>>
  ): Promise<ScheduledSyncJob> {
    const job = this.scheduledJobs.get(jobId);
    if (!job) {
      throw new Error('Scheduled sync job not found');
    }

    // Update job properties
    Object.assign(job, updates);
    job.updatedAt = new Date();

    // Recalculate next run time if schedule changed
    if (updates.schedule) {
      job.nextRunAt = this.calculateNextRunTime(updates.schedule);
    }

    // Reschedule the job
    this.unscheduleJob(jobId);
    this.scheduleJob(job);

    // Save to persistent storage
    await this.saveScheduledJobs();

    return job;
  }

  // Delete a scheduled sync job
  async deleteScheduledSyncJob(jobId: string): Promise<boolean> {
    const job = this.scheduledJobs.get(jobId);
    if (!job) {
      return false;
    }

    // Remove from all collections
    this.scheduledJobs.delete(jobId);
    this.removeUserJob(job.userId, jobId);
    this.unscheduleJob(jobId);
    this.executionHistory.delete(jobId);

    // Save to persistent storage
    await this.saveScheduledJobs();

    return true;
  }

  // Pause a scheduled sync job
  async pauseScheduledSyncJob(jobId: string): Promise<boolean> {
    const job = this.scheduledJobs.get(jobId);
    if (!job || job.status !== 'active') {
      return false;
    }

    job.status = 'paused';
    job.updatedAt = new Date();
    this.unscheduleJob(jobId);

    await this.saveScheduledJobs();
    return true;
  }

  // Resume a paused scheduled sync job
  async resumeScheduledSyncJob(jobId: string): Promise<boolean> {
    const job = this.scheduledJobs.get(jobId);
    if (!job || job.status !== 'paused') {
      return false;
    }

    job.status = 'active';
    job.updatedAt = new Date();
    job.nextRunAt = this.calculateNextRunTime(job.schedule);
    this.scheduleJob(job);

    await this.saveScheduledJobs();
    return true;
  }

  // Execute a sync job immediately
  async executeSyncJobNow(jobId: string): Promise<SyncExecutionResult> {
    const job = this.scheduledJobs.get(jobId);
    if (!job) {
      throw new Error('Scheduled sync job not found');
    }

    return await this.executeJob(job);
  }

  // Get all scheduled sync jobs for a user
  async getUserScheduledJobs(userId: string): Promise<ScheduledSyncJob[]> {
    const jobIds = this.userJobs.get(userId) || new Set();
    const jobs: ScheduledSyncJob[] = [];

    for (const jobId of jobIds) {
      const job = this.scheduledJobs.get(jobId);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs.sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime());
  }

  // Get execution history for a job
  async getJobExecutionHistory(jobId: string, limit: number = 50): Promise<SyncExecutionResult[]> {
    const history = this.executionHistory.get(jobId) || [];
    return history
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  // Get upcoming scheduled runs
  async getUpcomingRuns(userId: string, limit: number = 10): Promise<Array<{ job: ScheduledSyncJob; nextRun: Date }>> {
    const userJobs = await this.getUserScheduledJobs(userId);
    const upcoming = userJobs
      .filter(job => job.status === 'active' && job.nextRunAt > new Date())
      .map(job => ({ job, nextRun: job.nextRunAt }))
      .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime());

    return upcoming.slice(0, limit);
  }

  // Start the scheduler
  private startScheduler(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.processScheduledJobs();
  }

  // Stop the scheduler
  private stopScheduler(): void {
    this.isRunning = false;
    
    // Clear all active timers
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }

  // Process scheduled jobs
  private async processScheduledJobs(): Promise<void> {
    if (!this.isRunning) return;

    const now = new Date();
    const dueJobs: ScheduledSyncJob[] = [];

    // Find jobs that are due to run
    for (const job of this.scheduledJobs.values()) {
      if (job.status === 'active' && job.nextRunAt <= now) {
        dueJobs.push(job);
      }
    }

    // Execute due jobs
    for (const job of dueJobs) {
      try {
        await this.executeJob(job);
      } catch (error) {
        console.error(`Error executing scheduled sync job ${job.id}:`, error);
        job.status = 'error';
        job.lastError = error.message;
        job.updatedAt = new Date();
      }
    }

    // Schedule next check
    const nextCheckDelay = this.calculateNextCheckDelay();
    setTimeout(() => this.processScheduledJobs(), nextCheckDelay);
  }

  // Execute a single sync job
  private async executeJob(job: ScheduledSyncJob): Promise<SyncExecutionResult> {
    const startTime = new Date();
    let success = false;
    let errorMessage: string | undefined;
    let tracksProcessed = 0;
    let conflicts = 0;
    let errors = 0;

    try {
      // Update job status
      job.lastRunAt = startTime;
      job.runCount++;
      job.updatedAt = new Date();

      // Execute the actual sync (this would integrate with your sync engine)
      const result = await this.performSync(job);
      
      success = result.success;
      tracksProcessed = result.tracksProcessed;
      conflicts = result.conflicts;
      errors = result.errors;
      errorMessage = result.errorMessage;

      // Update job statistics
      if (success) {
        job.successCount++;
        job.status = 'active';
        job.lastError = undefined;
      } else {
        job.failureCount++;
        if (job.failureCount >= job.settings.maxRetries) {
          job.status = 'error';
        }
        job.lastError = errorMessage;
      }

      // Calculate next run time
      job.nextRunAt = this.calculateNextRunTime(job.schedule);

      // Reschedule the job
      this.unscheduleJob(job.id);
      this.scheduleJob(job);

    } catch (error) {
      success = false;
      errorMessage = error.message;
      job.failureCount++;
      job.status = 'error';
      job.lastError = errorMessage;
      job.updatedAt = new Date();
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    // Create execution result
    const executionResult: SyncExecutionResult = {
      success,
      jobId: job.id,
      startTime,
      endTime,
      duration,
      tracksProcessed,
      conflicts,
      errors,
      errorMessage,
      metadata: {
        sourcePlaylist: job.sourcePlaylistId,
        targetPlaylist: job.targetPlaylistId,
        scheduleType: job.schedule.type
      }
    };

    // Store execution history
    if (!this.executionHistory.has(job.id)) {
      this.executionHistory.set(job.id, []);
    }
    this.executionHistory.get(job.id)!.push(executionResult);

    // Update metadata averages
    this.updateJobMetadata(job, executionResult);

    // Save to persistent storage
    await this.saveScheduledJobs();

    // Send notifications if configured
    await this.sendNotifications(job, executionResult);

    return executionResult;
  }

  // Perform the actual sync operation
  private async performSync(job: ScheduledSyncJob): Promise<{
    success: boolean;
    tracksProcessed: number;
    conflicts: number;
    errors: number;
    errorMessage?: string;
  }> {
    // This would integrate with your existing sync engine
    // For now, return a mock result
    return {
      success: true,
      tracksProcessed: Math.floor(Math.random() * 100) + 10,
      conflicts: Math.floor(Math.random() * 5),
      errors: 0
    };
  }

  // Calculate next run time based on schedule
  private calculateNextRunTime(schedule: SyncSchedule): Date {
    const now = new Date();
    let nextRun = new Date(now);

    switch (schedule.type) {
      case 'interval':
        if (schedule.interval) {
          nextRun.setMinutes(nextRun.getMinutes() + schedule.interval);
        }
        break;

      case 'daily':
        if (schedule.time) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          nextRun.setHours(hours, minutes, 0, 0);
          if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1);
          }
        }
        break;

      case 'weekly':
        if (schedule.time && schedule.daysOfWeek) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          const currentDay = now.getDay();
          const nextDay = schedule.daysOfWeek.find(day => day > currentDay) || schedule.daysOfWeek[0];
          
          if (nextDay > currentDay) {
            nextRun.setDate(now.getDate() + (nextDay - currentDay));
          } else {
            nextRun.setDate(now.getDate() + (7 - currentDay + nextDay));
          }
          nextRun.setHours(hours, minutes, 0, 0);
        }
        break;

      case 'monthly':
        if (schedule.time && schedule.dayOfMonth) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          nextRun.setDate(schedule.dayOfMonth);
          nextRun.setHours(hours, minutes, 0, 0);
          
          if (nextRun <= now) {
            nextRun.setMonth(nextRun.getMonth() + 1);
          }
        }
        break;

      case 'custom':
        // Custom scheduling logic would go here
        nextRun.setHours(now.getHours() + 1, 0, 0, 0);
        break;
    }

    return nextRun;
  }

  // Calculate delay until next check
  private calculateNextCheckDelay(): number {
    const now = new Date();
    let nextCheck = new Date(now.getTime() + 60000); // Default: 1 minute

    // Find the next job that needs to run
    for (const job of this.scheduledJobs.values()) {
      if (job.status === 'active' && job.nextRunAt > now) {
        if (job.nextRunAt < nextCheck) {
          nextCheck = job.nextRunAt;
        }
      }
    }

    const delay = nextCheck.getTime() - now.getTime();
    return Math.max(delay, 60000); // Minimum 1 minute
  }

  // Schedule a job
  private scheduleJob(job: ScheduledSyncJob): void {
    if (job.status !== 'active') return;

    const now = new Date();
    const delay = job.nextRunAt.getTime() - now.getTime();

    if (delay > 0) {
      const timer = setTimeout(() => {
        this.executeJob(job).catch(console.error);
      }, delay);

      this.activeTimers.set(job.id, timer);
    }
  }

  // Unschedule a job
  private unscheduleJob(jobId: string): void {
    const timer = this.activeTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(jobId);
    }
  }

  // Update job metadata with execution results
  private updateJobMetadata(job: ScheduledSyncJob, result: SyncExecutionResult): void {
    const history = this.executionHistory.get(job.id) || [];
    const recentResults = history.slice(-10); // Last 10 executions

    if (recentResults.length > 0) {
      job.metadata.averageDuration = recentResults.reduce((sum, r) => sum + r.duration, 0) / recentResults.length;
      job.metadata.averageTracksProcessed = recentResults.reduce((sum, r) => sum + r.tracksProcessed, 0) / recentResults.length;
      job.metadata.averageConflicts = recentResults.reduce((sum, r) => sum + r.conflicts, 0) / recentResults.length;
    }
  }

  // Send notifications based on job settings
  private async sendNotifications(job: ScheduledSyncJob, result: SyncExecutionResult): Promise<void> {
    // This would integrate with your notification system
    if (result.success && job.settings.notifyOnSuccess) {
      // Send success notification
    } else if (!result.success && job.settings.notifyOnFailure) {
      // Send failure notification
    }

    if (result.conflicts > 0 && job.settings.notifyOnConflict) {
      // Send conflict notification
    }
  }

  // Clean up old execution history
  private cleanupOldExecutions(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep 30 days

    for (const [jobId, history] of this.executionHistory.entries()) {
      const filteredHistory = history.filter(execution => execution.startTime > cutoffDate);
      if (filteredHistory.length !== history.length) {
        this.executionHistory.set(jobId, filteredHistory);
      }
    }
  }

  // Helper methods
  private addUserJob(userId: string, jobId: string): void {
    if (!this.userJobs.has(userId)) {
      this.userJobs.set(userId, new Set());
    }
    this.userJobs.get(userId)!.add(jobId);
  }

  private removeUserJob(userId: string, jobId: string): void {
    const userJobs = this.userJobs.get(userId);
    if (userJobs) {
      userJobs.delete(jobId);
    }
  }

  private generateJobId(): string {
    return `scheduled_sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Persistence methods
  private async loadScheduledJobs(): Promise<void> {
    // This would load jobs from persistent storage
    // For now, we'll start with an empty state
  }

  private async saveScheduledJobs(): Promise<void> {
    // This would save jobs to persistent storage
    // For now, we'll just log that we would save
    console.log('Saving scheduled jobs to persistent storage');
  }

  // Get service status
  getServiceStatus(): {
    isRunning: boolean;
    totalJobs: number;
    activeJobs: number;
    pausedJobs: number;
    errorJobs: number;
    nextExecution: Date | null;
  } {
    const jobs = Array.from(this.scheduledJobs.values());
    const activeJobs = jobs.filter(j => j.status === 'active');
    const pausedJobs = jobs.filter(j => j.status === 'paused');
    const errorJobs = jobs.filter(j => j.status === 'error');

    let nextExecution: Date | null = null;
    if (activeJobs.length > 0) {
      nextExecution = activeJobs.reduce((earliest, job) => 
        job.nextRunAt < earliest.nextRunAt ? job : earliest
      ).nextRunAt;
    }

    return {
      isRunning: this.isRunning,
      totalJobs: jobs.length,
      activeJobs: activeJobs.length,
      pausedJobs: pausedJobs.length,
      errorJobs: errorJobs.length,
      nextExecution
    };
  }
}

// Export singleton instance
export const scheduledSyncService = new ScheduledSyncService();
