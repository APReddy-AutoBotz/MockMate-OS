import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../../services/supabaseClient';
import * as WebBrowser from 'expo-web-browser';
import { API_ORIGIN } from '../../services/apiBase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Please fill in both email and password.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(null, email, password);
        Alert.alert('Account Created', 'Your account has been created successfully! Welcome to MockMate.');
      } else {
        await signInWithEmailAndPassword(null, email, password);
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert('Authentication Failed', error.message || 'Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPrivacy = async () => {
    try {
      const url = `${API_ORIGIN || 'https://mockmate.app'}/privacy`;
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not open Privacy Policy link.');
    }
  };

  const handleOpenTerms = async () => {
    try {
      const url = `${API_ORIGIN || 'https://mockmate.app'}/terms`;
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not open Terms of Service link.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logoText}>M</Text>
          <Text style={styles.title}>MockMate</Text>
          <Text style={styles.subtitle}>Resume, spoken English, and interview practice</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.cardTitle}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="name@company.com"
            placeholderTextColor="#64748b"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#64748b"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity style={styles.submitButton} onPress={handleAuth} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#0b1329" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isSignUp ? 'Create account' : 'Open practice home'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.switchButton} 
            onPress={() => setIsSignUp(!isSignUp)}
            disabled={loading}
          >
            <Text style={styles.switchButtonText}>
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>

          <View style={styles.legalNotice}>
            <Text style={styles.legalText}>By continuing, you agree to our </Text>
            <TouchableOpacity onPress={handleOpenTerms}>
              <Text style={styles.legalLink}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={styles.legalText}> & </Text>
            <TouchableOpacity onPress={handleOpenPrivacy}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1329',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#d4af37',
    borderWidth: 2,
    borderColor: '#d4af37',
    borderRadius: 16,
    width: 72,
    height: 72,
    textAlign: 'center',
    lineHeight: 68,
    marginBottom: 16,
    overflow: 'hidden',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  formCard: {
    backgroundColor: 'rgba(26, 35, 61, 0.8)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.1)',
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#0b1329',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  submitButton: {
    backgroundColor: '#d4af37',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#d4af37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0b1329',
  },
  switchButton: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  switchButtonText: {
    fontSize: 14,
    color: '#d4af37',
    fontWeight: '600',
  },
  legalNotice: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 10,
  },
  legalText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  legalLink: {
    fontSize: 12,
    color: '#d4af37',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
