// services/authService.js - Simplified version with expo-auth-session
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

// NÃ©cessaire pour fermer le navigateur web aprÃ¨s auth
WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

// Your Android Client ID
const CLIENT_ID = '979463258168-l3dhhmpodirggkbqtikqugpo54dtmjtp.apps.googleusercontent.com';

const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.readonly'
];

export const authService = {
  configure() {
    console.log('Auth service configured');
  },

  async authenticate() {
    try {
      console.log('Starting authentication...');
      
      // Create redirect URI
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'com.soundit.app', // Must match your package name
      });

      console.log('Redirect URI:', redirectUri);
      

      // Create auth request
      const authRequest = new AuthSession.AuthRequest({
        clientId: CLIENT_ID,
        scopes: SCOPES,
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
        extraParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      });

      // Prompt user for authentication
      const result = await authRequest.promptAsync(discovery);

      console.log('Auth result:', result.type);

      if (result.type !== 'success') {
        if (result.type === 'error') {
          console.error('Auth error:', result.error);
        }
        console.log('Authentication cancelled or failed');
        return null;
      }

      const { code } = result.params;
      console.log('Received authorization code');

      // Exchange code for tokens
      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId: CLIENT_ID,
          code,
          redirectUri,
          extraParams: {
            code_verifier: authRequest.codeVerifier,
          },
        },
        discovery
      );

      console.log('Token exchange successful');

      // Get user info
      const userInfoResponse = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${tokenResponse.accessToken}`,
          },
        }
      );

      const userInfo = await userInfoResponse.json();

      // Save tokens and user info
      await AsyncStorage.setItem('google_token', tokenResponse.accessToken);
      await AsyncStorage.setItem('refresh_token', tokenResponse.refreshToken || '');
      await AsyncStorage.setItem('user_info', JSON.stringify(userInfo));
      
      if (tokenResponse.idToken) {
        await AsyncStorage.setItem('id_token', tokenResponse.idToken);
      }

      console.log('Authentication successful!');
      console.log('User:', userInfo.email);

      return {
        accessToken: tokenResponse.accessToken,
        refreshToken: tokenResponse.refreshToken,
        idToken: tokenResponse.idToken,
        user: {
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          photo: userInfo.picture,
          givenName: userInfo.given_name,
          familyName: userInfo.family_name,
        }
      };
    } catch (error) {
      console.error('Sign-in error:', error);
      console.error('Error details:', error.message);
      throw error;
    }
  },

  async getToken() {
    try {
      const token = await AsyncStorage.getItem('google_token');
      return token;
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  },

  async refreshToken() {
    try {
      const refreshToken = await AsyncStorage.getItem('refresh_token');

      if (!refreshToken) {
        console.log('No refresh token available');
        return null;
      }

      // Exchange refresh token for new access token
      const response = await fetch(discovery.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Refresh token error:', error);
        throw new Error('Failed to refresh token');
      }

      const data = await response.json();
      await AsyncStorage.setItem('google_token', data.access_token);

      console.log('Token refreshed successfully');
      return data.access_token;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return null;
    }
  },

  async logout() {
    try {
      const token = await AsyncStorage.getItem('google_token');

      // Revoke token if possible
      if (token) {
        try {
          await fetch(discovery.revocationEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `token=${token}`,
          });
          console.log('Token revoked');
        } catch (error) {
          console.warn('Error revoking token:', error);
        }
      }

      // Clear local storage
      await AsyncStorage.multiRemove([
        'google_token',
        'refresh_token',
        'id_token',
        'user_info'
      ]);

      console.log('Logged out successfully');
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  },

  async isAuthenticated() {
    try {
      const token = await AsyncStorage.getItem('google_token');
      return !!token;
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  },

  async getCurrentUser() {
    try {
      const userInfoString = await AsyncStorage.getItem('user_info');
      return userInfoString ? JSON.parse(userInfoString) : null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  },

  async getUserInfo() {
    return await this.getCurrentUser();
  }
};