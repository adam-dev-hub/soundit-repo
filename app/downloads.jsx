// app/downloads.jsx - Added "Delete All" functionality
import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { 
  Trash2, 
  FolderOpen, 
  Edit, 
  X, 
  Music,
  User,
  Disc
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { storageService } from '../services/storageService';
import { useAudio } from '../context/AudioContext';
import SongItem from '../components/SongItem';
import MiniPlayer from '../components/MiniPlayer';

export default function DownloadsScreen() {
  const [songs, setSongs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modals State
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);

  // Form State
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editAlbum, setEditAlbum] = useState('');

  const { currentSong, playSong, removeSongFromQueue, updateSongInQueue, closePlayer } = useAudio();

  useFocusEffect(
    useCallback(() => {
      loadSongs();
    }, [])
  );

  const loadSongs = async () => {
    try {
      if (!refreshing) setLoading(true);
      const downloaded = await storageService.getDownloadedSongs();
      setSongs(downloaded || []);
    } catch (error) {
      console.error('Error loading songs:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSongs();
    setRefreshing(false);
  };

  const handlePlaySong = async (song, index) => {
    await playSong(song, songs);
  };

  // --- ACTIONS ---

  const handleDeleteAll = () => {
    if (songs.length === 0) return;

    Alert.alert(
      'Delete All Songs',
      'Are you sure you want to delete ALL downloaded songs? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await closePlayer();
              // Delete sequentially to avoid database conflicts
              for (const song of songs) {
                await storageService.deleteSong(song.id);
              }
              setSongs([]); // Clear UI
              Alert.alert('Success', 'All songs have been deleted.');
            } catch (error) {
              console.error(error);
              Alert.alert('Error', 'Failed to delete some songs.');
              loadSongs(); // Reload to see what remains
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const openOptions = (song) => {
    setSelectedSong(song);
    setShowOptionsModal(true);
  };

  const openEditModal = () => {
    if (!selectedSong) return;
    setEditTitle(selectedSong.name || '');
    setEditArtist(selectedSong.artist || '');
    setEditAlbum(selectedSong.album || '');
    setShowOptionsModal(false);
    setShowEditModal(true);
  };

  const handleDelete = () => {
    if (!selectedSong) return;
    
    Alert.alert(
      'Delete Song',
      `Are you sure you want to delete "${selectedSong.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Remove from audio context first
              await removeSongFromQueue(selectedSong.id);
              
              // Then delete from storage
              await storageService.deleteSong(selectedSong.id);
              
              // Update local state
              setSongs(prev => prev.filter(s => s.id !== selectedSong.id));
              setShowOptionsModal(false);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete song');
            }
          },
        },
      ]
    );
  };

  const handleSaveMetadata = async () => {
    if (!selectedSong) return;

    try {
      const updates = {
        name: editTitle.trim() || selectedSong.name,
        artist: editArtist.trim() || 'Unknown Artist',
        album: editAlbum.trim() || ''
      };

      // Update in audio context
      updateSongInQueue(selectedSong.id, updates);

      // Update in storage
      await storageService.updateSongMetadata(selectedSong.id, updates);
      
      // Update local state
      const updatedSongs = songs.map(s => 
        s.id === selectedSong.id ? { ...s, ...updates } : s
      );
      setSongs(updatedSongs);

      setShowEditModal(false);
      Alert.alert('Success', 'Song info updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update song info');
    }
  };


  // --- RENDER HELPERS ---

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF5500" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER WITH BIN ICON */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Downloads</Text>
          <Text style={styles.subtitle}>{songs.length} songs available offline</Text>
        </View>
        
        {songs.length > 0 && (
          <TouchableOpacity 
            onPress={handleDeleteAll} 
            style={styles.headerButton}
            activeOpacity={0.7}
          >
            <Trash2 size={24} color="#FF4444" />
          </TouchableOpacity>
        )}
      </View>

      {songs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FolderOpen size={64} color="#333" />
          <Text style={styles.emptyText}>No downloads yet</Text>
          <Text style={styles.emptySubtext}>
            Songs you download from Google Drive will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SongItem
              song={item}
              onPress={() => handlePlaySong(item, index)}
              isPlaying={currentSong?.id === item.id}
              onOptions={() => openOptions(item)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF5500"
              colors={['#FF5500']}
            />
          }
         contentContainerStyle={{ 
            paddingBottom: currentSong ? 95 : 0 
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* --- OPTIONS MODAL --- */}
      <Modal
        visible={showOptionsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOptionsModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowOptionsModal(false)}
        >
          <View style={styles.optionsSheet}>
            <View style={styles.optionsHeader}>
              <Text style={styles.optionsTitle} numberOfLines={1}>
                {selectedSong?.name}
              </Text>
              <Text style={styles.optionsArtist} numberOfLines={1}>
                {selectedSong?.artist || 'Unknown Artist'}
              </Text>
            </View>

            <View style={styles.optionList}>
              <TouchableOpacity style={styles.optionItem} onPress={openEditModal}>
                <Edit size={22} color="#fff" />
                <Text style={styles.optionText}>Edit Info</Text>
              </TouchableOpacity>
              
              <View style={styles.divider} />

              <TouchableOpacity style={styles.optionItem} onPress={handleDelete}>
                <Trash2 size={22} color="#FF4444" />
                <Text style={[styles.optionText, { color: '#FF4444' }]}>Delete Download</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={() => setShowOptionsModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* --- EDIT METADATA MODAL --- */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.editModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Song Info</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <X size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <Music size={14} color="#FF5500" />
                <Text style={styles.inputLabel}>Title</Text>
              </View>
              <TextInput
                style={styles.input}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Song Title"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <User size={14} color="#FF5500" />
                <Text style={styles.inputLabel}>Artist</Text>
              </View>
              <TextInput
                style={styles.input}
                value={editArtist}
                onChangeText={setEditArtist}
                placeholder="Artist Name"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <Disc size={14} color="#FF5500" />
                <Text style={styles.inputLabel}>Album</Text>
              </View>
              <TextInput
                style={styles.input}
                value={editAlbum}
                onChangeText={setEditAlbum}
                placeholder="Album Name"
                placeholderTextColor="#666"
              />
            </View>

            <TouchableOpacity 
              style={styles.saveButton}
              onPress={handleSaveMetadata}
            >
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  headerButton: {
    padding: 8,
    backgroundColor: '#331111', // Subtle red tint background
    borderRadius: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    opacity: 0.8,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  
  // --- OPTIONS SHEET ---
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  optionsSheet: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  optionsHeader: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  optionsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  optionsArtist: {
    color: '#999',
    fontSize: 14,
  },
  optionList: {
    marginBottom: 16,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 16,
  },
  optionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2A2A',
    marginVertical: 4,
  },
  cancelButton: {
    backgroundColor: '#2A2A2A',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },

  // --- EDIT MODAL ---
  editModalContent: {
    backgroundColor: '#1E1E1E',
    margin: 20,
    borderRadius: 20,
    padding: 24,
    width: '90%',
    alignSelf: 'center',
    marginBottom: 100,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  inputLabel: {
    color: '#999',
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#2A2A2A',
    color: '#fff',
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  saveButton: {
    backgroundColor: '#FF5500',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});