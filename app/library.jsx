// app/library.jsx
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  TouchableOpacity,
  Alert,
  RefreshControl
} from 'react-native';
import { Trash2, Music, FolderOpen } from 'lucide-react-native';
import { storageService } from '../services/storageService';
import { useAudio } from '../context/AudioContext';
import SongItem from '../components/SongItem';
import MiniPlayer from '../components/MiniPlayer';

export default function LibraryScreen() {
  const [songs, setSongs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const { currentSong, playSong, setPlayQueue } = useAudio();

  useEffect(() => {
    loadSongs();
  }, []);

  const loadSongs = async () => {
    try {
      const downloaded = await storageService.getDownloadedSongs();
      setSongs(downloaded);
    } catch (error) {
      console.error('Error loading songs:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSongs();
    setRefreshing(false);
  };

  const handlePlaySong = async (song, index) => {
    setPlayQueue(songs, index);
    await playSong(song, songs);
  };

  const handleDeleteSong = (song) => {
    Alert.alert(
      'Delete Song',
      `Are you sure you want to delete "${song.name.replace(/\.[^/.]+$/, '')}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await storageService.deleteSong(song.id);
            loadSongs();
          },
        },
      ]
    );
  };

  const handlePlayAll = async () => {
    if (songs.length === 0) return;
    setPlayQueue(songs, 0);
    await playSong(songs[0], songs);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Library</Text>
          <Text style={styles.count}>
            {songs.length} {songs.length === 1 ? 'song' : 'songs'}
          </Text>
        </View>
        
        {songs.length > 0 && (
          <TouchableOpacity 
            style={styles.playAllButton}
            onPress={handlePlayAll}
          >
            <Text style={styles.playAllText}>Play All</Text>
          </TouchableOpacity>
        )}
      </View>

      {songs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FolderOpen size={64} color="#666" />
          <Text style={styles.emptyText}>No downloaded songs</Text>
          <Text style={styles.emptySubtext}>
            Go to the home screen to download music from your Google Drive
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
              onOptions={() => handleDeleteSong(item)}
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
        />
      )}

      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  count: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  playAllButton: {
    backgroundColor: '#FF5500',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  playAllText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    color: '#999',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});
