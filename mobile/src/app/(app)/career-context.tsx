import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CareerContextGetResponseSchema,
  CareerContextItemDecisionRequestSchema,
  CareerContextItemDecisionResponseSchema,
  CareerContextPreferenceRequestSchema,
  CareerContextPreferenceResponseSchema,
  CareerContextRebuildResponseSchema,
  type CareerContextGetResponse,
  type CareerContextItem,
} from 'mockmate-shared';
import { apiClient, ApiError } from '../../services/apiClient';

type ContextState = CareerContextGetResponse;
type Decision = 'confirm' | 'reject' | 'revoke';

function valueLabel(item: CareerContextItem): string {
  switch (item.value.type) {
    case 'text':
      return item.value.text;
    case 'string_list':
      return item.value.values.join(', ');
    case 'metric':
      return `${item.value.metric}: ${item.value.value}${item.value.scale ? ` ${item.value.scale}` : ''}`;
    case 'evidence':
      return item.value.summary;
    default:
      return 'Authoritative career fact';
  }
}

function sourceLabel(item: CareerContextItem): string {
  const moduleName = item.source.module.replace(/_/g, ' ');
  return `${moduleName} · ${item.provenance.replace(/_/g, ' ')}`;
}

export default function CareerContextScreen() {
  const [context, setContext] = useState<ContextState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorText, setErrorText] = useState('');

  const loadContext = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const response = await apiClient.get('/career-context', CareerContextGetResponseSchema);
      setContext(response);
      setErrorText('');
    } catch (error: any) {
      setErrorText(error?.message || 'Career Context is unavailable.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadContext(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [loadContext]);

  const reloadAfterConflict = useCallback(async (message: string) => {
    setErrorText(message);
    await loadContext(false);
  }, [loadContext]);

  const rebuild = async () => {
    if (busyKey) return;
    setBusyKey('rebuild');
    try {
      await apiClient.post('/career-context/rebuild', CareerContextRebuildResponseSchema, {});
      await loadContext(false);
    } catch (error: any) {
      setErrorText(error?.message || 'Career Context rebuild failed.');
    } finally {
      setBusyKey(null);
    }
  };

  const togglePersonalization = async () => {
    if (!context || busyKey) return;
    const next = !context.state.personalizationEnabled;
    setBusyKey('preference');
    try {
      const payload = CareerContextPreferenceRequestSchema.parse({
        personalizationEnabled: next,
        expectedContextVersion: context.state.contextVersion,
      });
      const response = await apiClient.post('/career-context/preference', CareerContextPreferenceResponseSchema, payload);
      setContext((current) => current ? { ...current, state: response.state } : current);
      await loadContext(false);
    } catch (error: any) {
      if (error instanceof ApiError && error.status === 409) {
        await reloadAfterConflict('Career Context changed on another surface. The latest authoritative state has been reloaded.');
      } else {
        setErrorText(error?.message || 'Could not update personalization preference.');
      }
    } finally {
      setBusyKey(null);
    }
  };

  const decideItem = async (item: CareerContextItem, decision: Decision) => {
    if (!context || busyKey) return;
    const key = `${decision}:${item.id}`;
    setBusyKey(key);
    try {
      const payload = CareerContextItemDecisionRequestSchema.parse({
        decision,
        expectedContextVersion: context.state.contextVersion,
      });
      await apiClient.post(
        `/career-context/items/${item.id}/decision`,
        CareerContextItemDecisionResponseSchema,
        payload,
      );
      await loadContext(false);
    } catch (error: any) {
      if (error instanceof ApiError && error.status === 409) {
        await reloadAfterConflict('This fact changed before your decision reached the server. The latest authoritative state has been reloaded.');
      } else {
        setErrorText(error?.message || 'Could not apply the Career Context decision.');
      }
    } finally {
      setBusyKey(null);
    }
  };

  const pendingCount = context?.pendingItems.length ?? 0;
  const activeCount = context?.activeItems.length ?? 0;
  const conflictCount = context?.conflicts.length ?? 0;
  const eligibleGroundingCount = useMemo(
    () => context?.activeItems.filter((item) => item.sensitivity !== 'personal_contact' && ['resume', 'clearspeak'].includes(item.source.module)).length ?? 0,
    [context],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#d4af37" />
        <Text style={styles.muted}>Loading authoritative Career Context…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Career Context</Text>
      <Text style={styles.subtitle}>
        These are the career facts MockMate may reuse across Resume, ClearSpeak and Interview. You control confirmation and personalization; mobile never invents grounding facts.
      </Text>

      {errorText ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorText}</Text>
          <TouchableOpacity style={styles.smallButton} onPress={() => void loadContext(true)}>
            <Text style={styles.smallButtonText}>Reload authoritative state</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {context ? (
        <>
          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryNumber}>{activeCount}</Text>
                <Text style={styles.summaryLabel}>Active</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryNumber}>{pendingCount}</Text>
                <Text style={styles.summaryLabel}>Pending</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryNumber}>{conflictCount}</Text>
                <Text style={styles.summaryLabel}>Conflicts</Text>
              </View>
            </View>
            <Text style={styles.versionText}>Authoritative context version {context.state.contextVersion}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Personalization</Text>
            <Text style={styles.bodyText}>
              {context.state.personalizationEnabled
                ? 'Enabled. You may explicitly create one-time grounded practice from eligible confirmed facts.'
                : 'Disabled. Career Context remains reviewable, but grounded practice is blocked.'}
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, busyKey === 'preference' && styles.disabled]}
              disabled={Boolean(busyKey)}
              onPress={() => void togglePersonalization()}
            >
              {busyKey === 'preference'
                ? <ActivityIndicator color="#0b1329" />
                : <Text style={styles.primaryButtonText}>{context.state.personalizationEnabled ? 'Disable personalization' : 'Enable personalization'}</Text>}
            </TouchableOpacity>
            <Text style={styles.footnote}>{eligibleGroundingCount} active Resume/ClearSpeak fact(s) currently eligible for explicit grounding selection.</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Refresh from saved work</Text>
                <Text style={styles.bodyText}>Rebuild reads server-authoritative Resume, ClearSpeak and completed Interview sources. It does not use unsaved local guesses.</Text>
              </View>
              <TouchableOpacity style={styles.smallButton} disabled={Boolean(busyKey)} onPress={() => void rebuild()}>
                {busyKey === 'rebuild' ? <ActivityIndicator color="#d4af37" /> : <Text style={styles.smallButtonText}>Rebuild</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {context.conflicts.length > 0 ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>Grounding conflicts need review</Text>
              <Text style={styles.bodyText}>Grounded mobile Interview remains blocked while authoritative conflicts are unresolved. MockMate will not choose a winner on your behalf.</Text>
              {context.conflicts.map((conflict) => (
                <View key={conflict.canonicalKey} style={styles.conflictItem}>
                  <Text style={styles.itemTitle}>{conflict.canonicalKey}</Text>
                  {conflict.descriptions.map((description, index) => (
                    <Text key={`${conflict.canonicalKey}-${index}`} style={styles.muted}>• {description}</Text>
                  ))}
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.groupTitle}>Pending confirmation</Text>
          {context.pendingItems.length === 0 ? (
            <Text style={styles.emptyText}>No pending facts.</Text>
          ) : context.pendingItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{item.label || item.kind.replace(/_/g, ' ')}</Text>
              <Text style={styles.itemValue}>{valueLabel(item)}</Text>
              <Text style={styles.itemMeta}>{sourceLabel(item)}</Text>
              {item.exactExcerpt ? <Text style={styles.excerpt}>“{item.exactExcerpt}”</Text> : null}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.flexButton, Boolean(busyKey) && styles.disabled]}
                  disabled={Boolean(busyKey)}
                  onPress={() => void decideItem(item, 'confirm')}
                >
                  <Text style={styles.primaryButtonText}>Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryButton, styles.flexButton, Boolean(busyKey) && styles.disabled]}
                  disabled={Boolean(busyKey)}
                  onPress={() => void decideItem(item, 'reject')}
                >
                  <Text style={styles.secondaryButtonText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <Text style={styles.groupTitle}>Active facts</Text>
          {context.activeItems.length === 0 ? (
            <Text style={styles.emptyText}>No active confirmed facts yet. Rebuild or confirm pending facts first.</Text>
          ) : context.activeItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <Text style={styles.itemTitle}>{item.label || item.kind.replace(/_/g, ' ')}</Text>
              <Text style={styles.itemValue}>{valueLabel(item)}</Text>
              <Text style={styles.itemMeta}>{sourceLabel(item)} · {item.sensitivity.replace(/_/g, ' ')}</Text>
              <TouchableOpacity
                style={[styles.secondaryButton, Boolean(busyKey) && styles.disabled]}
                disabled={Boolean(busyKey)}
                onPress={() => {
                  Alert.alert('Revoke Career Context fact', 'Revoking removes this fact from future grounding without deleting its original source record.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Revoke', style: 'destructive', onPress: () => void decideItem(item, 'revoke') },
                  ]);
                }}
              >
                <Text style={styles.secondaryButtonText}>Revoke from grounding</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.bodyText}>No authoritative Career Context state could be loaded.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1329' },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#0b1329', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  title: { color: '#ffffff', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 20 },
  card: { backgroundColor: '#1a233d', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  errorCard: { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)' },
  warningCard: { backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)' },
  warningTitle: { color: '#fbbf24', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  errorText: { color: '#fecaca', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCell: { flex: 1, alignItems: 'center', backgroundColor: '#111c36', borderRadius: 12, paddingVertical: 13 },
  summaryNumber: { color: '#d4af37', fontSize: 22, fontWeight: '800' },
  summaryLabel: { color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', marginTop: 3 },
  versionText: { color: '#64748b', fontSize: 10, marginTop: 12, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  sectionTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800', marginBottom: 8 },
  groupTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800', marginTop: 8, marginBottom: 12 },
  bodyText: { color: '#cbd5e1', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  footnote: { color: '#64748b', fontSize: 11, lineHeight: 17, marginTop: 10 },
  muted: { color: '#94a3b8', fontSize: 12, lineHeight: 18 },
  itemCard: { backgroundColor: '#111c36', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  itemTitle: { color: '#ffffff', fontSize: 14, fontWeight: '800', marginBottom: 5 },
  itemValue: { color: '#e2e8f0', fontSize: 14, lineHeight: 20, marginBottom: 7 },
  itemMeta: { color: '#94a3b8', fontSize: 11, textTransform: 'capitalize', marginBottom: 7 },
  excerpt: { color: '#cbd5e1', fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginBottom: 12 },
  conflictItem: { borderTopWidth: 1, borderTopColor: 'rgba(245,158,11,0.16)', paddingTop: 10, marginTop: 8 },
  emptyText: { color: '#64748b', fontSize: 13, fontStyle: 'italic', marginBottom: 18 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  flexButton: { flex: 1 },
  primaryButton: { backgroundColor: '#d4af37', borderRadius: 11, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  primaryButtonText: { color: '#0b1329', fontSize: 12, fontWeight: '800' },
  secondaryButton: { borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)', borderRadius: 11, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', marginTop: 4 },
  secondaryButtonText: { color: '#d4af37', fontSize: 12, fontWeight: '800' },
  smallButton: { borderWidth: 1, borderColor: 'rgba(212,175,55,0.30)', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11, alignItems: 'center' },
  smallButtonText: { color: '#d4af37', fontSize: 11, fontWeight: '800' },
  disabled: { opacity: 0.45 },
});