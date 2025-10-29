import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FaUsers, 
  FaChartBar, 
  FaCog, 
  FaServer, 
  FaDatabase, 
  FaShieldAlt,
  FaSync,
  FaPlay,
  FaPause,
  FaStop,
  FaTrash,
  FaEdit,
  FaEye,
  FaDownload,
  FaUpload
} from 'react-icons/fa';
import { ProgressBar, CircularProgress } from './LoadingStates';
import { API_CONFIG, buildApiUrl } from '../config/api';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalPlaylists: number;
  totalSyncJobs: number;
  activeSyncJobs: number;
  systemHealth: 'excellent' | 'good' | 'warning' | 'critical';
  storageUsed: number;
  storageTotal: number;
  apiRequests: number;
  errorRate: number;
}

interface User {
  id: string;
  username: string;
  email: string;
  status: 'active' | 'inactive' | 'suspended';
  plan: 'free' | 'premium' | 'enterprise';
  lastActive: Date;
  playlistsCount: number;
  syncJobsCount: number;
  storageUsed: number;
}

interface SyncJob {
  id: string;
  userId: string;
  username: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  sourcePlaylist: string;
  targetPlaylist: string;
  startTime: Date;
  estimatedTime: number;
  conflicts: number;
  errors: number;
}

interface SystemLog {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: Date;
  userId?: string;
  action?: string;
  metadata?: Record<string, any>;
}

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedJob, setSelectedJob] = useState<SyncJob | null>(null);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 10000); // Refresh every 10 seconds for faster updates
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // This would fetch data from your backend APIs
      const mockStats: AdminStats = {
        totalUsers: 1250,
        activeUsers: 892,
        totalPlaylists: 5670,
        totalSyncJobs: 12340,
        activeSyncJobs: 45,
        systemHealth: 'good',
        storageUsed: 45.2,
        storageTotal: 100,
        apiRequests: 45678,
        errorRate: 0.8
      };

      const mockUsers: User[] = Array.from({ length: 20 }, (_, i) => ({
        id: `user_${i}`,
        username: `user${i}`,
        email: `user${i}@example.com`,
        status: ['active', 'inactive', 'suspended'][Math.floor(Math.random() * 3)] as User['status'],
        plan: ['free', 'premium', 'enterprise'][Math.floor(Math.random() * 3)] as User['plan'],
        lastActive: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        playlistsCount: Math.floor(Math.random() * 50),
        syncJobsCount: Math.floor(Math.random() * 100),
        storageUsed: Math.random() * 100
      }));

      const mockSyncJobs: SyncJob[] = Array.from({ length: 15 }, (_, i) => ({
        id: `job_${i}`,
        userId: `user_${Math.floor(Math.random() * 20)}`,
        username: `user${Math.floor(Math.random() * 20)}`,
        status: ['running', 'completed', 'failed', 'paused'][Math.floor(Math.random() * 4)] as SyncJob['status'],
        progress: Math.floor(Math.random() * 100),
        sourcePlaylist: `Playlist ${Math.floor(Math.random() * 100)}`,
        targetPlaylist: `Playlist ${Math.floor(Math.random() * 100)}`,
        startTime: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
        estimatedTime: Math.floor(Math.random() * 300),
        conflicts: Math.floor(Math.random() * 10),
        errors: Math.floor(Math.random() * 5)
      }));

      const mockSystemLogs: SystemLog[] = Array.from({ length: 25 }, (_, i) => ({
        id: `log_${i}`,
        level: ['info', 'warning', 'error', 'critical'][Math.floor(Math.random() * 4)] as SystemLog['level'],
        message: `System log message ${i + 1}`,
        timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
        userId: Math.random() > 0.5 ? `user_${Math.floor(Math.random() * 20)}` : undefined,
        action: Math.random() > 0.7 ? 'sync' : undefined
      }));

      setStats(mockStats);
      setUsers(mockUsers);
      setSyncJobs(mockSyncJobs);
      setSystemLogs(mockSystemLogs);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserAction = (userId: string, action: string) => {
    // This would perform the actual action
    console.log(`Performing ${action} on user ${userId}`);
  };

  const handleJobAction = (jobId: string, action: string) => {
    // This would perform the actual action
    console.log(`Performing ${action} on job ${jobId}`);
  };



  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="flex items-center justify-center h-64">
          <CircularProgress percentage={0} size={48} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-gray-400 mt-2">System monitoring and user management</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              stats?.systemHealth === 'excellent' ? 'bg-green-100 text-green-800' :
              stats?.systemHealth === 'good' ? 'bg-blue-100 text-blue-800' :
              stats?.systemHealth === 'warning' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              System: {stats?.systemHealth}
            </div>
            <button 
              onClick={loadDashboardData}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center space-x-2"
            >
              <FaSync className="text-sm" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="flex space-x-8 px-6">
          {[
            { id: 'overview', label: 'Overview', icon: FaChartBar },
            { id: 'users', label: 'Users', icon: FaUsers },
            { id: 'sync', label: 'Sync Jobs', icon: FaSync },
            { id: 'system', label: 'System', icon: FaServer },
            { id: 'settings', label: 'Settings', icon: FaCog }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-4 px-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              <tab.icon className="text-sm" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'overview' && (
          <OverviewTab stats={stats} />
        )}
        
        {activeTab === 'users' && (
          <UsersTab 
            users={users} 
            onUserAction={handleUserAction}
            onUserSelect={setSelectedUser}
            selectedUser={selectedUser}
          />
        )}
        
        {activeTab === 'sync' && (
          <SyncJobsTab 
            syncJobs={syncJobs}
            onJobAction={handleJobAction}
            onJobSelect={setSelectedJob}
            selectedJob={selectedJob}
          />
        )}
        
        {activeTab === 'system' && (
          <SystemTab systemLogs={systemLogs} />
        )}
        
        {activeTab === 'settings' && (
          <SettingsTab />
        )}
      </div>
    </div>
  );
};

// Overview Tab Component
const OverviewTab: React.FC<{ stats: AdminStats | null }> = ({ stats }) => {
  if (!stats) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Users"
          value={stats.totalUsers.toLocaleString()}
          change="+12%"
          changeType="positive"
          icon={FaUsers}
        />
        <StatCard
          title="Active Users"
          value={stats.activeUsers.toLocaleString()}
          change="+8%"
          changeType="positive"
          icon={FaChartBar}
        />
        <StatCard
          title="Total Playlists"
          value={stats.totalPlaylists.toLocaleString()}
          change="+15%"
          changeType="positive"
          icon={FaSync}
        />
        <StatCard
          title="Active Sync Jobs"
          value={stats.activeSyncJobs.toString()}
          change="-5%"
          changeType="negative"
          icon={FaServer}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">System Health</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Storage Usage</span>
              <span className="text-sm text-gray-400">
                {stats.storageUsed.toFixed(1)}GB / {stats.storageTotal}GB
              </span>
            </div>
            <ProgressBar
              current={stats.storageUsed}
              total={stats.storageTotal}
              status="Storage Usage"
            />
            
            <div className="flex items-center justify-between">
              <span>API Requests (24h)</span>
              <span className="text-sm text-gray-400">
                {stats.apiRequests.toLocaleString()}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Error Rate</span>
              <span className="text-sm text-gray-400">
                {stats.errorRate}%
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center space-x-3 text-sm">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-gray-400">User {i} completed sync job</span>
                <span className="text-gray-500 ml-auto">2m ago</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Users Tab Component
const UsersTab: React.FC<{
  users: User[];
  onUserAction: (userId: string, action: string) => void;
  onUserSelect: (user: User | null) => void;
  selectedUser: User | null;
}> = ({ users, onUserAction, onUserSelect, selectedUser }) => {
  return (
          <motion.div
      initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">User Management</h2>
        <button className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg flex items-center space-x-2">
          <FaUpload className="text-sm" />
          <span>Export Users</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Plan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Last Active
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {users.map(user => (
                    <tr 
                      key={user.id}
                      className={`hover:bg-gray-700 cursor-pointer ${
                        selectedUser?.id === user.id ? 'bg-gray-700' : ''
                      }`}
                      onClick={() => onUserSelect(user)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-white">{user.username}</div>
                          <div className="text-sm text-gray-400">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.status === 'active' ? 'bg-green-100 text-green-800' :
                          user.status === 'inactive' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {user.plan}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {user.lastActive.toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUserAction(user.id, 'view');
                            }}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <FaEye />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUserAction(user.id, 'edit');
                            }}
                            className="text-yellow-400 hover:text-yellow-300"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUserAction(user.id, 'suspend');
                            }}
                            className="text-red-400 hover:text-red-300"
                          >
                            <FaPause />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {selectedUser && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">User Details</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400">Username</label>
                <div className="text-white">{selectedUser.username}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Email</label>
                <div className="text-white">{selectedUser.email}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Status</label>
                <div className="text-white">{selectedUser.status}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Plan</label>
                <div className="text-white">{selectedUser.plan}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Playlists</label>
                <div className="text-white">{selectedUser.playlistsCount}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Sync Jobs</label>
                <div className="text-white">{selectedUser.syncJobsCount}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Storage Used</label>
                <div className="text-white">{selectedUser.storageUsed.toFixed(2)}GB</div>
              </div>
            </div>
        </div>
        )}
            </div>
    </motion.div>
  );
};

// Sync Jobs Tab Component
const SyncJobsTab: React.FC<{
  syncJobs: SyncJob[];
  onJobAction: (jobId: string, action: string) => void;
  onJobSelect: (job: SyncJob | null) => void;
  selectedJob: SyncJob | null;
}> = ({ syncJobs, onJobAction, onJobSelect, selectedJob }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'running':
      case 'completed':
        return 'text-green-500';
      case 'inactive':
      case 'paused':
        return 'text-yellow-500';
      case 'suspended':
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <FaPlay className="text-green-500" />;
      case 'paused':
        return <FaPause className="text-yellow-500" />;
      case 'completed':
        return <FaSync className="text-blue-500" />;
      case 'failed':
        return <FaStop className="text-red-500" />;
      default:
        return null;
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Sync Job Management</h2>
        <div className="flex space-x-2">
          <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center space-x-2">
            <FaPlay className="text-sm" />
            <span>Start All</span>
          </button>
          <button className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg flex items-center space-x-2">
            <FaPause className="text-sm" />
            <span>Pause All</span>
              </button>
            </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Job
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Conflicts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {syncJobs.map(job => (
                    <tr 
                      key={job.id}
                      className={`hover:bg-gray-700 cursor-pointer ${
                        selectedJob?.id === job.id ? 'bg-gray-700' : ''
                      }`}
                      onClick={() => onJobSelect(job)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-white">{job.username}</div>
                          <div className="text-sm text-gray-400">
                            {job.sourcePlaylist} → {job.targetPlaylist}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(job.status)}
                          <span className={`text-sm ${getStatusColor(job.status)}`}>
                            {job.status}
              </span>
            </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="w-24">
                          <ProgressBar
                            current={job.progress}
                            total={100}
                            status=""
                            showPercentage={false}
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {job.conflicts} conflicts, {job.errors} errors
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          {job.status === 'running' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onJobAction(job.id, 'pause');
                              }}
                              className="text-yellow-400 hover:text-yellow-300"
                            >
                              <FaPause />
                            </button>
                          )}
                          {job.status === 'paused' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onJobAction(job.id, 'resume');
                              }}
                              className="text-green-400 hover:text-green-300"
                            >
                              <FaPlay />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onJobAction(job.id, 'stop');
                            }}
                            className="text-red-400 hover:text-red-300"
                          >
                            <FaStop />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {selectedJob && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Job Details</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400">User</label>
                <div className="text-white">{selectedJob.username}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Source</label>
                <div className="text-white">{selectedJob.sourcePlaylist}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Target</label>
                <div className="text-white">{selectedJob.targetPlaylist}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Status</label>
                <div className="text-white">{selectedJob.status}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Progress</label>
                <div className="text-white">{selectedJob.progress}%</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Conflicts</label>
                <div className="text-white">{selectedJob.conflicts}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Errors</label>
                <div className="text-white">{selectedJob.errors}</div>
              </div>
            </div>
            </div>
        )}
      </div>
    </motion.div>
  );
};

// System Tab Component
const SystemTab: React.FC<{ systemLogs: SystemLog[] }> = ({ systemLogs }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">System Monitoring</h2>
        <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center space-x-2">
          <FaDownload className="text-sm" />
          <span>Download Logs</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">System Logs</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {systemLogs.map(log => (
                <div key={log.id} className="flex items-start space-x-3 p-3 bg-gray-700 rounded">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    log.level === 'info' ? 'bg-blue-500' :
                    log.level === 'warning' ? 'bg-yellow-500' :
                    log.level === 'error' ? 'bg-red-500' :
                    'bg-purple-500'
                  }`}></div>
                  <div className="flex-1">
                    <div className="text-sm text-white">{log.message}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {log.timestamp.toLocaleString()}
                      {log.userId && ` • User: ${log.userId}`}
                      {log.action && ` • Action: ${log.action}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">System Status</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">CPU Usage</span>
                <span className="text-white">45%</span>
              </div>
              <ProgressBar current={45} total={100} status="" showPercentage={false} />
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Memory Usage</span>
                <span className="text-white">62%</span>
              </div>
              <ProgressBar current={62} total={100} status="" showPercentage={false} />
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Disk Usage</span>
                <span className="text-white">78%</span>
              </div>
              <ProgressBar current={78} total={100} status="" showPercentage={false} />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button className="w-full bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm">
                Restart Services
              </button>
              <button className="w-full bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded text-sm">
                Clear Cache
              </button>
              <button className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm">
                Backup Database
              </button>
            </div>
          </div>
        </div>
        </div>
      </motion.div>
  );
};

// Settings Tab Component
const SettingsTab: React.FC = () => {
  const [developerToken, setDeveloperToken] = useState('');
  const [tokenStatus, setTokenStatus] = useState<'loading' | 'set' | 'not-set' | 'error'>('loading');
  const [tokenMessage, setTokenMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // Spotify OAuth configuration state
  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [spotifyClientSecret, setSpotifyClientSecret] = useState('');
  const [spotifyRedirectUri, setSpotifyRedirectUri] = useState('');
  const [spotifyConfigStatus, setSpotifyConfigStatus] = useState<'loading' | 'set' | 'not-set' | 'error'>('loading');
  const [spotifyConfigMessage, setSpotifyConfigMessage] = useState('');
  const [savingSpotify, setSavingSpotify] = useState(false);

  useEffect(() => {
    checkTokenStatus();
    checkSpotifyConfig();
  }, []);

  const checkTokenStatus = async () => {
    try {
      setTokenStatus('loading');
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.APPLE_TOKEN_STATUS));
      const data = await response.json();
      
      if (data.hasToken) {
        setTokenStatus('set');
        setTokenMessage('Apple Music developer token is configured');
      } else {
        setTokenStatus('not-set');
        setTokenMessage('Apple Music developer token is not set');
      }
    } catch (error) {
      setTokenStatus('error');
      setTokenMessage('Failed to check token status');
    }
  };

  const checkSpotifyConfig = async () => {
    try {
      setSpotifyConfigStatus('loading');
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.SPOTIFY_CONFIG));
      const data = await response.json();
      
      if (data.hasConfig) {
        setSpotifyConfigStatus('set');
        setSpotifyConfigMessage('Spotify OAuth configuration is set');
        setSpotifyClientId(data.clientId);
        setSpotifyRedirectUri(data.redirectUri);
      } else {
        setSpotifyConfigStatus('not-set');
        setSpotifyConfigMessage('Spotify OAuth configuration is not set');
        setSpotifyRedirectUri(buildApiUrl(API_CONFIG.ENDPOINTS.SPOTIFY_CALLBACK));
      }
    } catch (error) {
      setSpotifyConfigStatus('error');
      setSpotifyConfigMessage('Failed to check Spotify configuration');
    }
  };

  const handleSaveToken = async () => {
    if (!developerToken.trim()) {
      setTokenMessage('Please enter a developer token');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.APPLE_SET_TOKEN), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ developerToken: developerToken.trim() }),
      });

      const data = await response.json();
      
      if (data.success) {
        setTokenStatus('set');
        setTokenMessage('Apple Music developer token saved successfully!');
        setDeveloperToken('');
        // Refresh token status
        setTimeout(checkTokenStatus, 250); // Faster token check
      } else {
        setTokenMessage('Failed to save token: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      setTokenMessage('Failed to save token: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSpotifyConfig = async () => {
    if (!spotifyClientId.trim() || !spotifyClientSecret.trim() || !spotifyRedirectUri.trim()) {
      setSpotifyConfigMessage('Please fill in all Spotify OAuth fields');
      return;
    }

    try {
      setSavingSpotify(true);
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.SPOTIFY_SET_CONFIG), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          clientId: spotifyClientId.trim(),
          clientSecret: spotifyClientSecret.trim(),
          redirectUri: spotifyRedirectUri.trim()
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setSpotifyConfigStatus('set');
        setSpotifyConfigMessage('Spotify OAuth configuration saved successfully!');
        setSpotifyClientSecret('');
        // Refresh config status
        setTimeout(checkSpotifyConfig, 250); // Faster config check
      } else {
        setSpotifyConfigMessage('Failed to save configuration: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      setSpotifyConfigMessage('Failed to save configuration: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSavingSpotify(false);
    }
  };

  const getTokenStatusColor = () => {
    switch (tokenStatus) {
      case 'set': return 'text-green-400';
      case 'not-set': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getSpotifyConfigStatusColor = () => {
    switch (spotifyConfigStatus) {
      case 'set': return 'text-green-400';
      case 'not-set': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="text-2xl font-bold mb-6">System Settings</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Spotify OAuth Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Configuration Status
              </label>
              <div className={`text-sm ${getSpotifyConfigStatusColor()}`}>
                {spotifyConfigStatus === 'loading' ? 'Checking...' : spotifyConfigMessage}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Spotify Client ID
              </label>
              <input
                type="text"
                value={spotifyClientId}
                onChange={(e) => setSpotifyClientId(e.target.value)}
                placeholder="Enter your Spotify Client ID"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Spotify Client Secret
              </label>
              <input
                type="password"
                value={spotifyClientSecret}
                onChange={(e) => setSpotifyClientSecret(e.target.value)}
                placeholder="Enter your Spotify Client Secret"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Redirect URI
              </label>
              <input
                type="text"
                value={spotifyRedirectUri}
                onChange={(e) => setSpotifyRedirectUri(e.target.value)}
                placeholder={buildApiUrl(API_CONFIG.ENDPOINTS.SPOTIFY_CALLBACK)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              />
            </div>
            <button
              onClick={handleSaveSpotifyConfig}
              disabled={savingSpotify || !spotifyClientId.trim() || !spotifyClientSecret.trim() || !spotifyRedirectUri.trim()}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-md text-white"
            >
              {savingSpotify ? 'Saving...' : 'Save Spotify Configuration'}
            </button>
            <div className="bg-gray-700 rounded-md p-3">
              <h4 className="text-sm font-medium text-gray-300 mb-2">How to get Spotify OAuth credentials:</h4>
              <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                <li>Go to <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300">Spotify Developer Dashboard</a></li>
                <li>Create a new app or use an existing one</li>
                <li>Copy the Client ID and Client Secret</li>
                <li>Add <code className="bg-gray-600 px-1 rounded">{buildApiUrl(API_CONFIG.ENDPOINTS.SPOTIFY_CALLBACK)}</code> to Redirect URIs</li>
                <li>Paste the credentials above and save</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Apple Music Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Developer Token Status
              </label>
              <div className={`text-sm ${getTokenStatusColor()}`}>
                {tokenStatus === 'loading' ? 'Checking...' : tokenMessage}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Apple Music Developer Token
              </label>
              <input
                type="text"
                value={developerToken}
                onChange={(e) => setDeveloperToken(e.target.value)}
                placeholder="Enter your Apple Music developer token"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Get your token from: <a href="https://music.apple.com/us/browse" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Apple Music Web</a>
              </p>
            </div>
            <button
              onClick={handleSaveToken}
              disabled={saving || !developerToken.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-md text-white"
            >
              {saving ? 'Saving...' : 'Save Developer Token'}
            </button>
            <div className="bg-gray-700 rounded-md p-3">
              <h4 className="text-sm font-medium text-gray-300 mb-2">How to get your Apple Music Developer Token:</h4>
              <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                <li>Go to <a href="https://music.apple.com/us/browse" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Apple Music Web</a></li>
                <li>Make sure you're logged in to your Apple Music account</li>
                <li>Press F12 to open Developer Tools</li>
                <li>Go to the Console tab</li>
                <li>Type: <code className="bg-gray-600 px-1 rounded">MusicKit.getInstance().developerToken</code></li>
                <li>Copy the token value and paste it above</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">General Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                System Name
              </label>
              <input
                type="text"
                defaultValue="SyncMyPlays Admin"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Admin Email
              </label>
              <input
                type="email"
                defaultValue="admin@syncmyplays.com"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Timezone
              </label>
              <select className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white">
                <option>UTC</option>
                <option>America/New_York</option>
                <option>Europe/London</option>
                <option>Asia/Tokyo</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Security Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Session Timeout (minutes)
              </label>
              <input
                type="number"
                defaultValue={30}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Max Login Attempts
              </label>
              <input
                type="number"
                defaultValue={5}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                defaultChecked
                className="mr-2"
              />
              <span className="text-sm text-gray-400">Enable Two-Factor Authentication</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg">
          Save Settings
        </button>
      </div>
    </motion.div>
  );
};

// Stat Card Component
const StatCard: React.FC<{
  title: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative';
  icon: React.ComponentType<any>;
}> = ({ title, value, change, changeType, icon: Icon }) => {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <Icon className="h-8 w-8 text-gray-400" />
        </div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className="text-sm font-medium text-gray-400 truncate">{title}</dt>
            <dd className="text-lg font-medium text-white">{value}</dd>
          </dl>
        </div>
      </div>
      <div className="mt-4">
        <div className={`text-sm ${
          changeType === 'positive' ? 'text-green-400' : 'text-red-400'
        }`}>
          {change} from last month
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
