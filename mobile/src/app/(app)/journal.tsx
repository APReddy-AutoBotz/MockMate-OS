import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { clearAllHistory, getSessionHistory, SessionHistoryRecord } from '../../services/storageService';

export default function JournalScreen() {
  const [historyList, setHistoryList] = useState<SessionHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    getSessionHistory()
      .then((data) => {
        if (mounted) setHistoryList(data);
      })
      .catch((error) => console.error(error))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleClearHistory = () => {
    Alert.alert('Clear History', 'Are you sure you want to delete all practice records? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          await clearAllHistory();
          setHistoryList([]);
          Alert.alert('Cleared', 'Your practice journal has been cleared.');
        },
      },
    ]);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#d4af37" />
        <Text style={styles.loadingText}>Reading practice journal...</Text>
      </View>
    );
  }

  if (selectedReport) {
    const report = selectedReport;
    const score = report.overallScore ?? report.score ?? null;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedReport(null)}>
          <Text style={styles.backBtnText}>Back to journal</Text>
        </TouchableOpacity>

        <View style={styles.reportHeader}>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreCircleText}>{score != null ? `${score}%` : 'INCOMPLETE'}</Text>
            <Text style={styles.scoreCircleLabel}>SCORE</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Key Strengths</Text>
          {report.analysis?.strengths?.map((item: string, idx: number) => (
            <View key={idx} style={styles.bulletItem}>
              <Text style={[styles.bulletSymbol, { color: '#10b981' }]}>✓</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          )) || (
            <Text style={styles.bulletText}>No evaluated strengths available.</Text>
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
            <Text style={styles.bulletText}>No evaluated improvement areas available.</Text>
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Practice Journal</Text>
          <Text style={styles.subtitle}>Review your historical scores and performance growth.</Text>
        </View>
        {historyList.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearHistory}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {historyList.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>-</Text>
          <Text style={styles.emptyTitle}>No practice saved yet</Text>
          <Text style={styles.emptyDesc}>
            Complete an interview practice session to save your first report.
          </Text>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/(app)/interview')}
          >
            <Text style={styles.actionBtnText}>Start interview practice</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.historyList}>
          {historyList.map((record) => (
            <TouchableOpacity
              key={record.id}
              style={styles.historyItem}
              onPress={() => setSelectedReport(record.fullReport)}
            >
              <View style={styles.historyItemMain}>
                <Text style={styles.historyRole}>{record.role}</Text>
                <Text style={styles.historyDate}>{formatDate(record.timestamp)}</Text>
                <View style={styles.metaRow}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{record.sessionType.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.riskText} numberOfLines={1}>
                    Risk: {record.biggestRisk}
                  </Text>
                </View>
              </View>
              <View style={styles.historyScoreBox}>
                <Text style={styles.historyScoreVal}>{record.avgScore != null ? `${record.avgScore}%` : 'N/A'}</Text>
                <Text style={styles.historyScoreLbl}>AVG SCORE</Text>
              </View>
            </TouchableOpacity>
          ))}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
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
    maxWidth: '85%',
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  clearBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#1a233d',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 20,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  actionBtn: {
    backgroundColor: '#d4af37',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0b1329',
  },
  historyList: {
    gap: 14,
  },
  historyItem: {
    backgroundColor: '#1a233d',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  historyItemMain: {
    flex: 1,
    paddingRight: 12,
  },
  historyRole: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  historyDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  typeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#d4af37',
    letterSpacing: 0.5,
  },
  riskText: {
    fontSize: 11,
    color: '#64748b',
    flex: 1,
  },
  historyScoreBox: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.06)',
    paddingLeft: 12,
  },
  historyScoreVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#d4af37',
  },
  historyScoreLbl: {
    fontSize: 8,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  backBtn: {
    marginBottom: 20,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  backBtnText: {
    color: '#d4af37',
    fontSize: 14,
    fontWeight: '700',
  },
  reportHeader: {
    alignItems: 'center',
    marginVertical: 20,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#d4af37',
    backgroundColor: '#1a233d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreCircleText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
  },
  scoreCircleLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
    marginTop: 2,
  },
  card: {
    backgroundColor: '#1a233d',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
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
