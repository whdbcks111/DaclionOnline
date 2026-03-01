import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import styles from './Home.module.scss'
import { useSocket } from '../context/SocketContext'
import { HudProvider, useHud } from '../context/HudContext'
import ChatMessage from '../components/chat/ChatMessage'
import CommandAutocomplete, { getFilteredCommands } from '../components/chat/CommandAutocomplete'
import Header from '../components/Header'
import Drawer from '../components/Drawer'
import HudContainer from '../components/hud/HudContainer'
import HudSettings from '../components/hud/HudSettings'
import type { ChatMessage as ChatMessageType, CommandInfo, PlayerStatsData, LocationInfoData, ChannelInfo, UserCountData, CompletionItem } from '@shared/types'

function channelRoomKey(channel: string | null): string {
  return channel === null ? 'channel:main' : `channel:${channel}`
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
  const inputRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
    socket.emit('requestChatHistory')
    socket.emit('requestCommandList')
    socket.emit('requestUserCount')
    socket.emit('requestChannelList')

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
    }
  }, [socket, setPlayerStats])

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
    const content = inputRef.current?.textContent?.trim()
    if (!content || !socket) return
    socket.emit('sendMessage', content)
    inputRef.current!.textContent = ''
    inputRef.current!.focus()
    setShowAutocomplete(false)
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
    if (text.startsWith('/')) {
      setCommandFilter(text)
      setShowAutocomplete(true)
      setActiveIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }, [])

  // 명령어가 완성된 후 파라미터 입력 모드 계산
  const paramMode = useMemo(() => {
    if (!commandFilter.startsWith('/')) return null
    const afterSlash = commandFilter.slice(1)
    const spaceIdx = afterSlash.indexOf(' ')
    if (spaceIdx === -1) return null

    const cmdName = afterSlash.slice(0, spaceIdx).toLowerCase()
    const cmd = commands.find(c =>
      c.name === cmdName || c.aliases?.includes(cmdName)
    )
    if (!cmd?.args?.length) return null

    const argsText = afterSlash.slice(spaceIdx + 1)
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
    if (!socket || !paramMode?.isDynamic) {
      setDynamicCompletions([])
      return
    }
    socket.emit('requestCompletions', commandFilter)
  }, [socket, paramMode?.isDynamic, commandFilter])

  // 파라미터 자동완성 선택 시 해당 인자를 완성
  const selectCompletion = useCallback((value: string) => {
    if (!inputRef.current) return
    const text = inputRef.current.textContent ?? ''
    const firstSpace = text.indexOf(' ')
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

  const getFilteredCount = useCallback(() => {
    if (paramMode) return paramMode.isDynamic ? dynamicCompletions.length : paramMode.completions.length
    return getFilteredCommands(commands, commandFilter).length
  }, [commandFilter, commands, paramMode, dynamicCompletions])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showAutocomplete) {
      const count = getFilteredCount()
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(prev => (prev - 1 + Math.max(1, count)) % Math.max(1, count)); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(prev => (prev + 1) % Math.max(1, count)); return }
      if (e.key === 'Tab') {
        e.preventDefault()
        if (paramMode) {
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }, [showAutocomplete, getFilteredCount, commandFilter, commands, activeIndex, selectCommand, selectCompletion, sendMessage, paramMode, dynamicCompletions])

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
              paramHint={paramMode?.arg}
              paramCompletions={paramMode?.isDynamic ? dynamicCompletions : paramMode?.completions}
              onSelectCompletion={selectCompletion}
            />
          )}
          <div
            ref={inputRef}
            className={styles.chatInputField}
            contentEditable
            role="textbox"
            data-placeholder="메시지를 입력하세요"
            onInput={handleInput}
            onKeyDown={handleKeyDown}
          />
          <button onClick={sendMessage}>전송</button>
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
      />
      <HudContainer />
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
