import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function OnboardingScreen() {
  const [role, setRole] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'entry' | 'mid' | 'senior'>('mid');
  const [goal, setGoal] = useState<'interview_practice' | 'resume_ats_optimization' | 'english_speaking_skills'>('interview_practice');
  const router = useRouter();

  const handleComplete = async () => {
    if (!role.trim()) {
      Alert.alert('Target Role Required', 'Please enter the role you are preparing for (e.g. Software Engineer).');
      return;
    }

    try {
      const profile = {
        name: 'MockMate User',
        targetRole: role.trim(),
        experienceLevel,
        primaryGoal: goal,
      };

      await AsyncStorage.setItem('mockmate_user_profile', JSON.stringify(profile));
      router.replace('/(app)');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to save your preferences. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.stepText}>STEP 1 OF 1</Text>
          <Text style={styles.title}>Tailor Your Coach</Text>
          <Text style={styles.subtitle}>Set up practice that fits your job goal.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>What is your target role?</Text>
          <TextInput
            style={styles.input}
            value={role}
            onChangeText={setRole}
            placeholder="e.g. Frontend developer, Product Manager"
            placeholderTextColor="#64748b"
            autoCorrect={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Experience Level</Text>
          <View style={styles.optionRow}>
            {(['entry', 'mid', 'senior'] as const).map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.optionButton,
                  experienceLevel === level && styles.optionButtonActive,
                ]}
                onPress={() => setExperienceLevel(level)}
              >
                <Text
                  style={[
                    styles.optionText,
                    experienceLevel === level && styles.optionTextActive,
                  ]}
                >
                  {level.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Primary Focus Area</Text>
          <View style={styles.verticalOptionCol}>
            {[
              { id: 'interview_practice', title: 'Interview practice', desc: 'Practice role-specific questions and get clear feedback.' },
              { id: 'resume_ats_optimization', title: 'ATS resume review', desc: 'Check and improve your resume for applicant systems.' },
              { id: 'english_speaking_skills', title: 'Spoken English practice', desc: 'Record short prompts and improve clarity, pace, and word choice.' },
            ].map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.cardOption,
                  goal === option.id && styles.cardOptionActive,
                ]}
                onPress={() => setGoal(option.id as any)}
              >
                <Text style={[styles.cardOptionTitle, goal === option.id && styles.cardOptionTitleActive]}>
                  {option.title}
                </Text>
                <Text style={styles.cardOptionDesc}>{option.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
          <Text style={styles.completeButtonText}>Open practice home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1329',
  },
  scrollContainer: {
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 32,
    marginTop: 20,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#d4af37',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 8,
    lineHeight: 22,
  },
  section: {
    marginBottom: 28,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#1a233d',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  optionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionButton: {
    flex: 1,
    backgroundColor: '#1a233d',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  optionButtonActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderColor: '#d4af37',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.8,
  },
  optionTextActive: {
    color: '#d4af37',
  },
  verticalOptionCol: {
    gap: 12,
  },
  cardOption: {
    backgroundColor: '#1a233d',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardOptionActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.06)',
    borderColor: '#d4af37',
  },
  cardOptionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  cardOptionTitleActive: {
    color: '#d4af37',
  },
  cardOptionDesc: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
  },
  completeButton: {
    backgroundColor: '#d4af37',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: '#d4af37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0b1329',
  },
});
