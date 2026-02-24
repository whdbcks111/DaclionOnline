import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './Home.module.scss'
import { useSocket } from '../context/SocketContext'
import { HudProvider, useHud } from '../context/HudContext'
import ChatMessage from '../components/chat/ChatMessage'
import CommandAutocomplete, { getFilteredCommands } from '../components/chat/CommandAutocomplete'
import Header from '../components/Header'
import Drawer from '../components/Drawer'
import HudContainer from '../components/hud/HudContainer'
import HudSettings from '../components/hud/HudSettings'
import type { ChatMessage as ChatMessageType, CommandInfo, PlayerStatsData, ChannelInfo } from '@shared/types'

function HomeContent() {
  const { socket, sessionInfo, updateProfileImage, updateNickname } = useSocket()
  const { playerStats, setPlayerStats } = useHud()
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [commandFilter, setCommandFilter] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [userCount, setUserCount] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [hudSettingsOpen, setHudSettingsOpen] = useState(false)
  const [currentChannel, setCurrentChannel] = useState<string | null>(null)
  const [channelList, setChannelList] = useState<ChannelInfo[]>([])
  const inputRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!socket) return

    const onChatHistory = (history: ChatMessageType[]) => setMessages(history)
    const onChatMessage = (msg: ChatMessageType) => setMessages(prev => [...prev, msg])
    const onCommandList = (list: CommandInfo[]) => setCommands(list)
    const onUserCount = (count: number) => setUserCount(count)
    const onPlayerStats = (data: PlayerStatsData) => setPlayerStats(data)
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

    socket.on('chatHistory', onChatHistory)
    socket.on('chatMessage', onChatMessage)
    socket.on('commandList', onCommandList)
    socket.on('userCount', onUserCount)
    socket.on('playerStats', onPlayerStats)
    socket.on('channelChanged', onChannelChanged)
    socket.on('channelList', onChannelList)
    socket.on('editMessage', onEditMessage)
    socket.on('deleteMessage', onDeleteMessage)
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
      socket.off('channelChanged', onChannelChanged)
      socket.off('channelList', onChannelList)
      socket.off('editMessage', onEditMessage)
      socket.off('deleteMessage', onDeleteMessage)
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

  const getFilteredCount = useCallback(() => {
    return getFilteredCommands(commands, commandFilter).length
  }, [commandFilter, commands])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showAutocomplete) {
      const count = getFilteredCount()
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(prev => (prev - 1 + count) % count); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(prev => (prev + 1) % count); return }
      if (e.key === 'Tab') {
        e.preventDefault()
        const filtered = getFilteredCommands(commands, commandFilter)
        if (filtered[activeIndex]) selectCommand(filtered[activeIndex].name)
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); setShowAutocomplete(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }, [showAutocomplete, getFilteredCount, commandFilter, commands, activeIndex, selectCommand, sendMessage])

  const lifeRatio  = playerStats ? Math.max(0, playerStats.life / playerStats.maxLife) : 1
  const mpRatio    = playerStats ? Math.max(0, playerStats.mentality / playerStats.maxMentality) : 1

  return (
    <div className={styles.homeContainer}>
      <div className={styles.chatArea}>
        <Header
          userCount={userCount}
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
