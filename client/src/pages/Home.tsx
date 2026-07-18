import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import styles from './Home.module.scss'
import { useSocket } from '../context/SocketContext'
import { HudProvider, useHud } from '../context/HudContext'
import ChatMessage from '../components/chat/ChatMessage'
import CommandAutocomplete from '../components/chat/CommandAutocomplete'
import {
  getFilteredCommands,
  isCommandAutocompleteInput,
  resolveCommandInput,
} from '../utils/commandAutocomplete'
import Header from '../components/Header'
import Drawer from '../components/Drawer'
import HudContainer from '../components/hud/HudContainer'
import HudSettings from '../components/hud/HudSettings'
import MiniGameOverlay from '../components/minigame/MiniGameOverlay'
import type { ChatMessage as ChatMessageType, CommandInfo, PlayerStatsData, LocationInfoData, ChannelInfo, UserCountData, CompletionItem } from '@shared/types'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

function channelRoomKey(channel: string | null): string {
  return channel === null ? 'channel:main' : `channel:${channel}`
}

function getMentionQuery(input: string): string | null {
  const match = /^@([^\s]*)$/.exec(input.trimStart())
  return match?.[1] ?? null
}

function HomeContent() {
  const { socket, sessionInfo, updateProfileImage, updateNickname } = useSocket()
  const { playerStats, setPlayerStats, setLocationInfo } = useHud()
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [commandFilter, setCommandFilter] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [userCountData, setUserCountData] = useState<UserCountData>({ total: 0, channelCounts: {} })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [hudSettingsOpen, setHudSettingsOpen] = useState(false)
  const [currentChannel, setCurrentChannel] = useState<string | null>(null)
  const [channelList, setChannelList] = useState<ChannelInfo[]>([])
  const [dynamicCompletions, setDynamicCompletions] = useState<CompletionItem[]>([])
  const [mentionCompletions, setMentionCompletions] = useState<CompletionItem[]>([])
  const [informationPublic, setInformationPublic] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isComposing = useRef(false)

  useEffect(() => {
    if (!socket) return

    const onChatHistory = (history: ChatMessageType[]) => setMessages(history)
    const onChatMessage = (msg: ChatMessageType) => setMessages(prev => [...prev, msg])
    const onCommandList = (list: CommandInfo[]) => setCommands(list)
    const onUserCount = (data: UserCountData) => setUserCountData(data)
    const onPlayerStats = (data: PlayerStatsData) => setPlayerStats(data)
    const onLocationInfo = (data: LocationInfoData) => setLocationInfo(data)
    const onChannelChanged = (channel: string | null, history: ChatMessageType[]) => {
      setCurrentChannel(channel)
      setMessages(history)
    }
    const onChannelList = (list: Parameters<typeof setChannelList>[0]) => setChannelList(list)
    const onEditMessage = (id: string, content: ChatMessageType['content']) => {
      setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, content } : msg))
    }
    const onDeleteMessage = (id: string) => {
      setMessages(prev => prev.filter(msg => msg.id !== id))
    }
    const onArgCompletions = (items: CompletionItem[]) => setDynamicCompletions(items)
    const onMentionCompletions = (items: CompletionItem[]) => setMentionCompletions(items)
    const onInformationMode = (isPublic: boolean) => setInformationPublic(isPublic)

    socket.on('chatHistory', onChatHistory)
    socket.on('chatMessage', onChatMessage)
    socket.on('commandList', onCommandList)
    socket.on('userCount', onUserCount)
    socket.on('playerStats', onPlayerStats)
    socket.on('locationInfo', onLocationInfo)
    socket.on('channelChanged', onChannelChanged)
    socket.on('channelList', onChannelList)
    socket.on('editMessage', onEditMessage)
    socket.on('deleteMessage', onDeleteMessage)
    socket.on('argCompletions', onArgCompletions)
    socket.on('mentionCompletions', onMentionCompletions)
    socket.on('informationMode', onInformationMode)
    socket.emit('requestChatHistory')
    socket.emit('requestCommandList')
    socket.emit('requestUserCount')
    socket.emit('requestChannelList')
    socket.emit('requestInformationMode')

    return () => {
      socket.off('chatHistory', onChatHistory)
      socket.off('chatMessage', onChatMessage)
      socket.off('commandList', onCommandList)
      socket.off('userCount', onUserCount)
      socket.off('playerStats', onPlayerStats)
      socket.off('locationInfo', onLocationInfo)
      socket.off('channelChanged', onChannelChanged)
      socket.off('channelList', onChannelList)
      socket.off('editMessage', onEditMessage)
      socket.off('deleteMessage', onDeleteMessage)
      socket.off('argCompletions', onArgCompletions)
      socket.off('mentionCompletions', onMentionCompletions)
      socket.off('informationMode', onInformationMode)
    }
  }, [socket, setPlayerStats, setLocationInfo])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const changeNickname = useCallback((nickname: string): Promise<{ ok?: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ error: '소켓 연결 없음' })
      socket.once('nicknameResult', (result) => {
        if (result.ok && result.nickname) updateNickname(result.nickname)
        resolve(result)
      })
      socket.emit('changeNickname', nickname)
    })
  }, [socket, updateNickname])

  const sendMessage = useCallback(() => {
    const inputElement = inputRef.current;
    const content = inputRef.current?.textContent?.trim();
    if (!content || !socket) return;

    socket.emit('sendMessage', content);

    if(inputElement) {
      inputElement.textContent = '';
      if (document.activeElement !== inputElement) {
        inputElement.focus({ preventScroll: true });
      }
      const range = document.createRange();
      range.selectNodeContents(inputElement);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    setShowAutocomplete(false)
  }, [socket])

  const sendImage = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !socket) return
    if (!file.type.startsWith('image/')) {
      setMediaError('이미지 파일만 전송할 수 있습니다.')
      event.target.value = ''
      return
    }

    setImageUploading(true)
    setMediaError(null)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await fetch(`${SERVER_URL}/api/chat-image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await response.json() as { ok?: boolean; filename?: string; error?: string }
      if (!response.ok || !data.ok || !data.filename) {
        setMediaError(data.error ?? '이미지 업로드에 실패했습니다.')
        return
      }
      socket.emit('sendImageMessage', { filename: data.filename })
    } catch {
      setMediaError('이미지 업로드 중 오류가 발생했습니다.')
    } finally {
      setImageUploading(false)
      event.target.value = ''
    }
  }, [socket])

  const selectCommand = useCallback((name: string) => {
    if (!inputRef.current) return
    inputRef.current.textContent = `/${name} `
    const range = document.createRange()
    range.selectNodeContents(inputRef.current)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    inputRef.current.focus()
    setCommandFilter(inputRef.current.textContent ?? '')
    setActiveIndex(0)
  }, [])

  const handleInput = useCallback(() => {
    const text = inputRef.current?.textContent ?? ''
    setCommandFilter(text)
    if (getMentionQuery(text) !== null || isCommandAutocompleteInput(commands, text)) {
      setShowAutocomplete(true)
      setActiveIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }, [commands])

  const mentionQuery = useMemo(() => getMentionQuery(commandFilter), [commandFilter])

  // 명령어가 완성된 후 파라미터 입력 모드 계산
  const paramMode = useMemo(() => {
    const input = resolveCommandInput(commands, commandFilter)
    if (!input?.hasSeparator) return null
    const cmd = input.command
    if (!cmd?.args?.length) return null

    const argsText = input.remainder
    const argParts = argsText.split(' ')

    // text 파라미터 이후는 argIndex 증가 멈춤
    const textArgIdx = cmd.args.findIndex(a => a.isText)
    let argIndex = argParts.length - 1
    if (textArgIdx !== -1 && argIndex > textArgIdx) {
      const argsAfter = cmd.args.length - 1 - textArgIdx
      // text 이후 argsAfter개의 뒤쪽 인자 영역을 고려
      const afterStart = argParts.length - argsAfter
      argIndex = afterStart > textArgIdx ? textArgIdx + (argIndex - afterStart + 1) : textArgIdx
    }
    argIndex = Math.min(argIndex, cmd.args.length - 1)

    const currentArg = cmd.args[argIndex]
    const currentTyped = argParts[argParts.length - 1] ?? ''
    const isDynamic = currentArg.dynamicCompletions === true
    const allCompletions: CompletionItem[] = currentArg.completions ?? []
    const filtered = isDynamic ? [] : allCompletions.filter(c => {
      const val = typeof c === 'string' ? c : c.value
      return !currentTyped || val.toLowerCase().startsWith(currentTyped.toLowerCase())
    })

    return {
      arg: { ...currentArg, argIndex, totalArgs: cmd.args.length },
      completions: filtered,
      currentTyped,
      isDynamic,
    }
  }, [commandFilter, commands])

  // 동적 자동완성: 파라미터 입력 중 서버에 completions 요청
  useEffect(() => {
    if (!socket || !paramMode?.isDynamic) return
    socket.emit('requestCompletions', commandFilter)
  }, [socket, paramMode?.isDynamic, commandFilter])

  useEffect(() => {
    if (!socket || mentionQuery === null) return
    socket.emit('requestMentionCompletions', mentionQuery)
  }, [socket, mentionQuery])

  // 파라미터 자동완성 선택 시 해당 인자를 완성
  const selectCompletion = useCallback((value: string) => {
    if (!inputRef.current) return
    const text = (inputRef.current.textContent ?? '').trimStart()
    const firstSpace = text.search(/\s/)
    if (firstSpace === -1) return

    const cmdPart = text.slice(0, firstSpace + 1)           // "/cmd "
    const argsText = text.slice(firstSpace + 1)             // "a b c"
    const lastSpace = argsText.lastIndexOf(' ')
    const beforeLast = argsText.slice(0, lastSpace + 1)     // "a b "

    inputRef.current.textContent = `${cmdPart}${beforeLast}${value} `
    const range = document.createRange()
    range.selectNodeContents(inputRef.current)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    inputRef.current.focus()
    setCommandFilter(inputRef.current.textContent ?? '')
    setActiveIndex(0)
  }, [])

  const selectMention = useCallback((value: string) => {
    if (!inputRef.current) return
    inputRef.current.textContent = `@${value} `
    const range = document.createRange()
    range.selectNodeContents(inputRef.current)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    inputRef.current.focus()
    setCommandFilter(inputRef.current.textContent ?? '')
    setShowAutocomplete(false)
    setActiveIndex(0)
  }, [])

  const autocompleteHint = mentionQuery !== null
    ? {
        name: '귓속말 대상',
        description: '귓속말을 보낼 온라인 플레이어',
        required: true,
        argIndex: 0,
        totalArgs: 1,
      }
    : paramMode?.arg
  const autocompleteCompletions = mentionQuery !== null
    ? mentionCompletions
    : paramMode?.isDynamic ? dynamicCompletions : paramMode?.completions

  const getFilteredCount = useCallback(() => {
    if (mentionQuery !== null) return mentionCompletions.length
    if (paramMode) return paramMode.isDynamic ? dynamicCompletions.length : paramMode.completions.length
    return getFilteredCommands(commands, commandFilter).length
  }, [commandFilter, commands, paramMode, dynamicCompletions, mentionQuery, mentionCompletions])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showAutocomplete) {
      const count = getFilteredCount()
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(prev => (prev - 1 + Math.max(1, count)) % Math.max(1, count)); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(prev => (prev + 1) % Math.max(1, count)); return }
      if (e.key === 'Tab') {
        e.preventDefault()
        if (mentionQuery !== null) {
          const item = mentionCompletions[activeIndex]
          if (item) selectMention(typeof item === 'string' ? item : item.value)
        } else if (paramMode) {
          const items = paramMode.isDynamic ? dynamicCompletions : paramMode.completions
          const item = items[activeIndex]
          if (item) selectCompletion(typeof item === 'string' ? item : item.value)
        } else {
          const filtered = getFilteredCommands(commands, commandFilter)
          if (filtered[activeIndex]) selectCommand(filtered[activeIndex].name)
        }
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); setShowAutocomplete(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !isComposing.current) { e.preventDefault(); sendMessage() }
  }, [showAutocomplete, getFilteredCount, commandFilter, commands, activeIndex, selectCommand, selectCompletion, selectMention, sendMessage, paramMode, dynamicCompletions, mentionQuery, mentionCompletions])

  const lifeRatio  = playerStats ? Math.max(0, playerStats.life / playerStats.maxLife) : 1
  const mpRatio    = playerStats ? Math.max(0, playerStats.mentality / playerStats.maxMentality) : 1

  return (
    <div className={styles.homeContainer}>
      <div className={styles.chatArea}>
        <Header
          totalCount={userCountData.total}
          channelCount={userCountData.channelCounts[channelRoomKey(currentChannel)] ?? 0}
          onMenuClick={() => setDrawerOpen(true)}
          channelName={
            sessionInfo && currentChannel === `private_${sessionInfo.userId}`
              ? '개인 채널'
              : channelList.find(ch => ch.id === currentChannel)?.name ?? '메인'
          }
        />
        <div className={styles.chatMessages}>
          {messages.map((msg, i) => {
            const prev = messages[i - 1]
            const showHeader = i === 0
              || prev.userId !== msg.userId
              || prev.nickname !== msg.nickname
              || prev.profileImage !== msg.profileImage
              || JSON.stringify(prev.flags) !== JSON.stringify(msg.flags)
              || Math.floor(prev.timestamp / 60000) !== Math.floor(msg.timestamp / 60000)
            return <ChatMessage key={msg.id ?? i} message={msg} showHeader={showHeader} />
          })}
          <div ref={messagesEndRef} />
        </div>
        <div className={styles.statusBars}>
          <div className={styles.hpBar}>
            <div className={styles.hpFill} style={{ width: `${lifeRatio * 100}%` }} />
          </div>
          <div className={styles.mpBar}>
            <div className={styles.mpFill} style={{ width: `${mpRatio * 100}%` }} />
          </div>
        </div>
        <div className={styles.chatInput}>
          {showAutocomplete && (
            <CommandAutocomplete
              commands={commands}
              filter={commandFilter}
              activeIndex={activeIndex}
              onSelect={selectCommand}
              paramHint={autocompleteHint}
              paramCompletions={autocompleteCompletions}
              onSelectCompletion={mentionQuery !== null ? selectMention : selectCompletion}
            />
          )}
          {mediaError && <span className={styles.mediaError} role="alert">{mediaError}</span>}
          <input
            ref={mediaInputRef}
            className={styles.mediaInput}
            type="file"
            accept="image/*"
            onChange={sendImage}
          />
          <button
            type="button"
            className={styles.mediaButton}
            aria-label={imageUploading ? '이미지 업로드 중' : '이미지 전송'}
            title={imageUploading ? '이미지 업로드 중' : '이미지 전송'}
            disabled={imageUploading}
            onPointerDown={event => event.preventDefault()}
            onClick={() => mediaInputRef.current?.click()}
          >
            {imageUploading ? (
              <span className={styles.mediaSpinner} aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5.5h16v13H4zM7 15l3-3 2.5 2.5 2-2 2.5 2.5M8.5 9a1.25 1.25 0 1 0 0 .01" />
              </svg>
            )}
          </button>
          <div
            ref={inputRef}
            className={styles.chatInputField}
            contentEditable
            role="textbox"
            data-placeholder="메시지를 입력하세요"
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              isComposing.current = true;
            }}
            onCompositionEnd={() => {
              isComposing.current = false;
            }}
          />
          <button
            type="button"
            className={`${styles.visibilityButton} ${informationPublic ? styles.visibilityPublic : styles.visibilityPrivate}`}
            aria-pressed={informationPublic}
            title={`정보 열람 ${informationPublic ? '공개' : '비공개'}모드`}
            onPointerDown={event => event.preventDefault()}
            onClick={() => socket?.emit('setInformationMode', !informationPublic)}
          >
            {informationPublic ? '공개' : '비공개'}
          </button>
          <button
            type="button"
            onPointerDown={event => event.preventDefault()}
            onClick={sendMessage}
          >전송</button>
        </div>
      </div>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        nickname={sessionInfo?.nickname}
        profileImage={sessionInfo?.profileImage}
        onProfileUpdate={updateProfileImage}
        onChangeNickname={changeNickname}
        userId={sessionInfo?.userId}
        currentChannel={currentChannel}
        channelList={channelList}
        channelCounts={userCountData.channelCounts}
        onJoinChannel={(channel) => socket?.emit('joinChannel', channel)}
        onOpenHudSettings={() => { setDrawerOpen(false); setHudSettingsOpen(true) }}
        permission={sessionInfo?.permission}
        onOpenAdmin={() => {
          setDrawerOpen(false)
          const adminWindow = window.open('/admin', '_blank')
          if (adminWindow) adminWindow.opener = null
        }}
      />
      <HudContainer />
      <MiniGameOverlay />
      {hudSettingsOpen && <HudSettings onClose={() => setHudSettingsOpen(false)} />}
    </div>
  )
}

export default function Home() {
  return (
    <HudProvider>
      <HomeContent />
    </HudProvider>
  )
}
