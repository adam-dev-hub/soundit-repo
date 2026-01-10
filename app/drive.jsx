
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator,
  Alert,
  Image,
  TextInput,
  Modal
} from 'react-native';
import { 
  Music, 
  Download, 
  Folder, 
  LogOut,
  RefreshCw,
  Home,
  ChevronRight,
  FolderDown,
  Search,
  X,
  WifiOff
} from 'lucide-react-native';
import { authService } from '../services/authService';
import { driveService } from '../services/driveService';
import { storageService } from '../services/storageService';
import MiniPlayer from '../components/MiniPlayer';
import { audioAnalyzer } from '../services/audioAnalyzerFFmpeg';
import NetInfo from '@react-native-community/netinfo';

export default function DriveScreen() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState([]);
  const [downloading, setDownloading] = useState({});
  const [downloadingFolder, setDownloadingFolder] = useState(false);
  const [folderProgress, setFolderProgress] = useState({ current: 0, total: 0, fileName: '' });
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [currentFolder, setCurrentFolder] = useState('root');
  const [folderStack, setFolderStack] = useState([]);
  const [folderNames, setFolderNames] = useState({ root: 'My Drive' });
  const [userInfo, setUserInfo] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? false);
    });
    return () => unsubscribe();
  }, []);

  // Check auth on mount
  useEffect(() => {
    if (isOnline) {
      checkAuth();
    }
  }, [isOnline]); // Re-check auth when coming back online
  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Load files when authenticated or folder changes
  useEffect(() => {
    if (isAuthenticated) {
      loadFiles();
      if (!userInfo) {
        loadUserInfo();
      }
    }
  }, [currentFolder, isAuthenticated]);

  const checkAuth = async () => {
    try {
      setLoading(true);
      const authenticated = await authService.isAuthenticated();
      console.log('Auth check result:', authenticated);
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        const user = await authService.getUserInfo();
        setUserInfo(user);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const loadUserInfo = async () => {
    try {
      const user = await authService.getUserInfo();
      setUserInfo(user);
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      console.log('Starting login process...');
      
      const auth = await authService.authenticate();
      
      console.log('Auth result:', auth);
      
      if (auth && auth.accessToken) {
        console.log('Login successful, updating state...');
        setIsAuthenticated(true);
        setUserInfo(auth.user);
        
        // Force a re-check after a short delay to ensure everything is saved
        setTimeout(() => {
          checkAuth();
        }, 500);
      } else {
        console.log('Login cancelled or failed');
        Alert.alert('Login Cancelled', 'You cancelled the login process.');
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert(
        'Error', 
        'Failed to sign in with Google. Please try again.\n\n' + 
        (error.message || 'Unknown error')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.logout();
              setIsAuthenticated(false);
              setFiles([]);
              setUserInfo(null);
              setCurrentFolder('root');
              setFolderStack([]);
              setFolderNames({ root: 'My Drive' });
            } catch (error) {
              console.error('Logout error:', error);
            }
          },
        },
      ]
    );
  };

  const loadFiles = async () => {
    try {
      setLoading(true);
      console.log('Loading files from folder:', currentFolder);
      const data = await driveService.listAudioFiles(currentFolder);
      console.log('Files loaded:', data.files?.length || 0);
      setFiles(data.files || []);
    } catch (error) {
      console.error('Error loading files:', error);
      
      // Check if it's an auth error
      if (error.message?.includes('401') || error.message?.includes('403')) {
        Alert.alert(
          'Session Expired',
          'Your session has expired. Please sign in again.',
          [
            {
              text: 'Sign In',
              onPress: () => {
                setIsAuthenticated(false);
              }
            }
          ]
        );
      } else {
        Alert.alert(
          'Error', 
          'Failed to load files from Drive. Please check your internet connection.',
          [
            { text: 'OK' },
            { text: 'Retry', onPress: () => loadFiles() }
          ]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (file) => {
    let localUri = null;
    try {
      setDownloading(prev => ({ 
        ...prev, 
        [file.id]: { progress: 0, message: 'Downloading...' } 
      }));
      
      const { uri, metadata } = await driveService.downloadFile(
        file.id, 
        file.name,
        (progress) => {
          setDownloading(prev => ({ 
            ...prev, 
            [file.id]: { progress, message: 'Downloading...' } 
          }));
        }
      );
      
      localUri = uri;

      setDownloading(prev => ({ 
        ...prev, 
        [file.id]: { progress: 1, message: 'Analyzing Audio (FFmpeg)...' } 
      }));

      let waveformData;
      try {
        waveformData = await audioAnalyzer.generateWaveform(localUri);
      } catch (analysisError) {
        console.warn(`Waveform analysis failed for ${file.name}. Using fallback.`, analysisError);
        waveformData = audioAnalyzer._generateFallbackWaveform(); 
      }
      
      const song = {
        id: file.id,
        name: file.name,
        localUri: localUri,
        size: Number(file.size) || 0,
        downloadedAt: new Date().toISOString(),
        isStreaming: false,
        artist: metadata?.artist || null,
        album: metadata?.album || null,
        duration: metadata?.duration || null,
        artwork: metadata?.artwork || null,
        waveform: waveformData,
      };

      await storageService.saveDownloadedSong(song);
      Alert.alert('Success', `"${file.name}" downloaded and analyzed successfully!`);
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to download file. Please try again.');
    } finally {
      setDownloading(prev => {
        const newState = { ...prev };
        delete newState[file.id];
        return newState;
      });
    }
  };

  const handleDownloadFolder = async () => {
    const audioFiles = files.filter(f => f.mimeType.includes('audio/'));
    
    if (audioFiles.length === 0) {
      Alert.alert('No Audio Files', 'This folder contains no audio files to download.');
      return;
    }

    Alert.alert(
      'Download Folder',
      `Download all ${audioFiles.length} audio file(s) from this folder?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: async () => {
            setDownloadingFolder(true);
            setShowProgressModal(true);
            setFolderProgress({ current: 0, total: audioFiles.length, fileName: '' });

            const results = await driveService.downloadFolderFiles(
              audioFiles,
              (progress, fileName) => {
                setFolderProgress(prev => ({
                  ...prev,
                  fileName: `Downloading: ${fileName}`,
                }));
              },
              async (fileName, success) => {
                const file = audioFiles.find(f => f.name === fileName);
                const currentCount = folderProgress.current;

                if (success && file) {
                  const result = results.find(r => r.file.id === file.id);
                  
                  if (result?.result) {
                    const localUri = result.result.uri;
                    
                    setFolderProgress(prev => ({
                      ...prev,
                      fileName: `Analyzing: ${file.name} (${currentCount + 1}/${prev.total})`,
                    }));
                    
                    let waveformData;
                    try {
                      waveformData = await audioAnalyzer.generateWaveform(localUri);
                    } catch (analysisError) {
                      console.warn(`Batch analysis failed for ${file.name}. Using fallback.`);
                      waveformData = audioAnalyzer._generateFallbackWaveform();
                    }
                    
                    const song = {
                      id: file.id,
                      name: result.result.metadata?.title || file.name,
                      localUri: result.result.uri,
                      size: file.size,
                      downloadedAt: new Date().toISOString(),
                      isStreaming: false,
                      artist: result.result.metadata?.artist || null,
                      album: result.result.metadata?.album || null,
                      duration: result.result.metadata?.duration || null,
                      artwork: result.result.metadata?.artwork || null,
                      waveform: waveformData,
                    };
                    await storageService.saveDownloadedSong(song);
                  }
                }
                
                setFolderProgress(prev => ({
                  ...prev,
                  current: prev.current + 1,
                }));
              }
            );

            setDownloadingFolder(false);
            setShowProgressModal(false);
            
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;
            
            if (failCount === 0) {
              Alert.alert('Success', `All ${successCount} files downloaded and analyzed successfully!`);
            } else {
              Alert.alert(
                'Partially Complete',
                `${successCount} files downloaded and analyzed, ${failCount} failed.`
              );
            }
          },
        },
      ]
    );
  };

  const handleFolderPress = (folder) => {
    setFolderStack([...folderStack, { id: currentFolder, name: folderNames[currentFolder] || 'Folder' }]);
    setCurrentFolder(folder.id);
    setFolderNames(prev => ({ ...prev, [folder.id]: folder.name }));
  };

  const handleBackPress = () => {
    if (folderStack.length > 0) {
      const newStack = [...folderStack];
      const previousFolder = newStack.pop();
      setFolderStack(newStack);
      setCurrentFolder(previousFolder.id);
    }
  };

  const handleHomePress = () => {
    setCurrentFolder('root');
    setFolderStack([]);
  };

  const renderBreadcrumb = () => {
    if (currentFolder === 'root') return null;

    return (
      <View style={styles.breadcrumb}>
        <TouchableOpacity onPress={handleHomePress} style={styles.breadcrumbItem}>
          <Home size={16} color="#FF5500" />
          <Text style={styles.breadcrumbText}>My Drive</Text>
        </TouchableOpacity>
        
        {folderStack.map((folder, index) => (
          <View key={`${folder.id}-${index}`} style={styles.breadcrumbItem}>
            <ChevronRight size={16} color="#666" />
            <TouchableOpacity onPress={() => {
              const newStack = folderStack.slice(0, index + 1);
              setFolderStack(newStack);
              setCurrentFolder(folder.id);
            }}>
              <Text style={styles.breadcrumbText}>{folder.name}</Text>
            </TouchableOpacity>
          </View>
        ))}
        
        <View style={styles.breadcrumbItem}>
          <ChevronRight size={16} color="#666" />
          <Text style={[styles.breadcrumbText, styles.breadcrumbCurrent]}>
            {folderNames[currentFolder] || 'Current Folder'}
          </Text>
        </View>
      </View>
    );
  };

  const renderFile = ({ item }) => {
    const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
    const isDownloading = !!downloading[item.id];

    if (isFolder) {
      return (
        <TouchableOpacity 
          style={styles.fileItem}
          onPress={() => handleFolderPress(item)}
        >
          <View style={styles.folderIcon}>
            <Folder size={24} color="#FF5500" />
          </View>
          <View style={styles.fileInfo}>
            <Text style={styles.fileName}>{item.name}</Text>
            <Text style={styles.fileSize}>Folder</Text>
          </View>
          <ChevronRight size={20} color="#666" />
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.fileItem}>
        <View style={styles.musicIcon}>
          <Music size={24} color="#FF5500" />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.fileSize}>
            {item.size ? (item.size / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown size'}
          </Text>
        </View>
        
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => handleDownload(item)}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <ActivityIndicator size="small" color="#FF5500" />
          ) : (
            <Download size={20} color="#FF5500" />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  if (!isOnline) {
    return (
      <View style={styles.container}>
         <View style={styles.headertop}>
            <View>
            <Text style={styles.title}>My Drive</Text>
            </View>
        </View>
        <View style={styles.centerContainer}>
          <WifiOff size={64} color="#333" />
          <Text style={styles.emptyText}>You are offline</Text>
          <Text style={styles.emptySubtext}>
            Connect to the internet to access your Google Drive music.
          </Text>
        </View>
        <MiniPlayer />
      </View>
    );
  }

  // Loading screen (initial check)
  if (loading && !isAuthenticated && !userInfo) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF5500" />
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  // Login screen
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.authContainer}>
          <Music size={80} color="#FF5500" />
          <Text style={styles.logoText}>SoundIt</Text>
          <Text style={styles.tagline}>Access your Google Drive music</Text>
          
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            Browse and download your music files from Google Drive
          </Text>
        </View>
      </View>
    );
  }

  // Drive navigation screen (authenticated)
  const audioFilesCount = files.filter(f => f.mimeType.includes('audio/')).length;

  return (
    <View style={styles.container}>
      <View style={styles.headertop}>
        <View>
          <Text style={styles.title}>My Drive</Text>
          <Text style={styles.subtitle}>Download Tracks from Google Drive</Text>
        </View>
      </View>

      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Search size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search in Drive..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View style={styles.headerButtons}>
          {userInfo?.photo && (
            <Image 
              source={{ uri: userInfo.photo }} 
              style={styles.userPhoto}
            />
          )}
          <TouchableOpacity onPress={loadFiles} style={styles.iconButton}>
            <RefreshCw size={22} color="#999" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.iconButton}>
            <LogOut size={22} color="#999" />
          </TouchableOpacity>
        </View>
      </View>

      {renderBreadcrumb()}

      {audioFilesCount > 0 && (
        <View style={styles.folderActionsBar}>
          <Text style={styles.folderActionsText}>
            {audioFilesCount} audio file{audioFilesCount > 1 ? 's' : ''} in this folder
          </Text>
          <TouchableOpacity 
            style={styles.downloadFolderButton}
            onPress={handleDownloadFolder}
            disabled={downloadingFolder}
          >
            {downloadingFolder ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.downloadFolderText}>Downloading...</Text>
              </>
            ) : (
              <>
                <FolderDown size={18} color="#fff" />
                <Text style={styles.downloadFolderText}>Download All</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {folderStack.length > 0 && (
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF5500" />
          <Text style={styles.loadingText}>Loading files...</Text>
        </View>
      ) : filteredFiles.length === 0 ? (
        <View style={styles.centerContainer}>
          <Folder size={48} color="#666" />
          <Text style={styles.emptyText}>No files found</Text>
          <Text style={styles.emptySubtext}>
            {searchQuery ? 'Try a different search' : 'This folder is empty'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredFiles}
          keyExtractor={(item) => item.id}
          renderItem={renderFile}
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}

      <Modal
        visible={showProgressModal}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.progressModal}>
            <Text style={styles.progressTitle}>Downloading Files</Text>
            
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${(folderProgress.current / folderProgress.total) * 100}%` }]} />
            </View>
            
            <Text style={styles.progressText}>
              {folderProgress.current} / {folderProgress.total} files
            </Text>
            
            {folderProgress.fileName && (
              <Text style={styles.progressFileName} numberOfLines={1}>
                {folderProgress.fileName}
              </Text>
            )}
          </View>
        </View>
      </Modal>

      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FF5500',
    marginTop: 16,
  },
  tagline: {
    fontSize: 16,
    color: '#999',
    marginTop: 8,
    marginBottom: 48,
  },
  googleButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    minWidth: 250,
    alignItems: 'center',
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  headertop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userPhoto: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FF5500',
  },
  iconButton: {
    padding: 8,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
    flexWrap: 'wrap',
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  breadcrumbText: {
    color: '#FF5500',
    fontSize: 13,
    marginHorizontal: 4,
  },
  breadcrumbCurrent: {
    color: '#fff',
    fontWeight: '600',
  },
  folderActionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#252525',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  folderActionsText: {
    color: '#999',
    fontSize: 13,
  },
  downloadFolderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF5500',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  downloadFolderText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#252525',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  backText: {
    color: '#FF5500',
    fontSize: 14,
    fontWeight: '500',
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  folderIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  musicIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  fileName: {
    color: '#fff',
    fontSize: 15,
  },
  fileSize: {
    color: '#999',
    fontSize: 13,
    marginTop: 4,
  },
  actionButton: {
    padding: 12,
  },
  loadingText: {
    color: '#999',
    fontSize: 14,
    marginTop: 12,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#999',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  progressModal: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 300,
  },
  progressTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#3a3a3a',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FF5500',
  },
  progressText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  progressFileName: {
    color: '#999',
    fontSize: 13,
    textAlign: 'center',
  },
});