import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useConnectionStore } from '../src/stores/connection'
import { initEventStreamAppStateHandler } from '../src/lib/event-stream'

export default function RootLayout() {
  const restore = useConnectionStore((s) => s.restore)

  useEffect(() => {
    initEventStreamAppStateHandler()
    void restore()
  }, [restore])

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerTitleAlign: 'center' }}>
        <Stack.Screen name="index" options={{ title: 'Connect to onething' }} />
        <Stack.Screen name="sessions" options={{ title: 'Sessions' }} />
        <Stack.Screen name="chat/[sessionId]" options={{ title: 'Chat' }} />
      </Stack>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  )
}
