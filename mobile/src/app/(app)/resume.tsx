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
import {
  GovernedResumeScoreResponseSchema,
  ResumeParseResponseSchema,
  type GovernedResumeScoreResponse,
} from 'mockmate-shared/resume-integrity';
import { apiClient } from '../../services/apiClient';

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const resumeMimeFor = (file: DocumentPicker.DocumentPickerAsset): string => {
  if (file.mimeType === 'application/pdf' || file.mimeType === DOCX_MIME) return file.mimeType;
  return file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : DOCX_MIME;
};

export default function ResumeScreen() {
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [jdText, setJdText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<GovernedResumeScoreResponse | null>(null);

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', DOCX_MIME],
        copyToCacheDirectory: true,
      });
      const picked = !result.canceled ? result.assets?.[0] : undefined;
      if (!picked) return;
      if (picked.size != null && picked.size > MAX_RESUME_BYTES) {
        Alert.alert('File Too Large', 'Choose a PDF or DOCX smaller than 10 MB.');
        return;
      }
      setFile(picked);
      setReport(null);
    } catch {
      Alert.alert('Error', 'Failed to pick document.');
    }
  };

  const handleReview = async () => {
    if (!file) {
      Alert.alert('Document Required', 'Please select a resume file first.');
      return;
    }
    if (file.size != null && file.size > MAX_RESUME_BYTES) {
      Alert.alert('File Too Large', 'Choose a PDF or DOCX smaller than 10 MB.');
      return;
    }

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('resume', {
        uri: file.uri,
        name: file.name,
        type: resumeMimeFor(file),
      } as any);

      // rawText deliberately remains a local hand-off value. It is not retained
      // in React state after the governed score request completes.
      const parsed = await apiClient.post('/resume/parse', ResumeParseResponseSchema, formData);
      const targetJd = jdText.trim();
      const score = await apiClient.post('/resume/score', GovernedResumeScoreResponseSchema, {
        resumeData: parsed.resumeData,
        rawText: parsed.rawText,
        ...(targetJd ? { jdText: targetJd } : {}),
      });
      setReport(score);
    } catch (error: any) {
      Alert.alert('Analysis Failed', error?.message || 'Resume review is unavailable.');
    } finally {
      setIsProcessing(false);
    }
  };

  const missingSkills = report?.jdMatch
    ? Array.from(new Set([
        ...report.jdMatch.deterministicMissingSkills,
        ...report.jdMatch.llmMissingHardSkills,
        ...report.jdMatch.llmMissingSoftSkills,
      ]))
    : [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
      <Text style={styles.title}>ATS Resume Review</Text>
      <Text style={styles.subtitle}>
        Governed ATS diagnostics and optional job-description matching. No score is invented when coverage is insufficient.
      </Text>

      {!report ? (
        <View style={styles.card}>
          <TouchableOpacity style={styles.pickerBox} onPress={handlePickDocument} disabled={isProcessing}>
            {file ? (
              <View style={styles.fileSelected}>
                <Text style={styles.fileIcon}>📄</Text>
                <Text style={styles.fileName}>{file.name}</Text>
                <Text style={styles.fileSize}>{file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'PDF or DOCX'}</Text>
              </View>
            ) : (
              <View style={styles.pickerInner}>
                <Text style={styles.pickerIcon}>⬆️</Text>
                <Text style={styles.pickerTitle}>Select Resume File</Text>
                <Text style={styles.pickerDesc}>PDF or DOCX · Max 10 MB</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>Target Job Description (Optional)</Text>
          <TextInput
            style={styles.textArea}
            value={jdText}
            onChangeText={setJdText}
            placeholder="Paste the target job description for governed match evidence..."
            placeholderTextColor="#64748b"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            editable={!isProcessing}
          />

          <TouchableOpacity
            style={[styles.submitButton, isProcessing && styles.submitButtonDisabled]}
            onPress={handleReview}
            disabled={isProcessing}
          >
            {isProcessing ? <ActivityIndicator color="#0b1329" /> : <Text style={styles.submitButtonText}>Review My Resume</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.reportContainer}>
          <View style={styles.scoreHeader}>
            <View style={styles.scoreRing}>
              <Text style={styles.scoreNumber}>{report.atsDiagnostics.score}%</Text>
              <Text style={styles.scoreLabel}>ATS DIAGNOSTIC</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>High-confidence issues</Text>
            {report.atsDiagnostics.highConfidenceIssues.length ? report.atsDiagnostics.highConfidenceIssues.map(item => (
              <View key={item.id} style={styles.bulletItem}>
                <Text style={styles.issueBullet}>•</Text>
                <Text style={styles.bulletText}>{item.message}</Text>
              </View>
            )) : <Text style={styles.noDataText}>No high-confidence ATS issues were detected.</Text>}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Possible risks</Text>
            {report.atsDiagnostics.possibleRiskIssues.length ? report.atsDiagnostics.possibleRiskIssues.map(item => (
              <View key={item.id} style={styles.bulletItem}>
                <Text style={styles.riskBullet}>•</Text>
                <Text style={styles.bulletText}>{item.message}</Text>
              </View>
            )) : <Text style={styles.noDataText}>No additional ATS risks were identified.</Text>}
          </View>

          {report.jdMatch && (
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>Job-description match</Text>
              <Text style={styles.jdScore}>
                {report.jdMatch.scoreStatus === 'scored' && report.jdMatch.jdMatchScore != null
                  ? `${report.jdMatch.jdMatchScore}%`
                  : 'No score'}
              </Text>
              {report.jdMatch.scoreStatus === 'insufficient_coverage' && (
                <Text style={styles.coverageNote}>Not enough reliable requirement coverage to calculate a match score.</Text>
              )}
              <Text style={styles.subheading}>Matched evidence</Text>
              {report.jdMatch.matchedSkills.length ? report.jdMatch.matchedSkills.map(skill => (
                <Text key={`matched-${skill}`} style={styles.skillText}>✓ {skill}</Text>
              )) : <Text style={styles.noDataText}>No deterministic matches identified.</Text>}
              <Text style={styles.subheading}>Missing / uncovered requirements</Text>
              {missingSkills.length ? missingSkills.map(skill => (
                <Text key={`missing-${skill}`} style={styles.skillText}>• {skill}</Text>
              )) : <Text style={styles.noDataText}>No grounded missing requirements identified.</Text>}
            </View>
          )}

          <TouchableOpacity style={styles.resetButton} onPress={() => setReport(null)}>
            <Text style={styles.resetButtonText}>Analyze Another Resume</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1329' },
  scrollContainer: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', color: '#ffffff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#94a3b8', lineHeight: 20, marginBottom: 24 },
  card: { backgroundColor: '#1a233d', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  pickerBox: { backgroundColor: '#0b1329', borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(212,175,55,0.3)', height: 150, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  pickerInner: { alignItems: 'center' },
  pickerIcon: { fontSize: 28, marginBottom: 8 },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  pickerDesc: { fontSize: 12, color: '#64748b', marginTop: 4 },
  fileSelected: { alignItems: 'center', paddingHorizontal: 20 },
  fileIcon: { fontSize: 32, marginBottom: 6 },
  fileName: { fontSize: 14, fontWeight: '700', color: '#ffffff', textAlign: 'center' },
  fileSize: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  textArea: { backgroundColor: '#0b1329', borderRadius: 12, padding: 16, minHeight: 130, fontSize: 15, color: '#ffffff', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 20 },
  submitButton: { backgroundColor: '#d4af37', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontSize: 15, fontWeight: '700', color: '#0b1329' },
  reportContainer: { width: '100%' },
  scoreHeader: { alignItems: 'center', marginBottom: 24 },
  scoreRing: { width: 132, height: 132, borderRadius: 66, borderWidth: 4, borderColor: '#d4af37', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a233d' },
  scoreNumber: { fontSize: 30, fontWeight: '800', color: '#ffffff' },
  scoreLabel: { fontSize: 9, fontWeight: '700', color: '#94a3b8', marginTop: 2, letterSpacing: 0.8 },
  cardSectionTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 14 },
  bulletItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  issueBullet: { fontSize: 14, color: '#ef4444', marginRight: 8, lineHeight: 18 },
  riskBullet: { fontSize: 14, color: '#f59e0b', marginRight: 8, lineHeight: 18 },
  bulletText: { fontSize: 14, color: '#cbd5e1', flex: 1, lineHeight: 20 },
  noDataText: { color: '#94a3b8', fontStyle: 'italic', fontSize: 13, lineHeight: 19 },
  jdScore: { fontSize: 28, fontWeight: '800', color: '#d4af37', marginBottom: 8 },
  coverageNote: { color: '#cbd5e1', fontSize: 13, lineHeight: 19, marginBottom: 14 },
  subheading: { color: '#ffffff', fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  skillText: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  resetButton: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  resetButtonText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
});
