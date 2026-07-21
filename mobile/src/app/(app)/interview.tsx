import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import * as mockGeminiService from '../../services/mockGeminiService';
import * as storageService from '../../services/storageService';

type InterviewPhase =
  | 'PREP'
  | 'LOADING'
  | 'ASKING'
  | 'RECORDING'
  | 'TRANSCRIBING'
  | 'REVIEW'
  | 'FEEDBACK'
  | 'REPORT';

export default function InterviewScreen() {
  const [phase, setPhase] = useState<InterviewPhase>('PREP');
  const [role, setRole] = useState('');
  const [mode, setMode] = useState<'structured' | 'conversational'>('structured');
  
  // Active session states
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [isHintLoading, setIsHintLoading] = useState(false);
  const [idealAnswer, setIdealAnswer] = useState<string | null>(null);
  const [isIdealLoading, setIsIdealLoading] = useState(false);

  // Recording states
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [seconds, setSeconds] = useState(0);

  // Session tracking
  const sessionHistory = useRef<any[]>([]);
  const [questionNumber, setQuestionNumber] = useState(1);
  const totalQuestions = 5;
  const router = useRouter();

  // Report states
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, [recording]);

  useEffect(() => {
    let interval: any;
    if (phase === 'RECORDING') {
      interval = setInterval(() => {
        setSeconds((prev) => {
          if (prev >= 60) {
            handleStopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  // The timer should reset only when the recording phase changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleStartInterview = async () => {
    if (!role.trim()) {
      Alert.alert('Required Field', 'Please enter a target role.');
      return;
    }

    setPhase('LOADING');
    try {
      const context = {
        candidateRole: role.trim(),
        intentText: `Practice interview for ${role.trim()}`,
        selectedPanelIDs: ['p1'],
        sessionType: mode,
        deliveryMode: 'exam', reasoningMode: 'classic_behavioral',
      };

      const result = await mockGeminiService.startInterviewSession(context);
      setSessionId(result.sessionId);
      setCurrentQuestion(result.firstQuestion.question);
      setPendingQuestionId(result.firstQuestion.id || 'q1');
      setQuestionNumber(1);
      sessionHistory.current = [];
      await storageService.trackQuestionUsage(result.firstQuestion.question, role.trim());
      setPhase('ASKING');
    } catch (error: any) {
      console.error(error);
      Alert.alert('Failed to Start', error.message || 'Could not reach backend.');
      setPhase('PREP');
    }
  };

  const handleStartRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone permissions are needed to record responses.');
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
      setSeconds(0);
      setPhase('RECORDING');
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Recording Error', 'Could not initialize microphone.');
    }
  };

  async function handleStopRecording() {
    if (!recording) return;

    setPhase('TRANSCRIBING');
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        const transcript = await mockGeminiService.transcribeAudio(uri, 'audio/m4a');
        setResponse(transcript);
      }
      setPhase('REVIEW');
    } catch (error) {
      console.error('Failed to stop recording', error);
      setPhase('ASKING');
    }
  }

  const handleRequestHint = async () => {
    if (!currentQuestion || isHintLoading) return;
    setIsHintLoading(true);
    try {
      const nudge = await mockGeminiService.getHintForQuestion(currentQuestion);
      setHint(nudge);
    } catch {
      setHint('Focus on the primary technical metrics of your achievements.');
    } finally {
      setIsHintLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!response.trim()) {
      Alert.alert('Response Required', 'Please record or type an answer before submitting.');
      return;
    }

    setPhase('FEEDBACK');
    setIsIdealLoading(true);
    setIdealAnswer(null);

    // Save turn in history
    sessionHistory.current.push({
      interviewer: 'Interviewer Panel',
      question: currentQuestion,
      candidateResponse: response,
    });

    try {
      const ideal = await mockGeminiService.generateIdealAnswer(currentQuestion!, null, response);
      setIdealAnswer(ideal);
    } catch {
      setIdealAnswer('Great job practicing! Keep focus on structured STAR patterns (Situation, Task, Action, Result).');
    } finally {
      setIsIdealLoading(false);
    }
  };

  const handleNextQuestion = async () => {
    if (questionNumber >= totalQuestions) {
      handleGenerateReport();
      return;
    }

    setPhase('LOADING');
    setResponse('');
    setHint(null);

    try {
      const result = await mockGeminiService.submitAnswerAndGetNext(
        sessionId || 's1',
        pendingQuestionId || 'q1',
        sessionHistory.current[sessionHistory.current.length - 1].candidateResponse
      );

      if (result.isLastQuestion || !result.nextQuestion) {
        handleGenerateReport();
      } else {
        setQuestionNumber((current) => current + 1);
        setCurrentQuestion(result.nextQuestion.question);
        setPendingQuestionId(result.nextQuestion.id || 'q' + (questionNumber + 1));
        await storageService.trackQuestionUsage(result.nextQuestion.question, role);
        setPhase('ASKING');
      }
    } catch {
      handleGenerateReport();
    }
  };

  const handleGenerateReport = async () => {
    setPhase('LOADING');
    try {
      if (!sessionId) throw new Error("No active session");
      
      const results = await mockGeminiService.generateFinalReport(sessionId);
      await storageService.saveSessionToHistory(results, role, mode);
      setReport(results);
      setPhase('REPORT');
    } catch (error) {
      console.error(error);
      Alert.alert('Report Error', 'Could not generate report card.');
      router.replace('/(app)');
    }
  };

  const handleSkipQuestion = () => {
    sessionHistory.current.push({
      interviewer: 'Interviewer Panel',
      question: currentQuestion,
      candidateResponse: '[SKIPPED]',
    });
    handleNextQuestion();
  };

  if (phase === 'LOADING') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#d4af37" />
        <Text style={styles.loadingText}>Connecting to interviewer panel...</Text>
      </View>
    );
  }

  if (phase === 'PREP') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>Practice Room</Text>
        <Text style={styles.subtitle}>Set up a calm practice session for your target role.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>What role are you practicing for?</Text>
          <TextInput
            style={styles.input}
            value={role}
            onChangeText={setRole}
            placeholder="e.g. Senior Software Engineer"
            placeholderTextColor="#64748b"
          />

          <Text style={styles.label}>Practice Mode</Text>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'structured' && styles.modeButtonActive]}
              onPress={() => setMode('structured')}
            >
              <Text style={[styles.modeText, mode === 'structured' && styles.modeTextActive]}>
                STRUCTURED
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'conversational' && styles.modeButtonActive]}
              onPress={() => setMode('conversational')}
            >
              <Text style={[styles.modeText, mode === 'conversational' && styles.modeTextActive]}>
                CONVERSATIONAL
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={handleStartInterview}>
            <Text style={styles.submitButtonText}>Start interview practice</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (phase === 'ASKING') {
    return (
      <View style={styles.container}>
        <View style={styles.askHeader}>
          <Text style={styles.headerTitle}>Active Simulation</Text>
          <Text style={styles.headerProgress}>
            Question {questionNumber} of {totalQuestions}
          </Text>
        </View>

        <ScrollView style={styles.askScroll} contentContainerStyle={styles.askContent}>
          <View style={styles.questionPanel}>
            <Text style={styles.questionQuote}>“</Text>
            <Text style={styles.questionText}>{currentQuestion}</Text>
          </View>

          {hint && (
            <View style={styles.hintBox}>
              <Text style={styles.hintTitle}>Helpful hint</Text>
              <Text style={styles.hintText}>{hint}</Text>
            </View>
          )}

          <View style={styles.recordPanel}>
            <TouchableOpacity style={styles.micButton} onPress={handleStartRecording}>
              <Text style={styles.micIcon}>🎤</Text>
            </TouchableOpacity>
            <Text style={styles.micLabel}>Tap to answer with your voice</Text>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.hLine} />
            <Text style={styles.dividerOr}>OR</Text>
            <View style={styles.hLine} />
          </View>

          <TouchableOpacity
            style={styles.keyboardButton}
            onPress={() => {
              setResponse('');
              setPhase('REVIEW');
            }}
          >
            <Text style={styles.keyboardButtonText}>Type response instead</Text>
          </TouchableOpacity>

          <View style={styles.actionNavRow}>
            <TouchableOpacity style={styles.navTextBtn} onPress={handleRequestHint}>
              <Text style={styles.navTextBtnVal}>Need a Hint?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navTextBtn} onPress={handleSkipQuestion}>
              <Text style={[styles.navTextBtnVal, { color: '#94a3b8' }]}>Skip</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (phase === 'RECORDING') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.recordingTimer}>00:{seconds < 10 ? `0${seconds}` : seconds}</Text>
        <TouchableOpacity style={styles.stopMicButton} onPress={handleStopRecording}>
          <View style={styles.stopMicInner} />
        </TouchableOpacity>
        <Text style={styles.recordingLabel}>Microphone is active. Speak clearly.</Text>
      </View>
    );
  }

  if (phase === 'TRANSCRIBING') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#d4af37" />
        <Text style={styles.loadingText}>Transcribing your answer...</Text>
      </View>
    );
  }

  if (phase === 'REVIEW') {
    return (
      <KeyboardAvoidingWrapper>
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
          <Text style={styles.title}>Verify Answer</Text>
          <Text style={styles.subtitle}>Review or edit the text transcript before submitting.</Text>

          <View style={styles.card}>
            <TextInput
              style={styles.responseEditor}
              value={response}
              onChangeText={setResponse}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              placeholder="Type your response here..."
              placeholderTextColor="#64748b"
            />

            <TouchableOpacity style={styles.submitButton} onPress={handleSubmitAnswer}>
              <Text style={styles.submitButtonText}>Submit Response</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.reRecordButton} onPress={() => setPhase('ASKING')}>
              <Text style={styles.reRecordButtonText}>Cancel & Record Again</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingWrapper>
    );
  }

  if (phase === 'FEEDBACK') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>Practice feedback</Text>
        <Text style={styles.subtitle}>Review a sample ideal response for this interview prompt.</Text>

        <View style={[styles.card, { borderColor: 'rgba(212, 175, 55, 0.2)' }]}>
          <Text style={styles.cardSectionLabel}>Sample Answer</Text>
          {isIdealLoading ? (
            <ActivityIndicator color="#d4af37" style={{ marginVertical: 20 }} />
          ) : (
            <Text style={styles.idealText}>{idealAnswer}</Text>
          )}

          <TouchableOpacity style={styles.submitButton} onPress={handleNextQuestion}>
            <Text style={styles.submitButtonText}>
              {questionNumber >= totalQuestions ? 'Finish and Score' : 'Next Question'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (phase === 'REPORT' && report) {
    // Phase 6: Result Truthfulness - Never display fabricated scores
    const score = report.simplifiedScore ?? report.quantitativeAnalysis?.dimension_scores?.[0]?.normalized_score;
    const hasValidScore = score !== undefined && score !== null;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>Practice Scorecard</Text>
        <Text style={styles.subtitle}>Clear feedback on your interview practice.</Text>

        <View style={styles.reportHeader}>
          {hasValidScore ? (
            <View style={styles.scoreCircle}>
              <Text style={styles.scoreCircleText}>{score}%</Text>
              <Text style={styles.scoreCircleLabel}>SCORE</Text>
            </View>
          ) : (
            <View style={[styles.scoreCircle, { backgroundColor: '#334155', borderColor: '#475569' }]}>
              <Text style={[styles.scoreCircleText, { color: '#94a3b8', fontSize: 18 }]}>N/A</Text>
              <Text style={styles.scoreCircleLabel}>INCOMPLETE</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Key Strengths</Text>
          {report.analysis?.strengths?.map((item: string, idx: number) => (
            <View key={idx} style={styles.bulletItem}>
              <Text style={[styles.bulletSymbol, { color: '#10b981' }]}>✓</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          )) || (
            <Text style={styles.bulletText}>Strong technical articulation identified.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Areas to Improve</Text>
          {report.analysis?.improvements?.map((item: string, idx: number) => (
            <View key={idx} style={styles.bulletItem}>
              <Text style={[styles.bulletSymbol, { color: '#ef4444' }]}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          )) || (
            <Text style={styles.bulletText}>Work on conciseness and STAR metrics alignment.</Text>
          )}
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={() => router.replace('/(app)')}>
          <Text style={styles.submitButtonText}>Return to practice home</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return null;
}

// Simple wrapper helper for keyboard avoiding behavior
const KeyboardAvoidingWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1329' }}>
    {children}
  </SafeAreaView>
);

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
  card: {
    backgroundColor: '#1a233d',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  modeButton: {
    flex: 1,
    backgroundColor: '#0b1329',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  modeButtonActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderColor: '#d4af37',
  },
  modeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  modeTextActive: {
    color: '#d4af37',
  },
  submitButton: {
    backgroundColor: '#d4af37',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0b1329',
  },
  askHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  headerProgress: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  askScroll: {
    flex: 1,
  },
  askContent: {
    padding: 24,
    alignItems: 'center',
  },
  questionPanel: {
    backgroundColor: '#1a233d',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  questionQuote: {
    fontSize: 48,
    fontWeight: '800',
    color: '#d4af37',
    lineHeight: 48,
    marginTop: -10,
    marginBottom: -10,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 26,
    textAlign: 'center',
  },
  hintBox: {
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
    borderLeftWidth: 3,
    borderLeftColor: '#d4af37',
    padding: 16,
    borderRadius: 8,
    width: '100%',
    marginBottom: 24,
  },
  hintTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#d4af37',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  hintText: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  recordPanel: {
    alignItems: 'center',
    marginVertical: 20,
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#d4af37',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#d4af37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 12,
  },
  micIcon: {
    fontSize: 28,
    color: '#0b1329',
  },
  micLabel: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '80%',
    marginVertical: 20,
  },
  hLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dividerOr: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    marginHorizontal: 12,
  },
  keyboardButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  keyboardButtonText: {
    fontSize: 13,
    color: '#cbd5e1',
    fontWeight: '700',
  },
  actionNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
  },
  navTextBtn: {
    paddingVertical: 8,
  },
  navTextBtnVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d4af37',
  },
  recordingTimer: {
    fontSize: 48,
    fontWeight: '800',
    color: '#ef4444',
    marginBottom: 24,
  },
  stopMicButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 2,
    borderColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  stopMicInner: {
    width: 28,
    height: 28,
    backgroundColor: '#ef4444',
    borderRadius: 6,
  },
  recordingLabel: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  responseEditor: {
    backgroundColor: '#0b1329',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    color: '#ffffff',
    fontSize: 16,
    height: 160,
    marginBottom: 20,
  },
  reRecordButton: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  reRecordButtonText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  cardSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#d4af37',
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  idealText: {
    fontSize: 15,
    color: '#cbd5e1',
    lineHeight: 22,
    marginBottom: 24,
  },
  reportHeader: {
    alignItems: 'center',
    marginVertical: 20,
  },
  scoreCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 4,
    borderColor: '#d4af37',
    backgroundColor: '#1a233d',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#d4af37',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  scoreCircleText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
  },
  scoreCircleLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
    marginTop: 2,
  },
  cardSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 14,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  bulletSymbol: {
    fontSize: 15,
    fontWeight: '800',
    marginRight: 8,
    lineHeight: 18,
  },
  bulletText: {
    fontSize: 14,
    color: '#cbd5e1',
    flex: 1,
    lineHeight: 20,
  },
});
