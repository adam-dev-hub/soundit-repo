// services/audioAnalyzerFFmpeg.js - Migrated to @sheehanmunim/react-native-ffmpeg

import * as FileSystem from 'expo-file-system/legacy';
// --- MIGRATION: Use the stable FFmpeg Kit fork ---
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
const WAVEFORM_SAMPLES = 1000;
const TEMP_DIR = FileSystem.cacheDirectory + 'waveform_temp/';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit

// Helper for environments without global atob (common in RN)
const decodeBase64 = (str) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  str = String(str).replace(/=+$/, '');
  for (
    let bc = 0, bs = 0, buffer, i = 0;
    (buffer = str.charAt(i++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
};

export const audioAnalyzer = {
  /**
   * Main entry point - generates waveform with automatic method selection
   */
  async generateWaveform(localUri, onProgress = null) {
    try {
      console.log('🎵 Starting authentic FFmpeg Kit waveform analysis...');
      
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (!fileInfo.exists) {
        throw new Error('Audio file not found');
      }

      if (fileInfo.size > MAX_FILE_SIZE) {
        console.warn('⚠️ File too large for FFmpeg, using fast method');
        return this._generateFallbackWaveform();
      }

      await this._ensureTempDir();
      
      if (onProgress) onProgress(0.1, 'Extracting audio data...');
      const waveform = await this._extractWithPCM(localUri, onProgress);
      
      if (onProgress) onProgress(1.0, 'Complete!');
      
      console.log('✅ Waveform generated successfully');
      return waveform;

    } catch (error) {
      console.error('❌ FFmpeg analysis failed:', error.message);
      console.log('⚠️ Falling back to simple waveform');
      return this._generateFallbackWaveform();
    }
  },

  /**
   * PCM extraction method - converts audio to raw samples
   */
  async _extractWithPCM(localUri, onProgress) {
    const inputPath = localUri.replace('file://', '');
    const pcmPath = `${TEMP_DIR}audio_${Date.now()}.pcm`;
    
    try {
      // Command: Convert to mono PCM at 8kHz (s16le)
      const command = `-i "${inputPath}" -f s16le -ac 1 -ar 8000 -acodec pcm_s16le "${pcmPath}"`;
      
      console.log('🔧 Executing FFmpeg command...');
      
      // Execute command using the modern FFmpegKit API
      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();
      
      if (!ReturnCode.isSuccess(returnCode)) {
        const output = await session.getOutput();
        console.error('FFmpeg Output:', output);
        throw new Error(`FFmpeg execution failed with code: ${returnCode.getValue()}. See console for output.`);
      }

      if (onProgress) onProgress(0.5, 'Processing audio samples...');
      
      // Read and process the PCM file
      const waveform = await this._processPCMFile(pcmPath, onProgress);
      
      // Cleanup
      await FileSystem.deleteAsync(pcmPath, { idempotent: true });
      
      return waveform;
      
    } catch (error) {
      // Cleanup on error
      try {
        await FileSystem.deleteAsync(pcmPath, { idempotent: true });
      } catch {}
      throw error;
    }
  },

  /**
   * Process PCM file into waveform data
   */
  async _processPCMFile(pcmPath, onProgress) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(pcmPath);
      
      if (!fileInfo.exists) {
        throw new Error('PCM file was not created');
      }

      console.log('📊 Reading PCM data...');
      
      const base64Data = await FileSystem.readAsStringAsync(pcmPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      if (onProgress) onProgress(0.7, 'Analyzing amplitude...');
      
      const bytes = this._base64ToUint8Array(base64Data);
      const samples = [];
      const numBytes = bytes.length;

      // --- ASYNCHRONOUS CHUNKING: Prevents UI Freeze ---
      // We process 40,000 bytes (20,000 samples) at a time, yielding control 
      // back to the UI thread between chunks using setTimeout(0).
      const CHUNK_SIZE = 40000; 

      await new Promise(resolve => {
        let i = 0;
        
        const processChunk = () => {
          const start = i;
          const end = Math.min(i + CHUNK_SIZE, numBytes);

          // Synchronously process a chunk of bytes
          for (let j = start; j < end - 1; j += 2) {
            // Little-endian 16-bit conversion (Original logic)
            const sample = bytes[j] | (bytes[j + 1] << 8);
            const signed = sample > 32767 ? sample - 65536 : sample;
            samples.push(Math.abs(signed));
          }
          
          i = end;
          
          if (i < numBytes) {
            // Yield control back to the main thread
            if (onProgress) onProgress(0.7 + (i / numBytes) * 0.2, 'Analyzing amplitude...');
            setTimeout(processChunk, 0); 
          } else {
            resolve();
          }
        };

        processChunk();
      });
      // --- END ASYNCHRONOUS CHUNKING ---
      
      console.log(`📈 Extracted ${samples.length} samples`);
      
      if (onProgress) onProgress(0.9, 'Creating waveform...');
      
      const waveform = this._downsampleToWaveform(samples);
      
      return waveform;
      
    } catch (error) {
      console.error('Error processing PCM:', error);
      throw error;
    }
  },

  /**
   * Downsample raw samples to waveform bars
   */
  _downsampleToWaveform(samples) {
    if (samples.length === 0) {
      return this._generateFallbackWaveform();
    }

    const waveform = [];
    const samplesPerBar = Math.floor(samples.length / WAVEFORM_SAMPLES);
    
    if (samplesPerBar === 0) {
      return this._generateFallbackWaveform();
    }

    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, samples.length);
      const chunk = samples.slice(start, end);
      
      const rms = this._calculateRMS(chunk);
      waveform.push(rms);
    }
    
    return this._normalizeWaveform(waveform);
  },

  /**
   * Calculate Root Mean Square (RMS)
   */
  _calculateRMS(samples) {
    if (samples.length === 0) return 0;
    
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }
    
    const meanSquare = sumSquares / samples.length;
    return Math.sqrt(meanSquare);
  },

  /**
   * Normalize waveform to visual range (15-85)
   */
  _normalizeWaveform(data) {
    if (data.length === 0) return [];
    
    let max = -Infinity;
    let min = Infinity;
    
    for (let i = 0; i < data.length; i++) {
      if (data[i] > max) max = data[i];
      if (data[i] < min) min = data[i];
    }
    
    const range = max - min;
    if (range === 0) {
      return data.map(() => 50);
    }
    
    const normalized = [];
    for (let i = 0; i < data.length; i++) {
      const value = ((data[i] - min) / range) * 70 + 15;
      normalized.push(Math.round(value));
    }
    
    return this._smoothWaveform(normalized);
  },

  /**
   * Apply light smoothing to waveform
   */
  _smoothWaveform(data) {
    if (data.length < 3) return data;
    
    const smoothed = [data[0]]; 
    
    for (let i = 1; i < data.length - 1; i++) {
      const avg = (data[i - 1] + data[i] + data[i + 1]) / 3;
      smoothed.push(Math.round(avg));
    }
    
    smoothed.push(data[data.length - 1]);
    return smoothed;
  },

  /**
   * Convert base64 to Uint8Array efficiently
   */
  _base64ToUint8Array(base64) {
    try {
      const binaryString = global.atob ? global.atob(base64) : decodeBase64(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return bytes;
    } catch (error) {
      console.error('Base64 decode error:', error);
      throw error;
    }
  },

  /**
   * Fallback waveform with natural appearance
   */
  _generateFallbackWaveform() {
    const waveform = [];
    
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      const progress = i / WAVEFORM_SAMPLES;
      
      const wave1 = Math.sin(progress * Math.PI * 3) * 15;
      const wave2 = Math.sin(progress * Math.PI * 7) * 8;
      const noise = (Math.random() - 0.5) * 10;
      
      let envelope = 1;
      if (progress < 0.05) {
        envelope = progress / 0.05;
      } else if (progress > 0.95) {
        envelope = (1 - progress) / 0.05;
      }
      
      const value = 50 + (wave1 + wave2 + noise) * envelope;
      waveform.push(Math.round(Math.max(15, Math.min(85, value))));
    }
    
    return waveform;
  },

  /**
   * Ensure temp directory exists
   */
  async _ensureTempDir() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(TEMP_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(TEMP_DIR, { intermediates: true });
        console.log('📁 Created temp directory');
      }
    } catch (error) {
      console.warn('Could not create temp directory:', error);
    }
  },

  /**
   * Clean up all temp files
   */
  async cleanupTempFiles() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(TEMP_DIR);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(TEMP_DIR, { idempotent: true });
        console.log('🧹 Cleaned up temp files');
      }
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  },
  
  /**
   * Batch processing with progress tracking
   */
  async generateWaveformBatch(fileUris, onBatchProgress = null) {
    const results = [];
    
    for (let i = 0; i < fileUris.length; i++) {
      try {
        const uri = fileUris[i];
        
        const waveform = await this.generateWaveform(
          uri,
          (progress, status) => {
            if (onBatchProgress) {
              const overallProgress = (i + progress) / fileUris.length;
              onBatchProgress(overallProgress, uri, status);
            }
          }
        );
        
        results.push({ uri, waveform, success: true });
        
      } catch (error) {
        console.error(`Failed to process file ${i + 1}:`, error);
        results.push({ 
          uri: fileUris[i], 
          waveform: this._generateFallbackWaveform(), 
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  },

  /**
   * Get waveform info without generating
   */
  async canGenerateWaveform(localUri) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      
      return {
        canProcess: fileInfo.exists && fileInfo.size <= MAX_FILE_SIZE,
        fileSize: fileInfo.size,
        exists: fileInfo.exists,
        tooLarge: fileInfo.size > MAX_FILE_SIZE
      };
    } catch (error) {
      return {
        canProcess: false,
        error: error.message
      };
    }
  }
};