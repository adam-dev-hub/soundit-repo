// app/mymusic.jsx
import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Image,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { 
  Music, 
  Plus, 
  Shuffle,
  Play,
  Edit,
  Trash2,
  X,
  Check,
  Image as ImageIcon, 
  ArrowLeft,
  Search,
  CheckSquare,
  Square,
  AlignLeft
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { storageService } from '../services/storageService';
import { useAudio } from '../context/AudioContext';
import SongItem from '../components/SongItem';
import MiniPlayer from '../components/MiniPlayer';

const FAVORIS_PLAYLIST_ID = 'favoris_playlist_fixed_id'; 
const FAVORIS_PLAYLIST_COVER_DEFAULT = 'FAVORIS_DEFAULT_LOCAL_ASSET';
const FAVORIS_LOCAL_IMAGE = require('../assets/heart_icon.png'); 

export default function MyMusicScreen() {
  // Data State
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal Visibility State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddSongsModal, setShowAddSongsModal] = useState(false);

  // Form State
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDesc, setPlaylistDesc] = useState('');
  const [playlistImage, setPlaylistImage] = useState(null);
  const [editingId, setEditingId] = useState(null);

  // Selection & Search State
  const [selectedSongsToAdd, setSelectedSongsToAdd] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const { currentSong, playSong, setPlayQueue, isShuffled, toggleShuffle } = useAudio();

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => {
        resetModals();
      };
    }, [])
  );

  const resetModals = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setShowAddSongsModal(false);
    resetForm();
  };

  const resetForm = () => {
    setPlaylistName('');
    setPlaylistDesc('');
    setPlaylistImage(null);
    setEditingId(null);
    setSearchQuery('');
    setSelectedSongsToAdd([]);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [allSongs, allPlaylists] = await Promise.all([
        storageService.getDownloadedSongs(),
        storageService.getPlaylists()
      ]);
      setSongs(allSongs || []);
      setPlaylists(allPlaylists || []);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Could not load your music data');
    } finally {
      setLoading(false);
    }
  };

  const getPlaylistImageSource = (playlist) => {
    if (playlist.id === FAVORIS_PLAYLIST_ID && playlist.image === FAVORIS_PLAYLIST_COVER_DEFAULT) {
        // Return local asset for Favoris default
        return FAVORIS_LOCAL_IMAGE;
    }
    
    if (playlist.image && playlist.image !== FAVORIS_PLAYLIST_COVER_DEFAULT) {
        // Return URI for custom images
        return { uri: playlist.image };
    }
    
    // Return null for placeholder
    return null;
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photos to set a cover image.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      return result.assets[0].uri;
    }
    return null;
  };

  const handleSetImage = async () => {
    const uri = await pickImage();
    if (uri) setPlaylistImage(uri);
  };

  // --- CRUD Operations ---

  const handleSavePlaylist = async (isEdit) => {
    if (!playlistName.trim() && !isEdit) {
      Alert.alert('Required', 'Please enter a playlist name');
      return;
    }
    
    if (isEdit && editingId === FAVORIS_PLAYLIST_ID) {
      if (playlistImage !== selectedPlaylist.image) {
        await storageService.updatePlaylist(editingId, { image: playlistImage });
        
        const updated = await storageService.getPlaylist(editingId);
        setSelectedPlaylist(updated);
        Alert.alert('Updated', 'Favoris cover image saved.');
      } else {
        Alert.alert('Info', 'The name and description of "Favoris" cannot be changed.');
      }
      resetModals();
      await loadData();
      return;
    }

    try {
      if (isEdit && editingId) {
        await storageService.updatePlaylist(editingId, {
          name: playlistName.trim(),
          description: playlistDesc.trim(),
          image: playlistImage
        });
        
        if (selectedPlaylist?.id === editingId) {
          const updated = await storageService.getPlaylist(editingId);
          setSelectedPlaylist(updated);
        }
        Alert.alert('Updated', 'Playlist configuration saved.');
      } else {
        await storageService.createPlaylist(playlistName.trim(), playlistImage, playlistDesc.trim());
        Alert.alert('Success', `Playlist "${playlistName}" created!`);
      }

      resetModals();
      await loadData();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to save playlist');
    }
  };

  const handleDeletePlaylist = (playlist) => {
    if (playlist.id === FAVORIS_PLAYLIST_ID) {
      Alert.alert('Action Restricted', 'The "Favoris" playlist cannot be deleted. Unlike songs from the player to remove them.');
      return;
    }

    Alert.alert(
      'Delete Playlist',
      `Are you sure you want to delete "${playlist.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await storageService.deletePlaylist(playlist.id);
            if (selectedPlaylist?.id === playlist.id) {
              setSelectedPlaylist(null);
            }
            await loadData();
          },
        },
      ]
    );
  };

  const handleOpenEditModal = (playlist) => {
    setEditingId(playlist.id);
    setPlaylistName(playlist.name);
    setPlaylistDesc(playlist.description || ''); 
    setPlaylistImage(playlist.image);
    setShowEditModal(true);
  };

  // --- Song Management inside Playlist ---

  const handleOpenAddSongsModal = () => {
    if (!selectedPlaylist) return;
    setSearchQuery('');
    setSelectedSongsToAdd([]);
    setShowAddSongsModal(true);
  };

  const toggleSongSelection = (songId) => {
    setSelectedSongsToAdd(prev => {
      if (prev.includes(songId)) {
        return prev.filter(id => id !== songId);
      } else {
        return [...prev, songId];
      }
    });
  };

  const handleSelectAllFiltered = () => {
    const ids = filteredAvailableSongs.map(s => s.id);
    const allSelected = ids.every(id => selectedSongsToAdd.includes(id));
    
    if (allSelected) {
      setSelectedSongsToAdd(prev => prev.filter(id => !ids.includes(id)));
    } else {
      const newIds = ids.filter(id => !selectedSongsToAdd.includes(id));
      setSelectedSongsToAdd(prev => [...prev, ...newIds]);
    }
  };

  const handleAddSelectedSongs = async () => {
    if (selectedSongsToAdd.length === 0) return;

    try {
      for (const songId of selectedSongsToAdd) {
        const song = songs.find(s => s.id === songId);
        if (song) {
          await storageService.addSongToPlaylist(selectedPlaylist.id, song);
        }
      }
      
      setShowAddSongsModal(false);
      resetForm();
      await loadData();
      
      const updated = await storageService.getPlaylist(selectedPlaylist.id);
      setSelectedPlaylist(updated);
      
    } catch (error) {
      Alert.alert('Error', 'Failed to add songs');
    }
  };

  const handleRemoveFromPlaylist = (song) => {
    if (!selectedPlaylist) return;

    if (selectedPlaylist.id === FAVORIS_PLAYLIST_ID) {
      Alert.alert(
        'Action Restricted', 
        `To remove "${song.name}" from Favoris, you must unlike it from the player screen.`
      );
      return;
    }
    
    Alert.alert(
      'Remove Song',
      `Remove "${song.name}" from this playlist?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await storageService.removeSongFromPlaylist(selectedPlaylist.id, song.id);
            const updated = await storageService.getPlaylist(selectedPlaylist.id);
            setSelectedPlaylist(updated);
            await loadData(); 
          },
        },
      ]
    );
  };

  // --- Playback ---

  const handlePlaySong = async (song, index) => {
    const currentList = selectedPlaylist ? selectedPlaylist.songs : songs;
    setPlayQueue(currentList, index);
    await playSong(song, currentList);
  };

  const handlePlayPlaylist = async (shuffle = false) => {
    if (!selectedPlaylist || selectedPlaylist.songs.length === 0) return;
    
    if (shuffle !== isShuffled) {
      toggleShuffle();
    }
    
    const startIndex = shuffle 
      ? Math.floor(Math.random() * selectedPlaylist.songs.length)
      : 0;
    
    setPlayQueue(selectedPlaylist.songs, startIndex);
    await playSong(selectedPlaylist.songs[startIndex], selectedPlaylist.songs);
  };

  // --- Filtering Logic ---

  const availableSongsRaw = songs.filter(s => 
    !selectedPlaylist?.songs.some(ps => ps.id === s.id)
  );

  const filteredAvailableSongs = availableSongsRaw.filter(s => {
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || 
           (s.artist && s.artist.toLowerCase().includes(q));
  });

  // --- Render Helpers ---

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF5500" />
      </View>
    );
  }

  // --- View: Playlist Details ---
  if (selectedPlaylist) {
    const isFavoris = selectedPlaylist.id === FAVORIS_PLAYLIST_ID; 
    
    return (
      <View style={styles.container}>
        <View style={styles.playlistHeader}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => setSelectedPlaylist(null)}
          >
            <ArrowLeft size={24} color="#FF5500" />
            <Text style={styles.backText}>My Music</Text>
          </TouchableOpacity>
          
          <View style={styles.playlistHeaderContent}>
           {getPlaylistImageSource(selectedPlaylist) ? (
            <Image 
              source={getPlaylistImageSource(selectedPlaylist)} 
              style={styles.playlistHeaderImage} 
              resizeMode="cover" 
            />
          ) : (
            <View style={styles.playlistHeaderImagePlaceholder}>
              <Music size={48} color="#FF5500" />
            </View>
          )}
            
            <View style={styles.playlistHeaderInfo}>
              <Text style={styles.playlistHeaderTitle}>{selectedPlaylist.name}</Text>
              {selectedPlaylist.description ? (
                <Text style={styles.playlistHeaderDesc} numberOfLines={2}>
                  {selectedPlaylist.description}
                </Text>
              ) : null}
              <Text style={styles.playlistHeaderCount}>
                {selectedPlaylist.songs.length} tracks
              </Text>
            </View>
          </View>

          <View style={styles.playlistActionRow}>
             <TouchableOpacity 
              style={styles.iconButton}
              onPress={() => handleOpenEditModal(selectedPlaylist)}
            >
              {isFavoris ? (
                <ImageIcon size={20} color="#fff" /> 
              ) : (
                <Edit size={20} color="#fff" />
              )}
            </TouchableOpacity>
            
            {!isFavoris && (
               <TouchableOpacity 
                style={[styles.iconButton, { backgroundColor: '#331111' }]}
                onPress={() => handleDeletePlaylist(selectedPlaylist)}
              >
                <Trash2 size={20} color="#FF4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {selectedPlaylist.songs.length > 0 ? (
          <View style={styles.playlistControls}>
            <TouchableOpacity 
              style={styles.playButton}
              onPress={() => handlePlayPlaylist(false)}
            >
              <Play size={20} color="#fff" fill="#fff" />
              <Text style={styles.playButtonText}>Play</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.playButton, styles.shuffleButton]}
              onPress={() => handlePlayPlaylist(true)}
            >
              <Shuffle size={20} color="#fff" />
              <Text style={styles.playButtonText}>Shuffle</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.addSongsCircleButton}
              onPress={handleOpenAddSongsModal}
            >
              <Plus size={24} color="#FF5500" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Music size={64} color="#333" />
            <Text style={styles.emptyText}>Empty Playlist</Text>
            {!isFavoris && (
            <TouchableOpacity 
              style={styles.addFirstSongButton}
              onPress={handleOpenAddSongsModal}
            >
              <Plus size={20} color="#fff" />
              <Text style={styles.addFirstSongButtonText}>Add Songs</Text>
            </TouchableOpacity>
            )}
          </View>
        )}

        <FlatList
          data={selectedPlaylist.songs}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SongItem
              song={item}
              onPress={() => handlePlaySong(item, index)}
              isPlaying={currentSong?.id === item.id}
              onOptions={isFavoris ? undefined : () => handleRemoveFromPlaylist(item)} 
            />
          )}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
        <MiniPlayer />

        {/* --- ADD SONGS MODAL --- */}
        <Modal
          visible={showAddSongsModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAddSongsModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, styles.fullHeightModal]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Songs</Text>
                <TouchableOpacity onPress={() => setShowAddSongsModal(false)}>
                  <X size={24} color="#999" />
                </TouchableOpacity>
              </View>

              <View style={styles.searchContainer}>
                <Search size={20} color="#666" style={{ marginRight: 8 }} />
                <TextInput 
                  style={styles.searchInput}
                  placeholder="Search your library..."
                  placeholderTextColor="#666"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <X size={18} color="#666" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.selectionHeader}>
                <Text style={styles.selectionCount}>
                  {selectedSongsToAdd.length} selected
                </Text>
                {filteredAvailableSongs.length > 0 && (
                  <TouchableOpacity onPress={handleSelectAllFiltered}>
                    <Text style={styles.selectAllText}>
                      {filteredAvailableSongs.every(s => selectedSongsToAdd.includes(s.id)) ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={filteredAvailableSongs}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isSelected = selectedSongsToAdd.includes(item.id);
                  return (
                    <TouchableOpacity 
                      style={[styles.addSongItem, isSelected && styles.addSongItemSelected]}
                      onPress={() => toggleSongSelection(item.id)}
                    >
                      {isSelected ? (
                        <CheckSquare size={24} color="#FF5500" style={styles.checkIconBox} />
                      ) : (
                        <Square size={24} color="#444" style={styles.checkIconBox} />
                      )}
                      
                      <View style={styles.addSongInfo}>
                        <Text style={[styles.addSongName, isSelected && { color: '#FF5500' }]} numberOfLines={1}>
                          {item.name.replace(/\.[^/.]+$/, '')}
                        </Text>
                        <Text style={styles.addSongArtist} numberOfLines={1}>
                          {item.artist || 'Unknown Artist'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.emptySearchText}>No songs found.</Text>
                }
              />

              <TouchableOpacity 
                style={[styles.mainActionButton, { opacity: selectedSongsToAdd.length > 0 ? 1 : 0.5 }]}
                onPress={handleAddSelectedSongs}
                disabled={selectedSongsToAdd.length === 0}
              >
                <Text style={styles.mainActionButtonText}>
                  Add {selectedSongsToAdd.length > 0 ? `(${selectedSongsToAdd.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {renderConfigModal(true)}
      </View>
    );
  }

  function renderConfigModal(isEdit) {
    const visible = isEdit ? showEditModal : showCreateModal;
    const setVisible = isEdit ? setShowEditModal : setShowCreateModal;
    const isFavorisEditing = isEdit && editingId === FAVORIS_PLAYLIST_ID; 
    const title = isEdit ? (isFavorisEditing ? 'Configure Favoris Cover' : 'Configure Playlist') : 'New Playlist';
    const buttonText = isEdit ? 'Save Changes' : 'Create Playlist';

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <TouchableOpacity onPress={() => { setVisible(false); resetForm(); }}>
                <X size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.imagePickerButton}
              onPress={handleSetImage}
            >
              {playlistImage ? (
                <Image source={{ uri: playlistImage }} style={styles.imagePickerPreview} />
              ) : (
                <View style={styles.imagePickerPlaceholder}>
                  <ImageIcon size={32} color="#666" />
                  <Text style={styles.imagePickerText}>Add Cover</Text>
                </View>
              )}
              <View style={styles.editIconBadge}>
                 <Edit size={12} color="#fff" />
              </View>
            </TouchableOpacity>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="My Awesome Playlist"
                placeholderTextColor="#666"
                value={playlistName}
                onChangeText={setPlaylistName}
                editable={!isFavorisEditing} 
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Add a description (optional)"
                placeholderTextColor="#666"
                value={playlistDesc}
                onChangeText={setPlaylistDesc}
                multiline
                editable={!isFavorisEditing} 
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => { setVisible(false); resetForm(); }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonCreate]}
                onPress={() => handleSavePlaylist(isEdit)}
              >
                <Text style={styles.modalButtonText}>{buttonText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  // --- Main View: All Playlists ---
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Music</Text>
          <Text style={styles.subtitle}>Library</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.createButton}
          onPress={() => {
            resetForm();
            setShowCreateModal(true);
          }}
        >
          <Plus size={20} color="#fff" />
          <Text style={styles.createButtonText}>New Playlist</Text>
        </TouchableOpacity>
      </View>

      {playlists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <AlignLeft size={40} color="#FF5500" />
          </View>
          <Text style={styles.emptyText}>No playlists yet</Text>
          <Text style={styles.emptySubtext}>Organize your downloaded music into custom collections.</Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.playlistCard}
              onPress={() => setSelectedPlaylist(item)}
            >
              {getPlaylistImageSource(item) ? (
                // UPDATE: Added resizeMode="cover" to force square filling
                <Image 
                  source={getPlaylistImageSource(item)} 
                  style={styles.playlistCardImage} 
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.playlistCardImagePlaceholder}>
                  <Music size={40} color="#555" />
                </View>
              )}
              <View style={styles.playlistCardContent}>
                <Text style={styles.playlistCardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.playlistCardCount}>
                  {item.songs.length} songs
                </Text>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        />
      )}

      {renderConfigModal(false)}
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
    backgroundColor: '#121212',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF5500',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    gap: 6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Playlist Card
  playlistCard: {
    width: '48%',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  playlistCardImage: {
    width: '100%',
    height: undefined, // Ensure height acts based on aspect ratio
    aspectRatio: 1,
  },
  playlistCardImagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistCardContent: {
    padding: 12,
  },
  playlistCardName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  playlistCardCount: {
    color: '#888',
    fontSize: 12,
  },
  // Playlist Detail Header
  playlistHeader: {
    padding: 20,
    paddingTop: 0,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  backText: {
    color: '#FF5500',
    fontSize: 16,
    marginLeft: 4,
  },
  playlistHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  playlistHeaderImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 16,
  },
  playlistHeaderImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  playlistHeaderInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  playlistHeaderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6,
  },
  playlistHeaderDesc: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 6,
    lineHeight: 20,
  },
  playlistHeaderCount: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  playlistActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
    gap: 12
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistControls: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 12,
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5500',
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
  },
  shuffleButton: {
    backgroundColor: '#2A2A2A',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  addSongsCircleButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    opacity: 0.8,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 250,
  },
  addFirstSongButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF5500',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 24,
    gap: 8,
  },
  addFirstSongButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal Common
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
  },
  fullHeightModal: {
    flex: 1,
    marginTop: 40,
    marginBottom: 20,
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
  // Input Styles
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#999',
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: '#2A2A2A',
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  // Image Picker
  imagePickerButton: {
    alignSelf: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  imagePickerPreview: {
    width: 140,
    height: 140,
    borderRadius: 16,
  },
  imagePickerPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePickerText: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
  },
  editIconBadge: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    backgroundColor: '#FF5500',
    padding: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1E1E1E',
  },
  // Modal Buttons
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#2A2A2A',
  },
  modalButtonCreate: {
    backgroundColor: '#FF5500',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Add Songs Specific
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 50,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    height: '100%',
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  selectionCount: {
    color: '#999',
    fontSize: 14,
  },
  selectAllText: {
    color: '#FF5500',
    fontWeight: '600',
    fontSize: 14,
  },
  addSongItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    marginBottom: 8,
  },
  addSongItemSelected: {
    backgroundColor: '#3A1A1A',
    borderWidth: 1,
    borderColor: '#FF5500',
  },
  checkIconBox: {
    marginRight: 12,
  },
  addSongInfo: {
    flex: 1,
  },
  addSongName: {
    color: '#ddd',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  addSongArtist: {
    color: '#888',
    fontSize: 13,
  },
  mainActionButton: {
    backgroundColor: '#FF5500',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  mainActionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptySearchText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  }
});