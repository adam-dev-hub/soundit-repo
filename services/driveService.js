// services/driveService.js
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { documentDirectory } from 'expo-file-system';
import { authService } from './authService';
import { storageService } from './storageService';
import { aiMetadataService } from './aiMetadataService';
import { audioAnalyzer } from './audioAnalyzerFFmpeg';


const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// Helper to ensure we have a valid directory path
const getDocDir = () => {
  // Fallback for documentDirectory if null in some contexts
  return documentDirectory || FileSystemLegacy.documentDirectory;
};

export const saveBase64Artwork = async (base64Data, songId) => {
  try {
    if (!base64Data || !base64Data.startsWith('data:image/')) {
      return base64Data; // Already a URL or file path
    }

    const docDir = FileSystemLegacy.documentDirectory;
    const artworkDir = `${docDir}artwork/`;
    
    // Ensure artwork directory exists
    const dirInfo = await FileSystemLegacy.getInfoAsync(artworkDir);
    if (!dirInfo.exists) {
      await FileSystemLegacy.makeDirectoryAsync(artworkDir, { intermediates: true });
    }

    // Extract base64 and mime type
    const matches = base64Data.match(/^data:image\/(.*?);base64,(.+)$/);
    if (!matches) return null;
    
    const [, mimeType, base64] = matches;
    const extension = mimeType === 'png' ? 'png' : 'jpg';
    const artworkPath = `${artworkDir}${songId}.${extension}`;

    // Save to file
    await FileSystemLegacy.writeAsStringAsync(artworkPath, base64, {
      encoding: FileSystemLegacy.EncodingType.Base64,
    });

    console.log('Artwork saved to:', artworkPath);
    return artworkPath;
  } catch (error) {
    console.error('Error saving artwork:', error);
    return null;
  }
};

export const driveService = {
  async makeAuthenticatedRequest(url, options = {}) {
    let token = await authService.getToken();
    
    if (!token) {
      throw new Error('No authentication token available');
    }
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        console.log('Token expired, refreshing...');
        token = await authService.refreshToken();
        
        if (token) {
          return await fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              Authorization: `Bearer ${token}`,
            },
          });
        } else {
          throw new Error('Failed to refresh token');
        }
      }

      return response;
    } catch (error) {
      console.error('Request error:', error);
      throw error;
    }
  },

  async getAuthToken() {
    return await authService.getToken();
  },

  async listAudioFiles(folderId = 'root', pageToken = null) {
    try {
      console.log(`Listing files in folder: ${folderId}`);
      
      let query;
      if (folderId === 'root') {
        query = "(mimeType='application/vnd.google-apps.folder' or mimeType contains 'audio/') and 'root' in parents and trashed=false";
      } else {
        query = `(mimeType='application/vnd.google-apps.folder' or mimeType contains 'audio/') and '${folderId}' in parents and trashed=false`;
      }

      const params = new URLSearchParams({
        q: query,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,fileExtension)',
        orderBy: 'folder,name',
        pageSize: '100'
      });

      if (pageToken) {
        params.append('pageToken', pageToken);
      }

      const url = `${DRIVE_API}/files?${params.toString()}`;
      const response = await this.makeAuthenticatedRequest(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Drive API error response:', errorText);
        throw new Error(`Drive API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Found ${data.files?.length || 0} items`);
      
      return {
        files: data.files || [],
        nextPageToken: data.nextPageToken
      };
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  },

  async downloadFile(fileId, fileName, onProgress) {
    try {
      const token = await authService.getToken();
      
      if (!token) {
        throw new Error('No authentication token');
      }
      
      const docDir = getDocDir();
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileUri = `${docDir}music/${sanitizedName}`;
      
      console.log(`Downloading to: ${fileUri}`);
      
      // Ensure directory exists
      const dirInfo = await FileSystemLegacy.getInfoAsync(`${docDir}music`);
      if (!dirInfo.exists) {
        await FileSystemLegacy.makeDirectoryAsync(`${docDir}music`, {
          intermediates: true,
        });
      }

      // Helper to save the song to AsyncStorage
      const saveToStorage = async (uri, metadata) => {
        const songData = {
          id: fileId,
          title: metadata.title || fileName,
          artist: metadata.artist || 'Unknown Artist',
          album: metadata.album,
          artwork: metadata.artwork,
          duration: metadata.duration,
          localUri: uri,
          filename: fileName,
          downloadedAt: new Date().toISOString(),
          // storageService.saveDownloadedSong handles preserving existing 'isLiked' status and 'downloadedAt'
        };
        
        console.log(`[DriveService] 💾 Saving enhanced metadata to storage for: ${songData.title}`);
        await storageService.saveDownloadedSong(songData);
      };

      const fileInfo = await FileSystemLegacy.getInfoAsync(fileUri);
      
      // SCENARIO 1: File already exists locally
      if (fileInfo.exists) {
        console.log('File already exists:', fileUri);
        const metadata = await this.getFileMetadata(fileUri, fileName, fileId);
        
        // FIX: Save to storage so UI updates with new metadata
        await saveToStorage(fileUri, metadata);
        
        return { uri: fileUri, metadata };
      }

      // SCENARIO 2: Fresh Download
      const callback = downloadProgress => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        if (onProgress) {
          onProgress(progress);
        }
      };

      const downloadResumable = FileSystemLegacy.createDownloadResumable(
        `${DRIVE_API}/files/${fileId}?alt=media`,
        fileUri,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        callback
      );

      const result = await downloadResumable.downloadAsync();
      console.log('Download complete:', result.uri);
      
      // Extract and Enhance metadata
      const metadata = await this.getFileMetadata(result.uri, fileName, fileId);
      
      // FIX: Save to storage so UI updates with new metadata
      await saveToStorage(result.uri, metadata);
      
      return { uri: result.uri, metadata };
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  },

  async getFileMetadata(fileUri, originalFileName, fileId) {
  try {
    // Step 1: Parse metadata from filename as fallback
    const filenameMetadata = this.parseFilenameMetadata(originalFileName);
    console.log('Filename metadata:', filenameMetadata);
    
    // Step 2: Try to extract embedded metadata from the file (ID3 tags)
    let embeddedMetadata = null;
    try {
      embeddedMetadata = await this.extractEmbeddedMetadata(fileUri);
      console.log('Embedded metadata extracted:', {
        hasTitle: !!embeddedMetadata?.title,
        hasArtist: !!embeddedMetadata?.artist,
        hasAlbum: !!embeddedMetadata?.album,
        hasArtwork: !!embeddedMetadata?.artwork
      });
    } catch (error) {
      console.log('Could not extract embedded metadata:', error.message);
    }
    
    // Step 3: Prepare base metadata (prefer embedded over filename)
    const baseMetadata = {
      title: embeddedMetadata?.title || filenameMetadata.title || originalFileName?.replace(/\.[^.]+$/, ''),
      artist: embeddedMetadata?.artist || filenameMetadata.artist || 'Unknown Artist',
      album: embeddedMetadata?.album || filenameMetadata.album || null,
      duration: embeddedMetadata?.duration || null,
      artwork: embeddedMetadata?.artwork || null,
    };
    
    // Step 4: Enhance metadata using AI
    console.log('[AI] Starting AI metadata enhancement...');
    let enhancedMetadata;
    try {
      enhancedMetadata = await aiMetadataService.enhanceMetadata(
        originalFileName,
        baseMetadata
      );
      
      // Step 5: Verify and enhance with music APIs (if no artwork exists)
      if (!enhancedMetadata.artwork && enhancedMetadata.searchQuery) {
        enhancedMetadata = await aiMetadataService.verifyAndEnhanceWithAPIs(enhancedMetadata);
      }
    } catch (error) {
      console.error('[AI] Enhancement failed, using base metadata:', error);
      enhancedMetadata = baseMetadata;
    }
    
    // Step 6: Fallback to manual API search if still no artwork
    if (!enhancedMetadata.artwork && enhancedMetadata.artist && enhancedMetadata.title) {
      try {
        console.log('No artwork yet, trying manual API search...');
        let artwork = await this.fetchArtworkFromiTunes(enhancedMetadata.artist, enhancedMetadata.title);
        
        if (!artwork) {
          artwork = await this.fetchArtworkFromDeezer(enhancedMetadata.artist, enhancedMetadata.title);
        }
        
        if (artwork) {
          enhancedMetadata.artwork = artwork;
        }
      } catch (error) {
        console.log('Manual artwork fetch error:', error.message);
      }
    }
    
    // Step 7: Save base64 artwork to file if needed
    if (enhancedMetadata.artwork && enhancedMetadata.artwork.startsWith('data:image/')) {
      console.log('Converting base64 artwork to file...');
      const artworkPath = await saveBase64Artwork(enhancedMetadata.artwork, fileId);
      if (artworkPath) {
        enhancedMetadata.artwork = artworkPath;
        console.log('Artwork saved as file:', artworkPath);
      }
    }
    
    console.log("FINAL ENHANCED METADATA:", {
      title: enhancedMetadata.title,
      artist: enhancedMetadata.artist,
      album: enhancedMetadata.album,
      hasArtwork: !!enhancedMetadata.artwork,
      aiProcessed: enhancedMetadata.metadata?.aiProcessed,
      confidence: enhancedMetadata.metadata?.confidence
    });
    try {
        if (audioAnalyzer && audioAnalyzer.writeMetadataToFile) {
             console.log('[DriveService] 💾 Saving tags to file...');
             await audioAnalyzer.writeMetadataToFile(fileUri, enhancedMetadata);
        }
    } catch (err) {
        console.error('[DriveService] ⚠️ Failed to save tags to file:', err);
    }
    
    return enhancedMetadata;
  } catch (error) {
    console.error('Error in getFileMetadata:', error);
    return {
      title: originalFileName?.replace(/\.[^.]+$/, '') || null,
      artist: 'Unknown Artist',
      album: null,
      duration: null,
      artwork: null,
    };
  }
},


  async fetchArtistImage(artistName) {
    if (!artistName || artistName === 'Unknown Artist') return null;

    try {
      // Check cache first
      const cachedImage = await storageService.getCachedArtistImage(artistName);
      if (cachedImage) {
        console.log(`Using cached image for: ${artistName}`);
        return cachedImage;
      }

      console.log(`Fetching new image for: ${artistName}`);

      // 1. Try iTunes (Great for Western/Global artists)
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=1`;
      const itunesRes = await fetch(itunesUrl);
      const itunesData = await itunesRes.json();

      if (itunesData.results?.[0]?.artistId) {
        // iTunes artist search doesn't return images directly, we look for a top album by that artist
        const albumUrl = `https://itunes.apple.com/lookup?id=${itunesData.results[0].artistId}&entity=album&limit=1`;
        const albumRes = await fetch(albumUrl);
        const albumData = await albumRes.json();
        if (albumData.results?.[1]?.artworkUrl100) {
          const imageUrl = albumData.results[1].artworkUrl100.replace('100x100', '600x600');
          // Cache the result
          await storageService.cacheArtistImage(artistName, imageUrl);
          return imageUrl;
        }
      }

      // 2. Fallback to Deezer (Excellent for Arabic and Independent artists)
      const deezerUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=1`;
      const deezerRes = await fetch(deezerUrl);
      const deezerData = await deezerRes.json();

      if (deezerData.data?.[0]?.picture_xl) {
        const imageUrl = deezerData.data[0].picture_xl;
        // Cache the result
        await storageService.cacheArtistImage(artistName, imageUrl);
        return imageUrl;
      }

      // Cache null result to avoid repeated failed lookups
      await storageService.cacheArtistImage(artistName, null);
      return null;
    } catch (error) {
      console.error('Error fetching artist image:', error);
      return null;
    }
  },

  async extractEmbeddedMetadata(fileUri) {
    try {
      // Use Legacy readAsStringAsync
      const base64Data = await FileSystemLegacy.readAsStringAsync(fileUri, {
        encoding: FileSystemLegacy.EncodingType.Base64,
        length: 512000, // Read 500KB
        position: 0
      });
      
      // Convert base64 to Uint8Array for proper binary parsing
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Check for ID3v2 tag
      if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) { // "ID3"
        return this.parseID3v2Tag(bytes);
      }
      
      console.log('No ID3v2 tag found');
      return null;
    } catch (error) {
      console.log('Error reading file for metadata:', error.message);
      return null;
    }
  },

  parseID3v2Tag(bytes) {
    const metadata = {
      title: null,
      artist: null,
      album: null,
      artwork: null,
      duration: null
    };

    try {
      // ID3v2 header
      const version = bytes[3];
      const revision = bytes[4];
      const flags = bytes[5];
      
      // Tag size (synchsafe integer - 7 bits per byte)
      const tagSize = 
        ((bytes[6] & 0x7F) << 21) |
        ((bytes[7] & 0x7F) << 14) |
        ((bytes[8] & 0x7F) << 7) |
        (bytes[9] & 0x7F);
      
      console.log(`ID3v2.${version}.${revision} tag, size: ${tagSize} bytes`);
      
      let offset = 10;
      const tagEnd = Math.min(10 + tagSize, bytes.length);
      
      // Parse frames
      while (offset < tagEnd - 10) {
        // Read frame header
        const frameId = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
        
        // Check for padding
        if (frameId === '\x00\x00\x00\x00' || bytes[offset] === 0) {
          break;
        }
        
        // Frame size
        let frameSize;
        if (version === 4) {
          // ID3v2.4 uses synchsafe integers
          frameSize = 
            ((bytes[offset+4] & 0x7F) << 21) |
            ((bytes[offset+5] & 0x7F) << 14) |
            ((bytes[offset+6] & 0x7F) << 7) |
            (bytes[offset+7] & 0x7F);
        } else {
          // ID3v2.3 uses normal integers
          frameSize =
  (bytes[offset + 4] * 0x1000000) +
  ((bytes[offset + 5] << 16) >>> 0) +
  ((bytes[offset + 6] << 8) >>> 0) +
  (bytes[offset + 7] >>> 0);
        }
        
        if (frameSize <= 0 || frameSize > tagEnd - offset - 10) {
          break;
        }
        
        const frameFlags = (bytes[offset+8] << 8) | bytes[offset+9];
        offset += 10;
        
        // Extract frame data
        const frameData = bytes.slice(offset, offset + frameSize);
        
        // Process text frames
        if (frameId.startsWith('T') && frameId !== 'TXXX') {
          const text = this.decodeTextFrame(frameData);
          
          switch (frameId) {
            case 'TIT2':
              metadata.title = text;
              console.log('Found title:', text);
              break;
            case 'TPE1':
              metadata.artist = text;
              console.log('Found artist:', text);
              break;
            case 'TALB':
              metadata.album = text;
              console.log('Found album:', text);
              break;
          }
        }
        
        // Process picture frame
        if (frameId === 'APIC') {
          metadata.artwork = this.extractPictureFrame(frameData);
          console.log('Found artwork:', !!metadata.artwork);
        }
        
        offset += frameSize;
      }
      
      return metadata;
    } catch (error) {
      console.log('Error parsing ID3v2 tag:', error.message);
      return metadata;
    }
  },

  decodeTextFrame(frameData) {
  try {
    const encoding = frameData[0];
    let text = "";

    // Skip encoding byte
    const textBytes = frameData.slice(1);

    if (encoding === 0) {
      // ISO-8859-1
      text = String.fromCharCode(...textBytes);

    } else if (encoding === 1) {
      // UTF-16 with BOM
      let decoder;

      // BOM detection
      if (textBytes[0] === 0xFF && textBytes[1] === 0xFE) {
        // Little Endian
        decoder = new TextDecoder("utf-16le");
        text = decoder.decode(textBytes.slice(2));
      } else if (textBytes[0] === 0xFE && textBytes[1] === 0xFF) {
        // Big Endian
        decoder = new TextDecoder("utf-16be");
        text = decoder.decode(textBytes.slice(2));
      } else {
        // No BOM → assume LE (most common)
        decoder = new TextDecoder("utf-16le");
        text = decoder.decode(textBytes);
      }

    } else if (encoding === 3) {
      // UTF-8
      const decoder = new TextDecoder("utf-8");
      text = decoder.decode(textBytes);
    }

    // Remove null terminators
    return text.replace(/\x00/g, "").trim();

  } catch (error) {
    console.log("Error decoding text frame:", error.message);
    return "";
  }
},

  extractPictureFrame(frameData) {
    try {
      let offset = 1; // Skip text encoding
      
      // Read MIME type (null-terminated)
      let mimeType = '';
      while (offset < frameData.length && frameData[offset] !== 0) {
        mimeType += String.fromCharCode(frameData[offset]);
        offset++;
      }
      offset++; // Skip null terminator
      
      // Skip picture type byte
      offset++;
      
      // Skip description (null-terminated)
      while (offset < frameData.length && frameData[offset] !== 0) {
        offset++;
      }
      offset++; // Skip null terminator
      
      // Remaining bytes are the image data
      const imageBytes = frameData.slice(offset);
      
      // Convert to base64
      let binary = '';
      for (let i = 0; i < imageBytes.length; i++) {
        binary += String.fromCharCode(imageBytes[i]);
      }
      const base64 = btoa(binary);
      
      // Determine MIME type if not specified
      if (!mimeType || mimeType === '') {
        // Check magic numbers
        if (imageBytes[0] === 0xFF && imageBytes[1] === 0xD8) {
          mimeType = 'image/jpeg';
        } else if (imageBytes[0] === 0x89 && imageBytes[1] === 0x50) {
          mimeType = 'image/png';
        } else {
          mimeType = 'image/jpeg'; // Default
        }
      }
      
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.log('Error extracting picture frame:', error.message);
      return null;
    }
  },

  async fetchArtworkFromDeezer(artist, title) {
    try {
      // Clean up search term - remove extra spaces and special characters
      const cleanArtist = artist.trim();
      const cleanTitle = title.replace(/جلسة.*$/i, '').trim(); // Remove session info
      const searchTerm = encodeURIComponent(`${cleanArtist} ${cleanTitle}`);
      const url = `https://api.deezer.com/search?q=${searchTerm}&limit=1`;
      
      console.log('Fetching from Deezer:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log('Deezer API responded with:', response.status);
        return null;
      }

      const data = await response.json();
      
      if (data.data && data.data.length > 0) {
        // Get album artwork (usually 500x500)
        const artworkUrl = data.data[0].album?.cover_xl || 
                          data.data[0].album?.cover_big ||
                          data.data[0].album?.cover_medium;
        
        if (artworkUrl) {
          console.log('Found Deezer artwork:', artworkUrl);
          return artworkUrl;
        }
      }
      
      console.log('No results from Deezer API');
      return null;
    } catch (error) {
      console.error('Deezer API fetch error:', error);
      return null;
    }
  },

  async fetchArtworkFromiTunes(artist, title) {
    try {
      // Search iTunes API
      const searchTerm = encodeURIComponent(`${artist} ${title}`);
      const url = `https://itunes.apple.com/search?term=${searchTerm}&entity=song&limit=1`;
      
      console.log('Fetching from iTunes:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log('iTunes API responded with:', response.status);
        return null;
      }

      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        // Get high quality artwork (600x600)
        const artworkUrl = data.results[0].artworkUrl100;
        if (artworkUrl) {
          // Replace 100x100 with 600x600 for better quality
          const highResArtwork = artworkUrl.replace('100x100', '600x600');
          console.log('Found artwork:', highResArtwork);
          return highResArtwork;
        }
      }
      
      console.log('No results from iTunes API');
      return null;
    } catch (error) {
      console.error('iTunes API fetch error:', error);
      return null;
    }
  },

  // Parse metadata from filename using common patterns
  parseFilenameMetadata(fileName) {
    if (!fileName) return { title: null, artist: null, album: null };

    // Remove file extension
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
    
    // Pattern 1: "Artist - Title"
    let match = nameWithoutExt.match(/^(.+?)\s*[-—–]\s*(.+)$/);
    if (match) {
      return {
        title: match[2].trim(),
        artist: match[1].trim(),
        album: null
      };
    }

    // Pattern 2: "Artist_-_Title" or "Artist___Title"
    match = nameWithoutExt.match(/^(.+?)[\s_]*[-—–_][\s_]*(.+)$/);
    if (match) {
      const artist = match[1].replace(/_+/g, ' ').trim();
      const title = match[2].replace(/_+/g, ' ').trim();
      return {
        title: title,
        artist: artist,
        album: null
      };
    }

    // Pattern 3: Numbers at start "01. Artist - Title" or "01 - Title"
    match = nameWithoutExt.match(/^\d+[\s._-]*(.+)$/);
    if (match) {
      const remaining = match[1];
      const parts = remaining.split(/\s*[-—–]\s*/);
      if (parts.length >= 2) {
        return {
          title: parts[1].trim(),
          artist: parts[0].trim(),
          album: null
        };
      }
      return {
        title: remaining.trim(),
        artist: null,
        album: null
      };
    }

    // Default: use whole filename as title
    return {
      title: nameWithoutExt.replace(/_+/g, ' ').trim(),
      artist: null,
      album: null
    };
  },

  async downloadFolderFiles(files, onProgress, onFileComplete) {
    const results = [];
    let completed = 0;
    
    for (const file of files) {
      try {
        const result = await this.downloadFile(
          file.id,
          file.name,
          (fileProgress) => {
            const totalProgress = (completed + fileProgress) / files.length;
            onProgress(totalProgress, file.name);
          }
        );
        
        // Save artwork to file if it's base64
        if (result.metadata?.artwork && result.metadata.artwork.startsWith('data:image/')) {
          console.log(`Converting artwork for ${file.name}...`);
          const artworkPath = await saveBase64Artwork(result.metadata.artwork, file.id);
          if (artworkPath) {
            result.metadata.artwork = artworkPath;
            console.log(`Artwork saved for ${file.name}:`, artworkPath);
          }
        }
        
        results.push({ success: true, file, result });
        completed++;
        onFileComplete(file.name, true);
      } catch (error) {
        console.error(`Failed to download ${file.name}:`, error);
        results.push({ success: false, file, error });
        completed++;
        onFileComplete(file.name, false);
      }
    }
    
    return results;
  },

  async getStreamUrl(fileId) {
    try {
      const token = await authService.getToken();
      
      if (!token) {
        throw new Error('No authentication token');
      }

      return `${DRIVE_API}/files/${fileId}?alt=media&access_token=${token}`;
    } catch (error) {
      console.error('Error getting stream URL:', error);
      throw error;
    }
  },

  async searchFiles(searchTerm) {
    try {
      const query = `name contains '${searchTerm}' and mimeType contains 'audio/' and trashed=false`;
      const params = new URLSearchParams({
        q: query,
        fields: 'files(id,name,mimeType,size,fileExtension)',
        orderBy: 'name'
      });

      const response = await this.makeAuthenticatedRequest(
        `${DRIVE_API}/files?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Drive API error: ${response.status}`);
      }

      const data = await response.json();
      return data.files || [];
    } catch (error) {
      console.error('Error searching files:', error);
      throw error;
    }
  },

  async getFolderContents(folderId) {
    try {
      const query = `'${folderId}' in parents and trashed=false`;
      const params = new URLSearchParams({
        q: query,
        fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,fileExtension)',
        orderBy: 'folder,name'
      });
      
      const response = await this.makeAuthenticatedRequest(
        `${DRIVE_API}/files?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Drive API error: ${response.status}`);
      }

      const data = await response.json();
      return data.files || [];
    } catch (error) {
      console.error('Error getting folder contents:', error);
      throw error;
    }
  }
};