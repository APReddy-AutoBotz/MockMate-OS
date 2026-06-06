import React from 'react';
import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#0b1329',
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: '700',
        },
        contentStyle: {
          backgroundColor: '#0b1329',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="resume"
        options={{
          title: 'ATS Resume review',
        }}
      />
      <Stack.Screen
        name="speak"
        options={{
          title: 'ClearSpeak Voice Coach',
        }}
      />
      <Stack.Screen
        name="interview"
        options={{
          title: 'Interview Practice',
        }}
      />
      <Stack.Screen
        name="journal"
        options={{
          title: 'Practice Journal',
        }}
      />
    </Stack>
  );
}
