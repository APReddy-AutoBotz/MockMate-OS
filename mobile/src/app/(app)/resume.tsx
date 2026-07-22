import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { getAccessToken } from '../../services/supabaseClient';
import { API_BASE } from '../../services/apiBase';

export default function ResumeScreen() {
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [jdText, setJdText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<any>(null);

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setFile(result.assets[0]);
        setReport(null);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to pick document.');
    }
  };

  const handleReview = async () => {
    if (!file) {
      Alert.alert('Document Required', 'Please select a resume file first.');
      return;
    }

    setIsProcessing(true);
    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const formData = new FormData();
      formData.append('resume', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/octet-stream',
      } as any);

      const parseRes = await fetch(`${API_BASE}/resume/parse`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const parseData = await parseRes.json();
      if (!parseRes.ok || !parseData.success) {
        throw new Error(parseData.error || 'Failed to parse resume.');
      }

      const scoreHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        scoreHeaders['Authorization'] = `Bearer ${token}`;
      }

      const scoreRes = await fetch(`${API_BASE}/resume/score`, {
        method: 'POST',
        headers: scoreHeaders,
        body: JSON.stringify({
          resumeData: parseData.resumeData,
          rawText: parseData.rawText,
          jdText,
        }),
      });

      const scoreData = await scoreRes.json();
      if (!scoreRes.ok || !scoreData.success) {
        throw new Error(scoreData.error || 'Failed to review resume.');
      }

      setReport(scoreData);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Analysis Failed', error.message || 'An error occurred during parsing.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
      <Text style={styles.title}>ATS Optimization</Text>
      <Text style={styles.subtitle}>Scan your resume for ATS match and receive instant suggestions.</Text>

      {!report ? (
        <View style={styles.card}>
          <TouchableOpacity style={styles.pickerBox} onPress={handlePickDocument}>
            {file ? (
              <View style={styles.fileSelected}>
                <Text style={styles.fileIcon}>📄</Text>
                <Text style={styles.fileName}>{file.name}</Text>
                <Text style={styles.fileSize}>
                  {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.pickerInner}>
                <Text style={styles.pickerIcon}>⬆️</Text>
                <Text style={styles.pickerTitle}>Select Resume File</Text>
                <Text style={styles.pickerDesc}>PDF or DOCX, Max 10MB</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>Target Job Description (Optional)</Text>
          <TextInput
            style={styles.textArea}
            value={jdText}
            onChangeText={setJdText}
            placeholder="Paste the target job description to verify compatibility..."
            placeholderTextColor="#64748b"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.submitButton, isProcessing && styles.submitButtonDisabled]}
            onPress={handleReview}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#0b1329" />
            ) : (
              <Text style={styles.submitButtonText}>Review My Resume</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.reportContainer}>
          <View style={styles.scoreHeader}>
            <View style={styles.scoreRing}>
              <Text style={styles.scoreNumber}>
                {(report.score ?? report.overallScore) != null ? `${report.score ?? report.overallScore}%` : 'INCOMPLETE'}
              </Text>
              <Text style={styles.scoreLabel}>ATS SCORE</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Key Findings</Text>
            {report.analysis?.findings?.map((item: string, idx: number) => (
              <View key={idx} style={styles.bulletItem}>
                <Text style={styles.bulletSymbol}>•</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            )) || (
              <Text style={styles.noDataText}>ATS findings unavailable.</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Recommended Actions</Text>
            {report.analysis?.suggestions?.map((item: string, idx: number) => (
              <View key={idx} style={styles.bulletItem}>
                <Text style={[styles.bulletSymbol, { color: '#d4af37' }]}>→</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            )) || (
              <Text style={styles.noDataText}>Recommended actions unavailable.</Text>
            )}
          </View>

          <TouchableOpacity style={styles.resetButton} onPress={() => setReport(null)}>
            <Text style={styles.resetButtonText}>Analyze Another Resume</Text>
          </TouchableOpacity>
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
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
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
  pickerBox: {
    backgroundColor: '#0b1329',
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(212, 175, 55, 0.3)',
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  pickerInner: {
    alignItems: 'center',
  },
  pickerIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  pickerDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  fileSelected: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  fileIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  fileSize: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textArea: {
    backgroundColor: '#0b1329',
    borderRadius: 12,
    padding: 16,
    height: 120,
    fontSize: 15,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#d4af37',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0b1329',
  },
  reportContainer: {
    width: '100%',
  },
  scoreHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  scoreRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#d4af37',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a233d',
  },
  scoreNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 2,
    letterSpacing: 1,
  },
  cardSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 14,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  bulletSymbol: {
    fontSize: 14,
    color: '#ef4444',
    marginRight: 8,
    lineHeight: 18,
  },
  bulletText: {
    fontSize: 14,
    color: '#cbd5e1',
    flex: 1,
    lineHeight: 20,
  },
  noDataText: {
    color: '#94a3b8',
    fontStyle: 'italic',
    fontSize: 13,
  },
  resetButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
