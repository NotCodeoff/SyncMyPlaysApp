/**
 * Audio Fingerprinting Service
 * Integrates with ACRCloud for audio-based track matching
 * Fallback for when metadata matching fails
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const cacheService = require('./cacheService');

class AudioFingerprintingService {
  constructor() {
    this.acrcloudConfig = {
      host: process.env.ACRCLOUD_HOST || 'identify-eu-west-1.acrcloud.com',
      accessKey: process.env.ACRCLOUD_ACCESS_KEY || '',
      accessSecret: process.env.ACRCLOUD_ACCESS_SECRET || '',
      enabled: process.env.ENABLE_AUDIO_FINGERPRINTING === 'true'
    };
  }

  /**
   * Check if audio fingerprinting is enabled and configured
   */
  isEnabled() {
    return this.acrcloudConfig.enabled && 
           this.acrcloudConfig.accessKey && 
           this.acrcloudConfig.accessSecret;
  }

  /**
   * Generate ACRCloud signature
   */
  generateSignature(stringToSign) {
    return crypto
      .createHmac('sha1', this.acrcloudConfig.accessSecret)
      .update(Buffer.from(stringToSign, 'utf-8'))
      .digest('base64');
  }

  /**
   * Identify track by audio sample
   * @param {Buffer} audioBuffer - Audio file buffer
   * @returns {Promise<Object>} Match result
   */
  async identifyByAudio(audioBuffer) {
    if (!this.isEnabled()) {
      logger.warn('Audio fingerprinting not enabled or configured');
      return { success: false, reason: 'not_enabled' };
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const stringToSign = `POST\n/v1/identify\n${this.acrcloudConfig.accessKey}\naudio\n1\n${timestamp}`;
      const signature = this.generateSignature(stringToSign);

      const formData = new FormData();
      formData.append('sample', audioBuffer);
      formData.append('access_key', this.acrcloudConfig.accessKey);
      formData.append('data_type', 'audio');
      formData.append('signature_version', '1');
      formData.append('signature', signature);
      formData.append('sample_bytes', audioBuffer.length.toString());
      formData.append('timestamp', timestamp.toString());

      const response = await axios.post(
        `https://${this.acrcloudConfig.host}/v1/identify`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 10000
        }
      );

      return this.parseACRCloudResponse(response.data);
    } catch (error) {
      logger.error('Audio fingerprinting failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Identify track by URL (for preview URLs)
   * @param {string} previewUrl - URL to audio preview
   * @returns {Promise<Object>} Match result
   */
  async identifyByUrl(previewUrl) {
    if (!this.isEnabled()) {
      return { success: false, reason: 'not_enabled' };
    }

    // Check cache first
    const cacheKey = `fingerprint:${Buffer.from(previewUrl).toString('base64')}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      logger.debug('Audio fingerprint cache hit', { url: previewUrl });
      return cached;
    }

    try {
      // Download audio sample
      const audioResponse = await axios.get(previewUrl, {
        responseType: 'arraybuffer',
        timeout: 5000
      });

      const result = await this.identifyByAudio(Buffer.from(audioResponse.data));

      // Cache successful results for 7 days
      if (result.success) {
        await cacheService.set(cacheKey, result, 604800);
      }

      return result;
    } catch (error) {
      logger.error('URL-based fingerprinting failed', { url: previewUrl, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse ACRCloud API response
   */
  parseACRCloudResponse(data) {
    if (data.status?.code !== 0) {
      return {
        success: false,
        reason: data.status?.msg || 'Unknown error'
      };
    }

    const music = data.metadata?.music?.[0];
    if (!music) {
      return {
        success: false,
        reason: 'No match found'
      };
    }

    return {
      success: true,
      track: {
        title: music.title,
        artists: music.artists?.map(a => a.name) || [],
        album: music.album?.name,
        isrc: music.external_ids?.isrc,
        duration_ms: music.duration_ms,
        releaseDate: music.release_date,
        score: music.score || 100
      },
      spotify: music.external_metadata?.spotify,
      appleMusic: music.external_metadata?.apple_music,
      youtube: music.external_metadata?.youtube,
      confidence: music.score >= 90 ? 'high' : music.score >= 70 ? 'medium' : 'low'
    };
  }

  /**
   * Match track using audio fingerprinting as fallback
   * @param {Object} track - Track to match
   * @param {string} previewUrl - Preview audio URL
   * @returns {Promise<Object>} Match result
   */
  async matchWithFingerprint(track, previewUrl) {
    if (!this.isEnabled()) {
      logger.debug('Audio fingerprinting disabled, skipping');
      return null;
    }

    if (!previewUrl) {
      logger.debug('No preview URL provided for fingerprinting');
      return null;
    }

    logger.info('Attempting audio fingerprint match', {
      trackName: track.name,
      artist: track.artists?.[0]
    });

    const result = await this.identifyByUrl(previewUrl);

    if (result.success) {
      logger.info('Audio fingerprint match found', {
        trackName: track.name,
        matchedTitle: result.track.title,
        confidence: result.confidence,
        score: result.track.score
      });
    } else {
      logger.warn('Audio fingerprint match failed', {
        trackName: track.name,
        reason: result.reason
      });
    }

    return result;
  }

  /**
   * Bulk identify tracks (batch processing)
   */
  async bulkIdentify(tracks) {
    if (!this.isEnabled()) {
      return { success: false, reason: 'not_enabled' };
    }

    const results = [];

    for (const track of tracks) {
      if (track.previewUrl) {
        const result = await this.matchWithFingerprint(track, track.previewUrl);
        results.push({
          originalTrack: track,
          fingerprintResult: result
        });

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      success: true,
      results,
      matched: results.filter(r => r.fingerprintResult?.success).length,
      failed: results.filter(r => !r.fingerprintResult?.success).length
    };
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      enabled: this.isEnabled(),
      configured: !!(this.acrcloudConfig.accessKey && this.acrcloudConfig.accessSecret),
      provider: 'ACRCloud'
    };
  }
}

// Export singleton instance
module.exports = new AudioFingerprintingService();

