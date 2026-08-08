import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import type { ChatMessage } from '@shared/ipc/chat.js'
import { useConnectionStore } from '../../src/stores/connection'
import { useMessagesStore } from '../../src/stores/messages'
import { subscribeSessionEvents, unsubscribeSessionEvents } from '../../src/lib/event-stream'

export default function ChatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const target = useConnectionStore((s) => s.target)
  const chat = useMessagesStore((s) => (sessionId ? s.bySession[sessionId] : undefined))
  const loadInitial = useMessagesStore((s) => s.loadInitial)
  const loadOlder = useMessagesStore((s) => s.loadOlder)
  const send = useMessagesStore((s) => s.send)
  const abort = useMessagesStore((s) => s.abort)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!target || !sessionId) return
    void loadInitial(target, sessionId)
    subscribeSessionEvents(target, sessionId)
    return () => unsubscribeSessionEvents(sessionId)
  }, [target, sessionId, loadInitial])

  // Inverted list: index 0 = newest.
  const listData = useMemo(() => [...(chat?.messages ?? [])].reverse(), [chat?.messages])
  const streaming = Boolean(chat?.streamingMessageId)

  async function handleSend() {
    const content = draft.trim()
    if (!target || !sessionId || !content || sending) return
    setDraft('')
    setSending(true)
    try {
      await send(target, sessionId, content)
    } finally {
      setSending(false)
    }
  }

  function handleAbort() {
    if (!target || !sessionId) return
    void abort(target, sessionId)
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.flex}>
        {!chat?.loaded ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            inverted
            data={listData}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            onEndReached={() => {
              if (target && sessionId) void loadOlder(target, sessionId)
            }}
            onEndReachedThreshold={0.2}
            ListFooterComponent={
              chat?.loadingOlder ? <ActivityIndicator style={styles.older} /> : null
            }
            renderItem={({ item }) => <MessageBubble message={item} />}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Message onething…"
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={!sending}
          />
          {streaming ? (
            <Pressable style={[styles.actionButton, styles.abortButton]} onPress={handleAbort}>
              <Text style={styles.actionText}>■</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.actionButton, (!draft.trim() || sending) && styles.disabled]}
              disabled={!draft.trim() || sending}
              onPress={handleSend}
            >
              <Text style={styles.actionText}>↑</Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'system') {
    return <Text style={styles.systemText}>{message.content}</Text>
  }
  const isUser = message.role === 'user'
  return (
    <View style={[styles.bubbleRow, isUser ? styles.rowRight : styles.rowLeft]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          message.role === 'error' && styles.errorBubble,
        ]}
      >
        <Text style={[styles.bubbleText, isUser && styles.userText]} selectable>
          {message.content}
          {message.isStreaming ? <Text style={styles.cursor}>▍</Text> : null}
        </Text>
        {message.errorDetails ? <Text style={styles.errorText}>{message.errorDetails}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 12, paddingVertical: 8 },
  older: { marginVertical: 12 },
  bubbleRow: { flexDirection: 'row', marginVertical: 4 },
  rowRight: { justifyContent: 'flex-end' },
  rowLeft: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  userBubble: { backgroundColor: '#0a7ea4', borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: '#eceef0', borderBottomLeftRadius: 4 },
  errorBubble: { backgroundColor: '#fdecea' },
  bubbleText: { fontSize: 15, lineHeight: 21, color: '#11181c' },
  userText: { color: '#fff' },
  cursor: { color: '#0a7ea4' },
  errorText: { fontSize: 12, color: '#c62828', marginTop: 4 },
  systemText: {
    alignSelf: 'center',
    fontSize: 12,
    color: '#687076',
    marginVertical: 8,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d7dbdf',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#d7dbdf',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0a7ea4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  abortButton: { backgroundColor: '#c62828' },
  actionText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  disabled: { opacity: 0.4 },
})
