import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { getAccessToken } from '../../services/supabaseClient';
import { API_BASE } from '../../services/apiBase';

interface PassageToken {
  text: string;
  isStressed: boolean;
  pauseType: 'none' | 'short' | 'stop';
}

interface SessionContent {
  topicTag: string;
  targetSkill: string;
  keyVocab: string[];
  passageData: PassageToken[];
  repeatPhrase: string;
  retrySentence: string;
  interviewBridgeQuestion?: string;
}

export default function SpeakScreen() {
  const [, setProfile] = useState<any>(null);
  const [content, setContent] = useState<SessionContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [scoreResult, setScoreResult] = useState<any>(null);

  async function setupClearSpeak() {
    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // 1. Fetch ClearSpeak profile. If 404, we'll create a default one
      const profRes = await fetch(`${API_BASE}/clearspeak/profile`, {
        headers,
      });

      let currentProfile = null;
      if (profRes.ok) {
        const profData = await profRes.json();
        currentProfile = profData.profile;
      } else {
        // Create default profile for the user
        const newProf = {
          role: 'General Corporate',
          level: 2,
          goal: 'Clearer articulation and professional pacing.',
          audienceContext: 'Recruiters and hiring managers',
          mainStruggle: 'vocabulary_loss',
          comfortLanguage: 'English',
          practiceDuration: 3,
        };

        const createHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          createHeaders['Authorization'] = `Bearer ${token}`;
        }

        const createRes = await fetch(`${API_BASE}/clearspeak/profile`, {
          method: 'POST',
          headers: createHeaders,
          body: JSON.stringify(newProf),
        });

        if (createRes.ok) {
          const createData = await createRes.json();
          currentProfile = createData.profile;
        }
      }

      setProfile(currentProfile);

      // 2. Generate a custom passage
      const genHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        genHeaders['Authorization'] = `Bearer ${token}`;
      }

      const genRes = await fetch(`${API_BASE}/clearspeak/generate`, {
        method: 'POST',
        headers: genHeaders,
        body: JSON.stringify({
          recentTopics: [],
          sessionAttemptLength: 0,
        }),
      });

      const genData = await genRes.json();
      if (genRes.ok && genData.content) {
        setContent(genData.content);
      } else {
        throw new Error('Failed to generate practice content.');
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert('Initialization Failed', error.message || 'Check connection.');
    } finally {
      setLoading(false);
    }
  }

  const handleStartRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone permissions are required to practice speaking.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      recordingRef.current = newRecording;
      setIsRecording(true);
      setSeconds(0);
      setScoreResult(null);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Recording Error', 'Could not initialize audio recorder.');
    }
  };

  const handleUploadAudio = useCallback(async (uri: string) => {
    setIsUploading(true);
    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const formData = new FormData();
      formData.append('audio', {
        uri,
        name: 'recording.m4a',
        type: 'audio/m4a',
      } as any);

      formData.append('content', JSON.stringify(content));
      formData.append('retryAttempted', 'false');

      const res = await fetch(`${API_BASE}/clearspeak/score`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze recording.');
      }

      setScoreResult(data.score);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Analysis Failed', error.message || 'Could not analyze voice input.');
    } finally {
      setIsUploading(false);
    }
  }, [content]);

  const handleStopRecording = useCallback(async () => {
    const activeRecording = recordingRef.current ?? recording;
    if (!activeRecording) return;

    setIsRecording(false);
    try {
      await activeRecording.stopAndUnloadAsync();
      const uri = activeRecording.getURI();
      recordingRef.current = null;
      setRecording(null);

      if (uri) {
        await handleUploadAudio(uri);
      }
    } catch (error) {
      console.error('Failed to stop recording', error);
    }
  }, [recording, handleUploadAudio]);

  useEffect(() => {
    const setupTimer = setTimeout(() => {
      void setupClearSpeak();
    }, 0);

    return () => {
      clearTimeout(setupTimer);
      const activeRecording = recordingRef.current;
      if (activeRecording) {
        activeRecording.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setSeconds((prev) => {
          if (prev >= 60) {
            void handleStopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, recording, handleStopRecording]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#d4af37" />
        <Text style={styles.loadingText}>Tailoring custom speech prompt...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
      <Text style={styles.topicBadge}>{content?.topicTag.toUpperCase()}</Text>
      <Text style={styles.title}>Practice Reading</Text>
      <Text style={styles.subtitle}>
        Read the passage below. Emphasize words in <Text style={{ color: '#d4af37', fontWeight: 'bold' }}>GOLD</Text> and respect natural punctuation marks.
      </Text>

      {content && (
        <View style={styles.passageCard}>
          <Text style={styles.targetSkill}>SKILL: {content.targetSkill}</Text>
          <View style={styles.passageTextContainer}>
            {content.passageData.map((token, idx) => (
              <Text
                key={idx}
                style={[
                  styles.tokenText,
                  token.isStressed && styles.stressedToken,
                  token.pauseType === 'stop' && styles.stopPauseToken,
                ]}
              >
                {token.text}{' '}
              </Text>
            ))}
          </View>
        </View>
      )}

      {isUploading ? (
        <View style={styles.statusBox}>
          <ActivityIndicator size="large" color="#d4af37" style={{ marginBottom: 12 }} />
          <Text style={styles.statusText}>Checking your clarity and pace...</Text>
        </View>
      ) : scoreResult ? (
        <View style={styles.resultContainer}>
          <View style={styles.metricRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricVal}>{scoreResult.composite}%</Text>
              <Text style={styles.metricLabel}>OVERALL</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricVal}>{scoreResult.clarity}%</Text>
              <Text style={styles.metricLabel}>CLARITY</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricVal}>{scoreResult.pacing}%</Text>
              <Text style={styles.metricLabel}>PACING</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricVal}>{scoreResult.rhythm}%</Text>
              <Text style={styles.metricLabel}>RHYTHM</Text>
            </View>
          </View>

          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackTitle}>Coach Feedback</Text>
            <Text style={styles.feedbackText}>{scoreResult.feedbackTip}</Text>
            <Text style={styles.wpmText}>Measured Speed: {scoreResult.measuredWpm} WPM</Text>
          </View>

          <TouchableOpacity style={styles.actionButton} onPress={setupClearSpeak}>
            <Text style={styles.actionButtonText}>Next Practice Topic</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.controls}>
          {isRecording ? (
            <View style={styles.recordingState}>
              <Text style={styles.timerText}>00:{seconds < 10 ? `0${seconds}` : seconds}</Text>
              <TouchableOpacity style={styles.stopButton} onPress={handleStopRecording}>
                <View style={styles.stopInner} />
              </TouchableOpacity>
              <Text style={styles.recordInstruction}>Tap to stop and upload</Text>
            </View>
          ) : (
            <View style={styles.idleState}>
              <TouchableOpacity style={styles.recordButton} onPress={handleStartRecording}>
                <Text style={styles.recordIcon}>🎤</Text>
              </TouchableOpacity>
              <Text style={styles.recordInstruction}>Tap to start recording</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1329',
  },
  scrollContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0b1329',
    padding: 24,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 16,
  },
  topicBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    color: '#d4af37',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: 'flex-start',
    letterSpacing: 1,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 24,
  },
  passageCard: {
    backgroundColor: '#1a233d',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 30,
  },
  targetSkill: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 1,
    marginBottom: 14,
  },
  passageTextContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    lineHeight: 28,
  },
  tokenText: {
    fontSize: 18,
    color: '#e2e8f0',
    lineHeight: 28,
  },
  stressedToken: {
    color: '#d4af37',
    fontWeight: '700',
  },
  stopPauseToken: {
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(212, 175, 55, 0.3)',
  },
  controls: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  idleState: {
    alignItems: 'center',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#d4af37',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#d4af37',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 14,
  },
  recordIcon: {
    fontSize: 32,
    color: '#0b1329',
  },
  recordingState: {
    alignItems: 'center',
  },
  timerText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#ef4444',
    marginBottom: 16,
    letterSpacing: 1,
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 2,
    borderColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  stopInner: {
    width: 32,
    height: 32,
    backgroundColor: '#ef4444',
    borderRadius: 6,
  },
  recordInstruction: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  statusBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  resultContainer: {
    width: '100%',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  metricItem: {
    flex: 1,
    backgroundColor: '#1a233d',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  metricVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  feedbackCard: {
    backgroundColor: '#1a233d',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 24,
  },
  feedbackTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#d4af37',
    marginBottom: 8,
  },
  feedbackText: {
    fontSize: 14,
    color: '#cbd5e1',
    lineHeight: 20,
  },
  wpmText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 12,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#d4af37',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0b1329',
  },
});
