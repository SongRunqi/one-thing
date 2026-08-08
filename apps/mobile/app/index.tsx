import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import type { ServerTarget } from '../src/lib/api'
import { useConnectionStore } from '../src/stores/connection'

export default function PairingScreen() {
  const router = useRouter()
  const { status, error, connect } = useConnectionStore()
  const [pairingJson, setPairingJson] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [host, setHost] = useState('')
  const [port, setPort] = useState('8787')
  const [token, setToken] = useState('')

  const connecting = status === 'connecting' || status === 'restoring'

  async function handleConnect(target: ServerTarget) {
    const ok = await connect(target)
    if (ok) router.replace('/sessions')
  }

  function handlePairingJson() {
    setParseError(null)
    try {
      // Accept the raw stdout line too: "[onething-server] pairing {...}"
      const jsonStart = pairingJson.indexOf('{')
      if (jsonStart < 0) throw new Error('no JSON found')
      const parsed = JSON.parse(pairingJson.slice(jsonStart)) as Partial<ServerTarget>
      if (typeof parsed.host !== 'string' || !parsed.host) throw new Error('missing "host"')
      if (typeof parsed.port !== 'number') throw new Error('missing "port"')
      if (typeof parsed.token !== 'string' || !parsed.token) throw new Error('missing "token"')
      void handleConnect({ host: parsed.host, port: parsed.port, token: parsed.token })
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid pairing JSON')
    }
  }

  function handleManual() {
    const portNumber = Number.parseInt(port, 10)
    if (!host.trim() || !Number.isFinite(portNumber) || !token.trim()) return
    void handleConnect({ host: host.trim(), port: portNumber, token: token.trim() })
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Paste pairing line</Text>
        <Text style={styles.hint}>
          From the server terminal: [onething-server] pairing {'{"host":...}'}
        </Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder='{"host":"192.168.1.5","port":8787,"token":"..."}'
          value={pairingJson}
          onChangeText={setPairingJson}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        {parseError ? <Text style={styles.error}>{parseError}</Text> : null}
        <Pressable
          style={[styles.button, (connecting || !pairingJson.trim()) && styles.buttonDisabled]}
          disabled={connecting || !pairingJson.trim()}
          onPress={handlePairingJson}
        >
          <Text style={styles.buttonText}>{connecting ? 'Connecting…' : 'Connect'}</Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or enter manually</Text>
          <View style={styles.dividerLine} />
        </View>

        <Text style={styles.label}>Host</Text>
        <TextInput
          style={styles.input}
          placeholder="192.168.1.5"
          value={host}
          onChangeText={setHost}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.label}>Port</Text>
        <TextInput
          style={styles.input}
          value={port}
          onChangeText={setPort}
          keyboardType="number-pad"
        />
        <Text style={styles.label}>Token</Text>
        <TextInput
          style={styles.input}
          placeholder="ONETHING_SERVER_TOKEN"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Pressable
          style={[styles.button, (connecting || !host.trim() || !token.trim()) && styles.buttonDisabled]}
          disabled={connecting || !host.trim() || !token.trim()}
          onPress={handleManual}
        >
          <Text style={styles.buttonText}>{connecting ? 'Connecting…' : 'Connect'}</Text>
        </Pressable>

        {error ? <Text style={styles.error}>Connection failed: {error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 20, gap: 8 },
  heading: { fontSize: 20, fontWeight: '600', marginBottom: 2 },
  hint: { fontSize: 12, color: '#687076', marginBottom: 6 },
  label: { fontSize: 13, color: '#687076', marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d7dbdf',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 },
  button: {
    backgroundColor: '#0a7ea4',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#9ba1a6' },
  dividerText: { fontSize: 12, color: '#9ba1a6' },
  error: { color: '#c62828', fontSize: 13, marginTop: 4 },
})
