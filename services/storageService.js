// services/storageService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { aiMetadataService } from './aiMetadataService';

const FAVORIS_PLAYLIST_ID = 'favoris_playlist_fixed_id';
const FAVORIS_PLAYLIST_NAME = 'Favoris';
const FAVORIS_PLAYLIST_COVER_DEFAULT = 'FAVORIS_DEFAULT_LOCAL_ASSET'; 
const changeListeners = [];

export const storageService = {
  //listner management
  addChangeListener(callback) {
    changeListeners.push(callback);
    return () => {
      const index = changeListeners.indexOf(callback);
      if (index > -1) changeListeners.splice(index, 1);
    };
  },

  notifyChange(type, data) {
    changeListeners.forEach(callback => callback(type, data));
  },
  // Songs
  async saveDownloadedSong(song) {
    try {
      const songs = await this.getDownloadedSongs();
      
      // Check if song already exists
      const existingIndex = songs.findIndex(s => s.id === song.id);
      
      if (existingIndex !== -1) {
        // Update existing song with new metadata
        songs[existingIndex] = {
          ...songs[existingIndex],
          ...song,
          // Preserve original download date if it exists
          downloadedAt: songs[existingIndex].downloadedAt || song.downloadedAt,
        };
      } else {
        // Add new song
        songs.push(song);
        this.notifyChange('songAdded', { song });
      }
      
      await AsyncStorage.setItem('downloaded_songs', JSON.stringify(songs));
      return songs;
    } catch (error) {
      console.error('Error saving song:', error);
      throw error;
    }
  },

  async getDownloadedSongs() {
    try {
      const data = await AsyncStorage.getItem('downloaded_songs');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting songs:', error);
      return [];
    }
  },

  async deleteSong(songId) {
    try {
      const songs = await this.getDownloadedSongs();
      const song = songs.find(s => s.id === songId);
      
      if (song && song.localUri) {
        // Delete the physical file using LEGACY import
        await FileSystemLegacy.deleteAsync(song.localUri, { idempotent: true });
      }

      // Remove from storage
      const updated = songs.filter(s => s.id !== songId);
      await AsyncStorage.setItem('downloaded_songs', JSON.stringify(updated));
      
      // Also remove from all playlists
      await this.removeSongFromAllPlaylists(songId);
      this.notifyChange('songDeleted', { songId });
      
      return updated;
    } catch (error) {
      console.error('Error deleting song:', error);
      throw error;
    }
  },

  async updateSongMetadata(songId, metadata) {
    try {
      const songs = await this.getDownloadedSongs();
      const updated = songs.map(s => 
        s.id === songId ? { ...s, ...metadata } : s
      );
      await AsyncStorage.setItem('downloaded_songs', JSON.stringify(updated));
      
      // Update song in all playlists too
      await this.updateSongInPlaylists(songId, metadata);
      this.notifyChange('songUpdated', { songId, metadata });
      
      return updated;
    } catch (error) {
      console.error('Error updating song:', error);
      throw error;
    }
  },

  async getSongById(songId) {
    try {
      const songs = await this.getDownloadedSongs();
      return songs.find(s => s.id === songId);
    } catch (error) {
      console.error('Error getting song by ID:', error);
      return null;
    }
  },

  // --- NEW: Toggle Like Status and Manage Favoris Playlist ---
  async toggleSongLikeStatus(song, newLikeStatus) {
    try {
      // 1. Prepare updated song object for storage
      const songWithMetadata = { ...song, isLiked: newLikeStatus };

      // 2. Update song in the main downloaded_songs list (updates isLiked metadata)
      await this.saveDownloadedSong(songWithMetadata);

      // 3. Manage "Favoris" playlist
      let playlists = await this.getPlaylists();
      let favorisIndex = playlists.findIndex(p => p.id === FAVORIS_PLAYLIST_ID);
      let favoris = playlists[favorisIndex];

      if (!favoris) {
        // Créer la playlist Favoris si elle n'existe pas
        favoris = {
          id: FAVORIS_PLAYLIST_ID,
          name: FAVORIS_PLAYLIST_NAME,
          image: FAVORIS_PLAYLIST_COVER_DEFAULT, 
          description: 'Your liked songs',
          songs: [],
          isFixed: true, 
          createdAt: new Date().toISOString(),
        };
        playlists.push(favoris);
        favorisIndex = playlists.length - 1;
      } else {
        if (!favoris.image || favoris.image.startsWith('http')) {
            favoris.image = FAVORIS_PLAYLIST_COVER_DEFAULT;
        }
      }
      
      if (newLikeStatus) {
        // A. Add song to Favoris (or update it if it exists)
        const songInFavorisIndex = favoris.songs.findIndex(s => s.id === song.id);
        
        if (songInFavorisIndex === -1) {
          favoris.songs.push(songWithMetadata);
        } else {
          // Update song metadata in the playlist (e.g., if isLiked status changed)
          favoris.songs[songInFavorisIndex] = songWithMetadata;
        }
      } else {
        // B. Remove song from Favoris
        favoris.songs = favoris.songs.filter(s => s.id !== song.id);
      }

      // Update playlists array and save
      playlists[favorisIndex] = favoris;
      await AsyncStorage.setItem('playlists', JSON.stringify(playlists));

      return songWithMetadata; // Return the updated song object
    } catch (error) {
      console.error('Error toggling song like status:', error);
      throw error;
    }
  },


  // --- PLAYLISTS ---

  async createPlaylist(name, image = null, description = '') {
    try {
      const playlists = await this.getPlaylists();
      const newPlaylist = {
        id: Date.now().toString(),
        name,
        image,
        description, 
        songs: [],
        createdAt: new Date().toISOString(),
      };
      const updated = [...playlists, newPlaylist];
      await AsyncStorage.setItem('playlists', JSON.stringify(updated));
      return newPlaylist;
    } catch (error) {
      console.error('Error creating playlist:', error);
      throw error;
    }
  },

  async getPlaylists() {
    try {
      const data = await AsyncStorage.getItem('playlists');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting playlists:', error);
      return [];
    }
  },

  async updatePlaylist(playlistId, updates) {
    try {
      if (playlistId === FAVORIS_PLAYLIST_ID) {
         delete updates.name;
         delete updates.description;
         delete updates.isFixed;
      }

      const playlists = await this.getPlaylists();
      const updated = playlists.map(p => 
        p.id === playlistId ? { ...p, ...updates } : p
      );
      await AsyncStorage.setItem('playlists', JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error updating playlist:', error);
      throw error;
    }
  },

  async addSongToPlaylist(playlistId, song) {
    try {
      const playlists = await this.getPlaylists();
      const updated = playlists.map(p => {
        if (p.id === playlistId) {
          const exists = p.songs.find(s => s.id === song.id);
          if (exists) return p;
          
          return {
            ...p,
            songs: [...p.songs, song],
          };
        }
        return p;
      });
      await AsyncStorage.setItem('playlists', JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error adding song to playlist:', error);
      throw error;
    }
  },

  async removeSongFromPlaylist(playlistId, songId) {
    try {
      const playlists = await this.getPlaylists();
      const updated = playlists.map(p => {
        if (p.id === playlistId) {
          return {
            ...p,
            songs: p.songs.filter(s => s.id !== songId),
          };
        }
        return p;
      });
      await AsyncStorage.setItem('playlists', JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error removing song from playlist:', error);
      throw error;
    }
  },

  async removeSongFromAllPlaylists(songId) {
    try {
      const playlists = await this.getPlaylists();
      const updated = playlists.map(p => ({
        ...p,
        songs: p.songs.filter(s => s.id !== songId),
      }));
      await AsyncStorage.setItem('playlists', JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error removing song from all playlists:', error);
      throw error;
    }
  },

  async updateSongInPlaylists(songId, metadata) {
    try {
      const playlists = await this.getPlaylists();
      const updated = playlists.map(p => ({
        ...p,
        songs: p.songs.map(s => 
          s.id === songId ? { ...s, ...metadata } : s
        ),
      }));
      await AsyncStorage.setItem('playlists', JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error updating song in playlists:', error);
      throw error;
    }
  },
  async getStorageUsage() {
    try {
      const songs = await this.getDownloadedSongs();
      let totalBytes = 0;

      // We use Promise.all to check file sizes in parallel for speed
      await Promise.all(
        songs.map(async (song) => {
          if (song.localUri) {
            try {
              const fileInfo = await FileSystemLegacy.getInfoAsync(song.localUri);
              if (fileInfo.exists && fileInfo.size) {
                totalBytes += fileInfo.size;
              }
            } catch (e) {
              console.warn('Error checking file size:', e);
            }
          }
        })
      );

      // Convert to MB or GB
      const mb = totalBytes / (1024 * 1024);
      if (mb > 1024) {
        return `${(mb / 1024).toFixed(2)} GB`;
      }
      return `${mb.toFixed(1)} MB`;
    } catch (error) {
      console.error('Error calculating storage:', error);
      return '0 MB';
    }
  },

  async deletePlaylist(playlistId) {
    try {
      const playlists = await this.getPlaylists();
      const updated = playlists.filter(p => p.id !== playlistId);
      await AsyncStorage.setItem('playlists', JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error deleting playlist:', error);
      throw error;
    }
  },

  async getPlaylist(playlistId) {
    try {
      const playlists = await this.getPlaylists();
      return playlists.find(p => p.id === playlistId);
    } catch (error) {
      console.error('Error getting playlist:', error);
      return null;
    }
  },

  // --- ARTIST IMAGE CACHE ---

  async getCachedArtistImage(artistName) {
    try {
      const cache = await AsyncStorage.getItem('artist_image_cache');
      if (!cache) return null;
      
      const cacheData = JSON.parse(cache);
      const cached = cacheData[artistName];
      
      if (!cached) return null;
      
      // Check if cache is older than 30 days
      const cacheAge = Date.now() - cached.timestamp;
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      
      if (cacheAge > thirtyDays) {
        // Cache expired, remove it
        delete cacheData[artistName];
        await AsyncStorage.setItem('artist_image_cache', JSON.stringify(cacheData));
        return null;
      }
      
      return cached.imageUrl;
    } catch (error) {
      console.error('Error getting cached artist image:', error);
      return null;
    }
  },

  async cacheArtistImage(artistName, imageUrl) {
    try {
      const cache = await AsyncStorage.getItem('artist_image_cache');
      const cacheData = cache ? JSON.parse(cache) : {};
      
      cacheData[artistName] = {
        imageUrl,
        timestamp: Date.now(),
      };
      
      await AsyncStorage.setItem('artist_image_cache', JSON.stringify(cacheData));
      console.log(`Cached image for artist: ${artistName}`);
    } catch (error) {
      console.error('Error caching artist image:', error);
    }
  },

  async clearArtistImageCache() {
    try {
      await AsyncStorage.removeItem('artist_image_cache');
      console.log('Artist image cache cleared');
    } catch (error) {
      console.error('Error clearing artist image cache:', error);
    }
  },

  async getArtistImageCacheSize() {
    try {
      const cache = await AsyncStorage.getItem('artist_image_cache');
      if (!cache) return 0;
      
      const cacheData = JSON.parse(cache);
      return Object.keys(cacheData).length;
    } catch (error) {
      console.error('Error getting cache size:', error);
      return 0;
    }
  }
};

