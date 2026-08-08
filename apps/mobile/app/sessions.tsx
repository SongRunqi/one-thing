import { useEffect, useState } from 'react'
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useConnectionStore } from '../src/stores/connection'
import { useSessionsStore } from '../src/stores/sessions'

export default function SessionsScreen() {
  const router = useRouter()
  const target = useConnectionStore((s) => s.target)
  const connectionStatus = useConnectionStore((s) => s.status)
  const disconnect = useConnectionStore((s) => s.disconnect)
  const { sessions, loading, error, refresh, create } = useSessionsStore()
  const [newName, setNewName] = useState('')

  // Guard: landing here without a live connection means the stored target died.
  useEffect(() => {
    if (connectionStatus === 'idle') router.replace('/')
  }, [connectionStatus, router])

  useEffect(() => {
    if (target) void refresh(target)
  }, [target, refresh])

  async function handleCreate() {
    const name = newName.trim()
    if (!target || !name) return
    setNewName('')
    const session = await create(target, name)
    if (session) router.push(`/chat/${session.id}`)
  }

  return (
    <View style={styles.container}>
      <View style={styles.createRow}>
        <TextInput
          style={styles.createInput}
          placeholder="New session name"
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={handleCreate}
          returnKeyType="done"
        />
        <Pressable
          style={[styles.createButton, (!target || !newName.trim()) && styles.disabled]}
          disabled={!target || !newName.trim()}
          onPress={handleCreate}
        >
          <Text style={styles.createButtonText}>Create</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => target && void refresh(target)} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{loading ? 'Loading…' : 'No sessions yet.'}</Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.name || item.id}
            </Text>
            {item.previewText ? (
              <Text style={styles.rowSubtitle} numberOfLines={1}>{item.previewText}</Text>
            ) : item.updatedAt ? (
              <Text style={styles.rowSubtitle}>{new Date(item.updatedAt).toLocaleString()}</Text>
            ) : null}
          </Pressable>
        )}
      />

      <Pressable
        style={styles.disconnect}
        onPress={() => {
          void disconnect().then(() => router.replace('/'))
        }}
      >
        <Text style={styles.disconnectText}>Disconnect</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  createRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  createInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d7dbdf',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  createButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  createButtonText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.4 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eceef0',
  },
  rowTitle: { fontSize: 16, fontWeight: '500' },
  rowSubtitle: { fontSize: 12, color: '#687076', marginTop: 4 },
  empty: { textAlign: 'center', color: '#687076', marginTop: 48 },
  error: { color: '#c62828', marginBottom: 8 },
  disconnect: { alignItems: 'center', paddingVertical: 12 },
  disconnectText: { color: '#c62828', fontSize: 14 },
})
