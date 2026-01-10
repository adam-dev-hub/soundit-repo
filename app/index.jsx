// app/index.jsx
import React, { useState, useCallback, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
  Modal,
  StatusBar,
  Platform
} from 'react-native';
import { Music, FolderOpen, Play, Shuffle, User, ArrowLeft, HardDrive } from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { storageService } from '../services/storageService';
import { driveService } from '../services/driveService';
import { useAudio } from '../context/AudioContext';
import SongItem from '../components/SongItem';
import MiniPlayer from '../components/MiniPlayer';
import NetInfo from '@react-native-community/netinfo';

const FAVORIS_PLAYLIST_ID = 'favoris_playlist_fixed_id'; 
const FAVORIS_PLAYLIST_COVER_DEFAULT = 'FAVORIS_DEFAULT_LOCAL_ASSET';
const FAVORIS_LOCAL_IMAGE = require('../assets/heart_icon.png');
const SOUNDIT_LOGO = require('../assets/slogan_logo.png');

export default function HomeScreen() {
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [artists, setArtists] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingArtistImages, setLoadingArtistImages] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  
  const [storageUsed, setStorageUsed] = useState('0 MB');
  
  const [showArtistModal, setShowArtistModal] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState(null);
  
  const { currentSong, playSong, isShuffled, toggleShuffle } = useAudio();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = storageService.addChangeListener(async (type, data) => {
      if (type === 'songDeleted') {
        setSongs(prev => prev.filter(s => s.id !== data.songId));
        setPlaylists(prev => prev.map(p => ({
          ...p,
          songs: p.songs.filter(s => s.id !== data.songId)
        })));
        
        // Reload to update artists and storage
        const [fetchedSongs, fetchedPlaylists, usage] = await Promise.all([
          storageService.getDownloadedSongs(),
          storageService.getPlaylists(),
          storageService.getStorageUsage()
        ]);
        
        setSongs(fetchedSongs || []);
        setPlaylists(fetchedPlaylists || []);
        setStorageUsed(usage);
        
        if (fetchedSongs && fetchedSongs.length > 0) {
          await processArtists(fetchedSongs);
        } else {
          setArtists([]);
        }
      } else if (type === 'songUpdated') {
        setSongs(prev => prev.map(s => 
          s.id === data.songId ? { ...s, ...data.metadata } : s
        ));
        
        // Reload to ensure consistency
        const fetchedSongs = await storageService.getDownloadedSongs();
        setSongs(fetchedSongs || []);
        
        if (fetchedSongs && fetchedSongs.length > 0) {
          await processArtists(fetchedSongs);
        }
      } else if (type === 'songAdded') {
        // 1. OPTIMISTIC UPDATE: If the event sends the song object, add it immediately
        if (data?.song) {
           setSongs(prev => {
             // Prevent duplicates just in case
             if (prev.find(s => s.id === data.song.id)) return prev;
             return [data.song, ...prev];
           });
        }

        // 2. DELAYED FETCH: Wait 500ms to allow filesystem to settle before fetching
        setTimeout(async () => {
          const [fetchedSongs, fetchedPlaylists, usage] = await Promise.all([
            storageService.getDownloadedSongs(),
            storageService.getPlaylists(),
            storageService.getStorageUsage()
          ]);
          
          setSongs(fetchedSongs || []);
          setPlaylists(fetchedPlaylists || []);
          setStorageUsed(usage);
          
          if (fetchedSongs && fetchedSongs.length > 0) {
            await processArtists(fetchedSongs);
          }
        }, 500);
      }
    });
  
    return () => unsubscribe();
  }, []);
  
  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      if (!refreshing) setLoading(true);
      
      const [fetchedSongs, fetchedPlaylists, usage] = await Promise.all([
        storageService.getDownloadedSongs(),
        storageService.getPlaylists(),
        storageService.getStorageUsage() 
      ]);
      
      setSongs(fetchedSongs || []);
      setPlaylists(fetchedPlaylists || []);
      setStorageUsed(usage);
      
      if (fetchedSongs && fetchedSongs.length > 0) {
        await processArtists(fetchedSongs);
      }
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processArtists = async (songList) => {
    try {
      const artistMap = {};
      
      songList.forEach(song => {
        let artistName = song.artist || 'Unknown Artist';
        
        if (artistName === 'Unknown Artist' && song.name) {
          const nameWithoutExt = song.name.replace(/\.[^.]+$/, '');
          const match = nameWithoutExt.match(/^(.+?)\s*[-—–]\s*(.+)$/);
          if (match) {
            artistName = match[1].trim();
          }
        }
        
        if (!artistMap[artistName]) {
          artistMap[artistName] = {
            name: artistName,
            songs: [],
            image: null,
          };
        }
        
        artistMap[artistName].songs.push(song);
      });

      const artistsArray = Object.values(artistMap)
        .sort((a, b) => b.songs.length - a.songs.length)
        .slice(0, 20);

      // Always load cached images first (works offline)
      const artistsWithCachedImages = await Promise.all(
        artistsArray.map(async (artist) => {
          if (artist.name !== 'Unknown Artist') {
            const cachedImage = await storageService.getCachedArtistImage(artist.name);
            return { ...artist, image: cachedImage };
          }
          return artist;
        })
      );

      setArtists(artistsWithCachedImages);

      // Only fetch missing images if online
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        console.log('📵 Offline mode: Skipping artist image fetch');
        return;
      }

      const artistsNeedingImages = artistsWithCachedImages.filter(
        artist => !artist.image && artist.name !== 'Unknown Artist'
      );

      if (artistsNeedingImages.length > 0) {
        console.log(`🎨 Fetching ${artistsNeedingImages.length} missing artist images...`);
        setLoadingArtistImages(true);
        
        for (let i = 0; i < artistsNeedingImages.length; i++) {
          const artist = artistsNeedingImages[i];
          
          try {
            // Double-check connectivity before each fetch
            const currentNetState = await NetInfo.fetch();
            if (!currentNetState.isConnected) {
              console.log('📵 Lost connection, stopping image fetch');
              break;
            }

            const image = await driveService.fetchArtistImage(artist.name);
            if (image) {
              setArtists(prev => 
                prev.map(a => 
                  a.name === artist.name ? { ...a, image } : a
                )
              );
            }
          } catch (error) {
            // Silently handle network errors
            const errorMessage = error?.message?.toLowerCase() || '';
            if (errorMessage.includes('network') || 
                errorMessage.includes('fetch') || 
                errorMessage.includes('timeout') ||
                errorMessage.includes('connection')) {
              console.log(`⚠️ Network error for ${artist.name}, skipping...`);
            } else {
              console.error(`❌ Error fetching image for ${artist.name}:`, error);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }
    } catch (error) {
      console.error('Error processing artists:', error);
    } finally {
      setLoadingArtistImages(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handlePlaySong = async (song, index) => {
    if (isShuffled) {
      toggleShuffle();
    }
    await playSong(song, songs);
  };

  const handlePlayArtist = async (artist) => {
    if (artist.songs.length === 0) return;
    if (isShuffled) toggleShuffle();
    await playSong(artist.songs[0], artist.songs);
  };

  const handleShuffleAll = async () => {
    if (songs.length === 0) return;
    
    const shuffledSongs = [...songs];
    for (let i = shuffledSongs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledSongs[i], shuffledSongs[j]] = [shuffledSongs[j], shuffledSongs[i]];
    }

    if (isShuffled) toggleShuffle();
    await playSong(shuffledSongs[0], shuffledSongs);
  };

  const handlePlayAll = async () => {
    if (songs.length === 0) return;
    if (isShuffled) toggleShuffle();
    await playSong(songs[0], songs);
  };

  const handleArtistPress = (artist) => {
    setSelectedArtist(artist);
    setShowArtistModal(true);
  };

  const handlePlayArtistSong = async (song, index) => {
    if (!selectedArtist) return;
    if (isShuffled) toggleShuffle();
    await playSong(song, selectedArtist.songs);
    setShowArtistModal(false);
  };

  const FixedHeader = () => (
    <View style={styles.fixedHeader}>
      <View style={styles.logoContainer}>
        <Image 
          source={SOUNDIT_LOGO} 
          style={styles.logoImage} 
          resizeMode="contain" 
        />
      </View>
      
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Music size={14} color="#666" />
          <Text style={styles.statText}>{songs.length} Tracks</Text>
        </View>
        <View style={styles.statItem}>
          <HardDrive size={14} color="#666" />
          <Text style={styles.statText}>{storageUsed}</Text>
        </View>
      </View>
    </View>
  );

  const ScrollableContentHeader = () => (
    <View style={{ paddingTop: 10 }}> 
      {renderArtistsSection()}
      {renderPlaylistsSection()}

      <View style={[styles.sectionHeader, { paddingHorizontal: 16, marginTop: 10 }]}>
        <Text style={styles.sectionTitle}>All Tracks ({songs.length})</Text>
        
        {songs.length > 0 && (
          <View style={styles.headerControls}>
            <TouchableOpacity onPress={handleShuffleAll} style={styles.controlButton}>
              <Shuffle size={20} color="#FF5500" />
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handlePlayAll} style={styles.controlButton}>
              <Play size={20} color="#FF5500" fill="#FF5500" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  const renderArtistsSection = () => {
    if (artists.length === 0) return null;

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Artists</Text>
          <TouchableOpacity onPress={() => {
            setSelectedArtist(null);
            setShowArtistModal(true);
          }}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView 
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.artistListContent}
          scrollEventThrottle={16}
          nestedScrollEnabled={true}
          directionalLockEnabled={true}
        >
          {artists.slice(0, 10).map((item) => {
            const isPlaying = item.songs.some(song => song.id === currentSong?.id);
            
            return (
              <TouchableOpacity 
                key={item.name}
                style={styles.artistCard}
                onPress={() => handleArtistPress(item)}
              >
                <View style={[styles.artistImageContainer, isPlaying && styles.artistImagePlaying]}>
                  {item.image ? (
                    <Image 
                      source={{ uri: item.image }} 
                      style={styles.artistImage}
                    />
                  ) : (
                    <View style={styles.artistImagePlaceholder}>
                      <User size={32} color="#555" />
                    </View>
                  )}
                  
                  {isPlaying && (
                    <View style={styles.artistPlayingOverlay}>
                      <View style={styles.artistPlayingIndicator}>
                        <View style={[styles.miniBar, styles.miniBar1]} />
                        <View style={[styles.miniBar, styles.miniBar2]} />
                        <View style={[styles.miniBar, styles.miniBar3]} />
                      </View>
                    </View>
                  )}
                </View>
                
                <Text style={[styles.artistName, isPlaying && styles.artistNamePlaying]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.artistCount}>
                  {item.songs.length} song{item.songs.length !== 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        
        {loadingArtistImages && isOnline && (
          <View style={styles.artistLoadingContainer}>
            <ActivityIndicator size="small" color="#FF5500" />
            <Text style={styles.artistLoadingText}>Loading artist images...</Text>
          </View>
        )}
      </View>
    );
  };

  const renderPlaylistsSection = () => {
    if (playlists.length === 0) return null;

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Playlists</Text>
          <TouchableOpacity onPress={() => router.push('/mymusic')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView 
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.playlistListContent}
          scrollEventThrottle={16}
          nestedScrollEnabled={true}
          directionalLockEnabled={true}
        >
          {playlists.map((item) => {
            let imageSource = null;
            
            if (item.id === FAVORIS_PLAYLIST_ID && item.image === FAVORIS_PLAYLIST_COVER_DEFAULT) {
                imageSource = FAVORIS_LOCAL_IMAGE; 
            } else if (item.image) {
                imageSource = { uri: item.image };
            }

            return (
              <TouchableOpacity 
                key={item.id}
                style={styles.playlistCard}
                onPress={() => router.push('/mymusic')} 
              >
                {imageSource ? (
                  <Image source={imageSource} style={styles.playlistImage} />
                ) : (
                  <View style={styles.playlistImagePlaceholder}>
                    <Music size={32} color="#555" />
                  </View>
                )}
                <Text style={styles.playlistName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.playlistCount}>{item.songs.length} songs</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF5500" />
        <Text style={styles.loadingText}>Loading SoundIt...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FixedHeader />

      {songs.length === 0 && playlists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FolderOpen size={64} color="#333" />
          <Text style={styles.emptyText}>No music found</Text>
          <Text style={styles.emptySubtext}>
            Download songs from Drive or create a playlist to get started.
          </Text>
        </View>
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<ScrollableContentHeader />}
          extraData={songs.length}
          renderItem={({ item, index }) => (
            <SongItem
              song={item}
              onPress={() => handlePlaySong(item, index)}
              isPlaying={currentSong?.id === item.id}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF5500"
              colors={['#FF5500']}
              progressViewOffset={10} 
            />
          }
          contentContainerStyle={{ 
            paddingBottom: currentSong ? 95 : 0 
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={showArtistModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowArtistModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowArtistModal(false)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.artistModalContent}
          >
            <View style={styles.artistModalHeader}>
              <TouchableOpacity 
                onPress={() => setShowArtistModal(false)}
                style={styles.backButton}
              >
                <ArrowLeft size={24} color="#FF5500" />
              </TouchableOpacity>
              <Text style={styles.artistModalTitle}>
                {selectedArtist ? selectedArtist.name : 'All Artists'}
              </Text>
              <View style={{ width: 24 }} />
            </View>

            {selectedArtist ? (
              <>
                <View style={styles.artistDetailHeader}>
                  <View style={styles.artistDetailImageContainer}>
                    {selectedArtist.image ? (
                      <Image 
                        source={{ uri: selectedArtist.image }} 
                        style={styles.artistDetailImage}
                      />
                    ) : (
                      <View style={styles.artistDetailImagePlaceholder}>
                        <User size={48} color="#555" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.artistDetailName}>{selectedArtist.name}</Text>
                  <Text style={styles.artistDetailCount}>
                    {selectedArtist.songs.length} song{selectedArtist.songs.length !== 1 ? 's' : ''}
                  </Text>
                  
                  <TouchableOpacity 
                    style={styles.playArtistButton}
                    onPress={() => {
                      handlePlayArtist(selectedArtist);
                      setShowArtistModal(false);
                    }}
                  >
                    <Play size={20} color="#fff" fill="#fff" />
                    <Text style={styles.playArtistButtonText}>Play All</Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  data={selectedArtist.songs}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item, index }) => (
                    <SongItem
                      song={item}
                      onPress={() => handlePlayArtistSong(item, index)}
                      isPlaying={currentSong?.id === item.id}
                    />
                  )}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  showsVerticalScrollIndicator={false}
                />
              </>
            ) : (
              <FlatList
                data={artists}
                keyExtractor={(item) => item.name}
                numColumns={2}
                columnWrapperStyle={styles.artistGridRow}
                renderItem={({ item }) => {
                  const isPlaying = item.songs.some(song => song.id === currentSong?.id);
                  
                  return (
                    <TouchableOpacity 
                      style={styles.artistGridCard}
                      onPress={() => {
                        setSelectedArtist(item);
                      }}
                    >
                      <View style={[styles.artistGridImage, isPlaying && styles.artistImagePlaying]}>
                        {item.image ? (
                          <Image 
                            source={{ uri: item.image }} 
                            style={styles.artistImage}
                          />
                        ) : (
                          <View style={styles.artistImagePlaceholder}>
                            <User size={32} color="#555" />
                          </View>
                        )}
                        
                        {isPlaying && (
                          <View style={styles.artistPlayingOverlay}>
                            <View style={styles.artistPlayingIndicator}>
                              <View style={[styles.miniBar, styles.miniBar1]} />
                              <View style={[styles.miniBar, styles.miniBar2]} />
                              <View style={[styles.miniBar, styles.miniBar3]} />
                            </View>
                          </View>
                        )}
                      </View>
                      
                      <Text style={[styles.artistGridName, isPlaying && styles.artistNamePlaying]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.artistGridCount}>
                        {item.songs.length} song{item.songs.length !== 1 ? 's' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
                contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  fixedHeader: {
    height: 70, 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: '#222', 
    zIndex: 10,
    elevation: 0,
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  logoContainer: {
    justifyContent: 'center',
  },
  logoImage: {
    width: 90,
    height: 40,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 6,
  },
  statText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: { color: '#666', marginTop: 12 },
  sectionContainer: { marginBottom: 10 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  seeAllText: { color: '#FF5500', fontSize: 14, fontWeight: '600' },
  headerControls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  controlButton: { padding: 4 },
  artistListContent: { paddingHorizontal: 16, paddingRight: 8 },
  artistCard: { width: 120, marginRight: 16, alignItems: 'center' },
  artistImageContainer: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  artistImagePlaying: { borderWidth: 3, borderColor: '#FF5500' },
  artistImage: { width: '100%', height: '100%' },
  artistImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistPlayingOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 85, 0, 0.9)',
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistPlayingIndicator: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 },
  miniBar: { width: 2, backgroundColor: '#fff', borderRadius: 1 },
  miniBar1: { height: 6 },
  miniBar2: { height: 10 },
  miniBar3: { height: 4 },
  artistName: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 2, textAlign: 'center' },
  artistNamePlaying: { color: '#FF5500' },
  artistCount: { color: '#666', fontSize: 12, textAlign: 'center' },
  artistLoadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 8 },
  artistLoadingText: { color: '#666', fontSize: 12 },
  playlistListContent: { paddingHorizontal: 16, paddingRight: 8 },
  playlistCard: { width: 140, marginRight: 16 },
  playlistImage: { width: 140, height: 140, borderRadius: 12, marginBottom: 8 },
  playlistImagePlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  playlistName: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  playlistCount: { color: '#666', fontSize: 12 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 60,
  },
  emptyText: { color: '#fff', fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptySubtext: { color: '#666', fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  artistModalContent: { backgroundColor: '#121212', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', flex: 1 },
  artistModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  backButton: { padding: 4 },
  artistModalTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  artistDetailHeader: { alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  artistDetailImageContainer: { width: 140, height: 140, borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
  artistDetailImage: { width: '100%', height: '100%' },
  artistDetailImagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#2A2A2A', justifyContent: 'center', alignItems: 'center' },
  artistDetailName: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  artistDetailCount: { fontSize: 14, color: '#666', marginBottom: 20 },
  playArtistButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF5500', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24, gap: 8 },
  playArtistButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  artistGridRow: { justifyContent: 'space-between', paddingHorizontal: 8 },
  artistGridCard: { width: '48%', marginBottom: 20, alignItems: 'center' },
  artistGridImage: { width: '100%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', marginBottom: 8 },
  artistGridName: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  artistGridCount: { color: '#666', fontSize: 12, textAlign: 'center' },
});